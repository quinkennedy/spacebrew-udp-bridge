#!/usr/bin/env node
var oscR = require("osc-receiver");
var oscE = require("osc-emitter");
var Handlebars = require("handlebars");
var udp = require("dgram");
var sys = require("sys");
var WebSocketClient = require("ws");
//fs used for file read/write
var fs = require("fs");
//stdin used for user input
var stdin = process.openStdin();

var port = 9092;
var defaultHost = "localhost";
var defaultPort = 9000;
var DEBUG = true;
var clientID = 0;
var wsClient;

var Publishers = {udp:[], osc:{servers:{}, configs:[]}};
var Subscribers = {};
var clientName;
var clientDescription;

/*

Node.js program that bridges communication between Spacebrew (Websocket-based) 
and UDP (also supports OSC via UDP)

This program acts as one Client to the Spacebrew Server and forwards incoming 
UDP/OSC messages to Spacebrew, and parrots incoming Spcabrew messages 
to UDP/OSC.

*/

/**
 * A function that processes arguments provided on the command-line
 */
var processArguments = function(){
    var argv = process.argv;
    for(var i = 2; i < argv.length; i++){
        switch(argv[i]){
            case "--host":
                setDefaultHost(argv[++i]);
                break;
            case "-p":
            case "--port":
                setDefaultPort(argv[++i]);
                break;
            case "-h":
            case "--help":
                printHelp();
                break;
            case "-l":
            case "--log":
                console.log('TODO: implement log flag');
                break;
            case "--loglevel":
                console.log("TODO: implement loglevel flag");
                break;
        }
    }
};

var defaultPort = 9000;
/**
 * Set the port of the spacebrew server. defaults to 9000. 
 * Can be overridden using the flag -p or --port when starting up the persistent router.
 * node node_persistent_admin.js -p 9011
 * @type {Number}
 */
var setDefaultPort = function(newPort){
    var tempPort = parseInt(newPort);
    //check that tempPort != NaN
    //and that the port is in the valid port range
    if (tempPort == tempPort &&
        tempPort >= 1 && tempPort <= 65535){
        defaultPort = tempPort;
    }
};

var defaultHost = "localhost";
var setDefaultHost = function(newHost){
    defaultHost = newHost;
}

var printHelp = function(){
    console.log("command line parameters:");
    console.log("\t--port (-p): set the port of the spacebrew server (default 9000)");
    console.log("\t--host: the hostname of the spacebrew server (default localhost)");
    console.log("\t--help (-h): print this help text");
    console.log("\t--log (-l): not yet implemented");
    console.log("\t--loglevel: not yet implemented");
    console.log("examples:");
    console.log("\tnode bridge.js -p 9011 -s 9094");
    console.log("\tnode bridge.js -h my-sweet-computer");
};

var forceClose = false;
var doPing = true;

processArguments();

//print out info:
var l = console.log;
l("This is a CLI tool for bridging Spacebrew/UDP communication.");
l("commands:");
l("  ls, pub, sub, connect, save, load, help, exit");

/**
 * The function that takes a string input command, and does with it as appropriate.
 * @param  {string} command the command to run
 */
var runCommand = function(command){
    //strip leading and trailing spaces
    command = clean(command.toString());
    if (command == "ls"){
        //print out my client definition
    } else if (command.indexOf("pub") == 0){
        addPublisher(command);
    } else if (command.indexOf("sub") == 0){
        addSubscriber(command);
    } else if (command.indexOf("connect") == 0){
        doConnect(command);
    } else if (command == "help"){
        printHelpText();
    } else if (command == 'exit'){
        process.exit();
    } else {
        l("unrecognized command, use \"help\" to see valid commands");
    }
};

var doConnect = function(command){
    command = command.substr("connect ".length);
    var commaIndex = command.indexOf(",");
    clientName = command.substr(0, commaIndex);
    clientDescription = command.substr(commaIndex+1);
    setupWSClient();
};

/**
 * Utility function for stripping out whitespaces
 * @param  {string} str The string input by stupid user
 * @return {string}     The string without leading or trailing whitespace
 */
var clean = function(str){
    return str.replace(/(^\s*|\s*$)/g,'');
};

/**
 * Splits the first element off of the provided comma-separated list.
 * @param  {string} input A comma-separated list of elements
 * @return {string array}       The first element is the first element of the provided list, the second element is the rest of the list.
 */
var getNext = function(input){
    var commaIndex = input.indexOf(",");
    if (commaIndex == -1){
        return [input, undefined];
    }
    return [clean(input.substr(0, commaIndex)),clean(input.substr(commaIndex+1))];
}

/**
 * implementation fuction for adding a Subscriber specification to the program.
 * @param {string} command User-input command which is used for adding a Subscriber.
 */
var addSubscriber = function(command){
    command = command.substr("sub ".length);
    var tmp = getNext(command);
    var type = tmp[0];
    command = tmp[1];
    if (type == "udp"){
        var isWrongFormat = function(command){if (command == undefined){l("command must be in expected format: sub udp,<HOST>,<PORT>,<SUB_NAME>,<TYPE>,<MSG_TEMPLATE>"); return true;} return false;};
        if (isWrongFormat(command)){return;}
        var sub = {output:type};
        tmp = getNext(command);
        sub.host = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        sub.port = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        sub.sub_name = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        sub.type = tmp[0];
        sub.raw_template = tmp[1];
        if (isWrongFormat(sub.raw_template)){return;}
        sub.template = Handlebars.compile(sub.raw_template);
        if (Subscribers[sub.type] == undefined){
            Subscribers[sub.type] = {};
        } else if (Subscribers[sub.type][sub.sub_name] != undefined){
            l("duplicate subscriber with name " + sub.sub_name + " and type " + sub.type + " already registered");
            return;
        }
        Subscribers[sub.type][sub.sub_name] = sub;
        configureClient();
    } else if (type == "osc"){
        var isWrongFormat = function(command){if (command == undefined){l("command must be in expected format: sub osc,<HOST>,<PORT>,<SUB_NAME>,<TYPE>,<PATH_TEMPLATE>"); return true;} return false;};
        if (isWrongFormat(command)){return;}
        var sub = {output:type};
        tmp = getNext(command);
        sub.host = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        sub.port = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        sub.sub_name = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        sub.type = tmp[0];
        sub.raw_template = tmp[1];
        if (isWrongFormat(sub.raw_template)){return;}
        sub.template = Handlebars.compile(sub.raw_template);
        if (Subscribers[sub.type] == undefined){
            Subscribers[sub.type] = {};
        } else if (Subscribers[sub.type][sub.sub_name] != undefined){
            l("duplicate subscriber with name " + sub.sub_name + " and type " + sub.type + " already registered");
            return;
        }
        Subscribers[sub.type][sub.sub_name] = sub;
        configureClient();
    } else {
        l("unrecognized type: " + type);
    }
};

/**
 * implementation fuction for adding a Publisher specification to the program.
 * @param {string} command User-input command which is used for adding a Publisher.
 */
var addPublisher = function(command){
    command = command.substr("pub ".length);
    var tmp = getNext(command);
    var type = tmp[0];
    command = tmp[1];
    if (type == "udp"){
        var isWrongFormat = function(command){if (command == undefined){l("command must be in expected format: pub udp,<HOST>,<PORT>,<PUB_NAME>,<TYPE>"); return true;} return false;};

        //parse command
        if (isWrongFormat(command)){return;}
        var pub = {input:type};
        tmp = getNext(command);
        pub.host = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        pub.port = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        pub.pub_name = tmp[0];
        pub.type = tmp[1];
        if (isWrongFormat(sub.type)){return;}

        //setup socket
        pub.server = udp.createSocket("udp4");
        pub.server.on("error", function(err){
            l("error while binding: " + err);
        });
        pub.server.on("message", function(msg, rinfo){
            if (wsClient == undefined || wsClient.readyState != OPEN){
                if (DEBUG){
                    l("not connected to Spacebrew yet, UDP message dropped");
                }
            } else {
                var toSend = {message:{clientName:clientName,name:this.pub_name,type:this.type,value:msg}};

                try{
                    wsClient.send(JSON.stringify(toSend));
                }
                catch (error){
                    l("error while routing UDP->SB: " + error.name + ", " + error.message);
                }
            }
        }.bind(pub));
        pub.server.bind(pub.port, pub.host);

        Publishers.udp.push(pub);
        configureClient();
    } else if (type == "osc"){
        var isWrongFormat = function(command){if (command == undefined){l("command must be in expected format: pub osc,<PORT>,<PATH>,<PUB_NAME>,<TYPE>"); return true;} return false;};

        //parse command
        if (isWrongFormat(command)){return;}
        var pub = {input:type};
        tmp = getNext(command);
        pub.port = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        pub.path = tmp[0];
        command = tmp[1];
        if (isWrongFormat(command)){return;}
        tmp = getNext(command);
        pub.pub_name = tmp[0];
        pub.type = tmp[1];
        if (isWrongFormat(sub.type)){return;}

        //setup socket
        var server = Publishers.osc.servers[pub.port]
        if (server == undefined){
            server = new oscR();
            server.on("error", function(err){
                l("error while binding: " + err);
            });
            server.on("listening", function(){
               Publishers.osc.servers[pub.port] = server;
            });
            server.bind(pub.port);
        }
        server.on(pub.path, function(msg){
            if (wsClient == undefined || wsClient.readyState != OPEN){
                if (DEBUG){
                    l("not connected to Spacebrew yet, OSC message dropped");
                }
            } else {
                var toSend = {message:{clientName:clientName,name:pub.pub_name,type:pub.type,value:msg}};

                try{
                    wsClient.send(JSON.stringify(toSend));
                }
                catch (error){
                    l("error while routing UDP->SB: " + error.name + ", " + error.message);
                }
            }
        });

        Publishers.osc.configs.push(pub);
        configureClient();
    } else {
        l("unrecognized type: " + type);
    }
};

/**
 * Here we process each line of input from the user
 * @param  {obj} command Some command object that I can .toString to get the raw user input
 */
stdin.on('data',function(command){
    runCommand(command.toString());
});

var printHelpText = function(){
    l("This is a CLI tool for bridging Spacebrew/UDP communication.");
    l("commands:");
    l("  ls");
    l("    lists the client definition for this tool");
    l("  pub udp,<HOST>,<PORT>,<PUB_NAME>,<TYPE>");
    l("  pub osc,<PORT>,<PATH>,<PUB_NAME>,<TYPE>");
    l("  sub udp,<HOST>,<PORT>,<SUB_NAME>,<TYPE>,<MSG_TEMPLATE>");
    l("  sub osc,<HOST>,<PORT>,<SUB_NAME>,<TYPE>,<PATH_TEMPLATE>");
    l("  connect <CLIENT_NAME>,<DESCRIPTION>");
    l("  save");
    l("    saves the current persistent route list to disk");
    l("  load");
    l("    overwrites the current persistent route list with the one on disk");
    l("    when the server starts up, it will automatically load an existing list from disk");
    l("  exit");
    l("    quits this persistent route admin (same as [ctrl]+c)");
};

/**
 * Called when we receive a message from the Server.
 * @param  {websocket message} data The websocket message from the Server
 */
var receivedMessage = function(data, flags){
    // console.log(data);
    if (data){
        var json = JSON.parse(data);
        //TODO: check if json is an array, otherwise use it as solo message
        //when we hit a malformed message, output a warning
        if (!handleMessage(json)){
            for(var i = 0, end = json.length; i < end; i++){
                handleMessage(json[i]);
            }
        }
    }
};

var setupWSClient = function(){ 
    // create the wsclient and register as an admin
    wsClient = new WebSocketClient("ws://"+defaultHost+":"+defaultPort);
    wsClient.on("open", function(conn){
        console.log("connected");
        configureClient();
    });
    wsClient.on("message", receivedMessage);
    wsClient.on("error", function(){
        l("ERROR"); 
        l(arguments);
        l("attempting reconnect in 5 seconds...");
        setTimeout(function(){setupWSClient();}, 5000);
    });
    wsClient.on("close", function(){
        l("CLOSE"); 
        l(arguments);
        l("attempting reconnect in 5 seconds...");
        setTimeout(function(){setupWSClient();}, 5000);
    });
}

/**
 * Ready States [copied from WebSocket.js]
 */

var CONNECTING = 0;
var OPEN = 1;
var CLOSING = 2;
var CLOSED = 3;

/**
 * Sends the client's config to the SB server. Will only send if it is already
 * connected to the SB server.
 */
var configureClient = function() {
    //can't send config if websocket is not open
    //TODO: check that we are actually registered with the admin?
    if (wsClient == undefined || wsClient.readyState !== OPEN){
        return;
    }

    //setup bare-minimum config
    var config = {config:{
        name:clientName,
        description:clientDescription,
        subscribe:{messages:[]},
        publish:{messages:[]}
    }};

    //add subscribers
    for (var type in Subscribers){
        var clients = Subscribers[type];
        for (var name in clients){
            config.config.subscribe.messages.push({name:name, type:type});
        }
    }

    //add publishers
    for (var i = Publishers.udp.length - 1; i >= 0; i--) {
        var client = Publishers.udp[i];
        config.config.publish.messages.push({name:client.pub_name, type:client.type});
    };
    for (var i = Publishers.osc.configs.length - 1; i >= 0; i--) {
        var client = Publishers.osc.configs[i];
        config.config.publish.messages.push({name:client.pub_name, type:client.type});
    };

    //send config to SB server
    var jsonConfig = JSON.stringify(config);
    if (DEBUG){
        sys.puts("jsonConfig: " + jsonConfig);
    }

    try{
        wsClient.send(jsonConfig);
    }
    catch (error){
        output.error = true;
        output.messages.push("Error while sending config: " + error.name + " msg: " + error.message);
    }
};

/**
 * Handle the json data from the Server and forward it to the appropriate function
 * @param  {json} json The message sent from the Server
 * @return {boolean}      True iff the message was a recognized type
 */
var handleMessage = function(json) {
    if (json.message){
        var routingData = Subscribers[json.message.type][json.message.name];
        if (routingData.output == "osc"){
            var emitter = new oscE();
            emitter.add(routingData.host, routingData.port);
            emitter.emit(routingData.template(json.message), json.message.value);
            l("forwarded message via OSC");
        } else if (routingData.output == "udp"){
            var message = new Buffer(routingData.template(json.message));
            var client = udp.createSocket("udp4");
            client.send(message, 0, message.length, routingData.port, routingData.host, function(err, bytes){
                client.close();
                if (err){
                    l("ERROR WHILE SENDING: " + err);
                } else {
                    l("forwarded message via UDP");
                }
            });
        }
    } else if (json.admin){
    } else if (json.config){
    } else if (json.route){
    } else if (json.remove){
    } else {
        return false;
    }
    return true;
};
