var oscR = require("osc-receiver");
var server = new oscR();
server.bind(1235);
server.on("/my_client!/TEST2/string",function(msg){
	console.log(msg);
});
//TODO: listen for user input to send messages to bridge