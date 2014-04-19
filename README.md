This is a program for translating messages between Spacebrew and UDP. This program also supports OSC messages via UDP.



Tested with NODEjs v0.10.26 on OSX 10.7.5

##Dependencies
```
npm install ws
npm install osc-receiver
npm install osc-emitter
npm install handlebars
```

##Usage
Lines with `>` are input by the user
####For setting up UDP subscribers:
```
<o_O>./bridge.js 
  This is a CLI tool for bridging Spacebrew/UDP communication.
  commands:
    ls, pub, sub, connect, save, load, help, exit
> sub udp,10.1.2.5,9092,rhino_test,string,{{value}}
> connect
  connected
  jsonConfig: {"config":{"name":"","description":"","subscribe":{"messages":[{"name":"rhino_test","type":"string"}]},"publish":{"messages":[]}}}
  forwarded message via UDP
> sub udp,10.1.2.5,9092,bool_test,boolean,{{value}}
  jsonConfig: {"config":{"name":"","description":"","subscribe":{"messages":[{"name":"rhino_test","type":"string"},{"name":"bool_test","type":"boolean"}]},"publish":{"messages":[]}}}

> sub udp,10.1.2.5,9092,range_test,range,{{value}}
  jsonConfig: {"config":{"name":"","description":"","subscribe":{"messages":[{"name":"rhino_test","type":"string"},{"name":"bool_test","type":"boolean"},{"name":"range_test","type":"range"}]},"publish":{"messages":[]}}}
```