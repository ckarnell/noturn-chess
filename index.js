var 
    gameport = process.env.PORT || 4000,
    express = require('express'),
    app = express(),
    http = require('http'),
    server = http.createServer(app),
    debug = true,
    UUID = require('node-uuid'),
    io = require('socket.io');

// Server setup.
server.listen(gameport);
console.log('Now listening on port ' + gameport);

// Forward localhost:4000 to ./layout.html.
app.get('/', function(req, res) {
    console.log('Loading %s', __dirname + '/layout.html');
    res.sendfile('/layout.html', {root:__dirname});
});

// Forward any other route to the files from the root of the server.
app.get('/*', function(req, res, next) {
    var file = req.params[0];
    if (debug) console.log('File requested: ' + file);
    res.sendfile(__dirname + '/' + file);
});

// Socket.IO set up.
var sio = io.listen(server);

// Import the chess server.
chess_server = require('./js/chess_server.js');

//Socket.io calls this function when a client connects.
sio.sockets.on('connection', function(client) {
    //Generate a new UUID and store it on their socket/connection.
    client.userid = UUID();

    //Tell the player they connected, giving them their id.
    client.emit('onconnected', {id: client.userid});

    //Find the player a game.
    chess_server.findGame(client);

    //Know when someone connects.
    console.log('\t socket.io:: player ' + client.userid + ' connected');

    //Now we want to handle some of the messages that clients will send.
    //They send messages here, and we send them to the game_server to handle.
    client.on('message', function(m) {
        game_server.onMessage(client, m);
    }); //client.on message

});

