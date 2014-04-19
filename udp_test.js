var udp = require("dgram");
var server = udp.createSocket("udp4");
server.bind(1234);
server.on("message", function(msg, rinfo){
	console.log(rinfo.address+":"+rinfo.port + " " + msg);
});
//TODO: listen for user input to send messages to bridge