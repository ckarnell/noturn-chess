var
    chess_server = module.exports = {games: {}, game_count: 0},
    UUID = require('node-uuid'),
    verbose = true, /*For debugging purposes.*/
    start_pos_black = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";

//Import the code that's shared between server and client, and the rules api.
require('./shared.js');
require('./chess.js');

// For debugging.
chess_server.log = function() {
    if(verbose) console.log.apply(this, arguments);
};

chess_server.local_time = 0;
chess_server._dt = new Date().getTime();
chess_server._dte = new Date().getTime();

/* Keep track of time during the game */
setInterval(function() {
    // Update dt to be the time since this function last executed.
    chess_server._dt = new Date().getTime() - chess_server._dte;
    // Reset dte to the current time.
    chess_server._dte = new Date().getTime();
    // local_time is the total time you've been playing.
    chess_server.local_time += chess_server.dt/1000.0;
}, 4);


chess_server.onMessage = function(client, message) {
    var message_parts = message.split('.');
    var client_game = client.game;

    // Get the id of the other client whether they're host or guest.
    var is_host = (client_game.player_host.userid == client.userid)

    var other_client = (is_host) ?
            client_game.player_client : client_game.player_host;

    var this_client = (is_host) ?
            client_game.player_host : client_game.player_client;

    // If the message is a move.
    if(message_parts[0] == 'm') {
        chess_server.onMove(client, client_game, message_parts, other_client, is_host);
    } else if (message_parts[0] == 'r') { // If it's a "ready" message.
        chess_server.onClientReady(this_client, other_client);
    } else if (message_parts[0] == 'g') { // If it's a game over.
        chess_server.onGameOver(client_game, this_client, other_client);
    }   
}

// Handles moves. Could be made more efficient.
chess_server.onMove = function(client, client_game, message_parts, other_client, is_host){
        var data = message_parts[1].split('*'),
            move_parts = data[1].split('-');
        var source = move_parts[0],
            target = move_parts[1];
        // console.log(data, move_parts, source, target);
        black_move = client_game.chess_black.move({from: source, to: target, promotion: 'q'});
        white_move = client_game.chess_white.move({from: source, to: target, promotion: 'q'});

        move = black_move || white_move;

        /* Determine the legality of a move, whether it was by white or black.
        This will handle errors when players make moves simultaneously in
        such a way that one player's move is rendered illegal by the other
        player's move.*/
        // This could probably be made more efficient.
        if (move) { 
            if (move.color == 'w') {
                fen = client_game.chess_white.fen().split(' ');
                fen[1] = 'b';
                fen = fen.join(' ');
                client_game.chess_black.load(fen);
            } else {
                fen = client_game.chess_black.fen().split(' ');
                fen[1] = 'w';
                fen = fen.join(' ');
                client_game.chess_white.load(fen);
            }

            // The move is legal, send it on to the other client.
            other_client.send('s.m.' + message_parts[1]);
        } else {
            console.log('Illegal move!');
            // Send the move back to the client to revert their board state.
            if (is_host) {
                client.send('s.i.' + client_game.chess_white.fen());
            } else {
                client.send('s.i.' + client_game.chess_black.fen());
            }
        }
}

chess_server.onClientReady = function(this_client, other_client){
    this_client.ready = true;

    // If both clients are ready, start the countdown.
    if (other_client.ready) {
        this_client.send('s.c');
        other_client.send('s.c');
    };
}

chess_server.onGameOver = function(client_game, this_client, other_client){
    // Should add code here to store completed games in a database.

    // Reset values when there's a game over for a rematch.
    this_client.ready = other_client.ready = false;
    client_game.chess_white = new Chess();
    client_game.chess_black = new Chess();
    client_game.chess_black.load(start_pos_black);
}

//Define some required functions.
chess_server.createGame = function(player) {
    //Create a new game instance.
    var thegame = {
        id: UUID(),     //Generate a new id for the game.
        player_host: player, //So we know who initiated the game.
        player_client: null, //Nobody else has joined yet by default.
        player_count: 1, //For simple checking of state.
        chess_white: new Chess(), //To keep track of host game on the server side.
        chess_black: new Chess() //To keep track of the client game on the server side.
    };
    thegame.chess_black.load(start_pos_black),

    // Store it in the list of games.
    this.games[ thegame.id ] = thegame;

    // Keep track of how many games there are.
    this.game_count++;

    // Create a new game core instance.
    /*Obviously, game_core is brought in by the require() statement above.*/
    thegame.gamecore = new game_core( thegame );
    // Start updating the game loop on the server.
    // Not sure if this is necessary.
    // thegame.gamecore.update( new Date().getTime() );

    //Tell the player that they are now the host.
    // s=server message, h=you are hosting.
    player.send('s.h.' + String(thegame.gamecore.local_time).replace('.','-'));
    console.log('Server host at ' + thegame.gamecore.local_time);
    player.game = thegame;
    player.hosting = true;

    /* player.userid is defined elsewhere, in index.js.*/
    this.log('player ' + player.userid + ' created a game with id ' + player.game.id)

    return thegame;
};

chess_server.startGame = function(game) {
    // A game has 2 players and wants to begin.
    // The host already knows they're hosting.
    // s=server message, j=you are joining.
    game.player_client.send('s.j.' + game.player_host.userid);
    game.player_client.game = game;

    // Tell both that the game is ready to start.
    // 's.r.' means 'ready request sent from server'.
    game.player_client.send('s.r.'+String(game.gamecore.local_time).replace('.','-'));
    game.player_host.send('s.r.'+String(game.gamecore.local_time).replace('.','-'));

    //Set a flag so we know which games are active.
    game.active = true;
};

/*Finds a game looking for a player and connects to that game,
or creates a new game and waits for a new player to connect to it.*/
chess_server.findGame = function(player) {
    this.log('Looking for a game. We have: ' + this.game_count + ' games.');

    // If there are active games, we'll see if one needs a player.
    if(this.game_count) {
        var joined_a_game = false

        // Check the list of games for an open game.
        for(var gameid in this.games) {
            // Only care about our own properties.
            if(!this.games.hasOwnProperty(gameid)) continue;

            // Get the game we are checking against.
            var game_instance = this.games[gameid];

            // If the game is a player short.
            if(game_instance.player_count < 2) {
                // Someone wants us to join!
                joined_a_game = true;
                // Increase the player count and store
                // the player as the client of this game.
                game_instance.player_client = player;
                game_instance.gamecore.players.other.instance = player;
                game_instance.player_count++;

                // Start running the game on the server,
                // which will tell them to start.
                this.startGame(game_instance);
            }
        }
        // If you didn't join a game after looping through, create one.
        if(!joined_a_game) this.createGame(player);
    } else { // If there are 0 games currently, create one.
        this.createGame(player);
    }
};
