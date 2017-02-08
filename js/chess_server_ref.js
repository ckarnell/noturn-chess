/* chess_server.js 
 * Has the following functions:
 * onMessage
 *     _onMessage
 *          onInput
 * endGame
 *     findGame
 * findGame
 *     createGame
 *     startGame
 * */
var
    chess_server = module.exports = { games: {}, game_count: 0 },
    UUID = require('node-uuid'),
    verbose = true; /*For debugging purposes.*/

//Values for sharing code with the browser.
global.window = global.document = global; /*Don't understand this*/

//Import shared code.
require('./shared.js');

//Simpler wrapper for debugging.
chess_server.log = function() {
    if(verbose) console.log.apply(this, arguments);
};

chess_server.fake_latency = 0; /*Not sure the purpose of this.*/
chess_server.local_time = 0;
chess_server._dt = new Date().getTime();
chess_server._dte = new Date().getTime();
//Messages to delay if faking latency
chess_server.messages = [];

/*The callback for this function is repeated every 4 milliseconds.*/
/*It's apparently used to track the current time and total time playing.*/
setInterval(function() {
    //Update dt to be the time since this function last executed.
    chess_server._dt = new Date().getTime() - chess_server._dte;
    //Reset dte to the current time.
    chess_server._dte = new Date().getTime();
    //local_time is the total time you've been playing.
    chess_server.local_time += chess_server.dt/1000.0;
}, 4);



//Stores an input message to chess_server.messages, sends to _onMessage.

chess_server.onMessage = function(client, message) {
    //If fake latency != 0 and the first letter of the message is 'i'.
    if(this.fake_latency && message.split('.')[0].substr(0,1) == 'i') {
        //Store the input message.
        var chess_message = chess_server.messages
        chess_message.push({client: client, message: message});

        //Executes after fake_latency milliseconds.
        setTimeout(function() {
            //If chess_message is non-empty
            if(chess_message.length) {
                chess_server._onMessage(chess_message[0].client, chess_message[0].message);
                //Pops the first item out of chess_message and returns that item.
                chess_message.splice(0,1);
            }
        }.bind(this), this.fake_latency);
    };
};





//Still figuring out exactly what this function does.
/*This function will likely be greatly reduced in size due to message types being irrelevant.*/


chess_server._onMessage = function(client, message) {
    //Split up the message into sub components.
    var message_parts = message.split('.');
    //I guess the first index is the type of the message.
    var message_type = message_parts[0];
    //Optimizing calls to client.game.
    var client_game = client.game;
    //Get the id of the other client whether they're host or guest.
    var other_client = 
        (client_game.player_host.userid == client.userid) ?
            client_game.player_client : client_game.player_host;

    //TODO: Document the message types.
    /*Does 'i' stand for input?*/
    if(message_type == 'i') {
        //Input handler will forward this.
        this.onInput(client, message_parts);
    } else if (message_type == 'p') {
        client.send('s.p.' + message_parts[1]);
    } else if (message_type == 'c') { //Client changed their color.
        if(other_client) //Apparently 'c' stands for color.
            other_client.send('s.c' + message_parts[1]);
    } else if (message_type == 'l') { //Client is asking for lag simulation
        this.fake_latency = parseFloat(message_parts[1]);
    }
};




/*
This seems to expose that the first part of an input message is 
the input commands, the second part is the time of the input,
and the third part is the input sequence, where "parts" are delimited
by '.'s in the original message to the server.
All this function does is parse the parts of the message and pass them to
client.game.gamecore.handle_server_input().
*/
// chess_server.onInput = function(client, parts) {
    //The input commands come in like u-l /*What does this mean?*/
    //so we split them up into separate commands and then update the players
    /*
    var input_commands = parts[1].split('-');
    var input_time = parts[2].replace('-','.');
    var input_seq = parts[3];
    //For optimization.
    var client_game = client.game
    */
    //The client should be in a game, so we can
    //tell that game to handle the input.
    /*Not exactly sure what this means yet, come back to it after studying client and gamecore.*/
    // if(client && client_game && client_game.gamecore) {
    //     client_game.gamecore.handle_server_input(client, input_commands, input_time, input_seq);
    // }
// };




//Define some required functions.
chess_server.createGame = function(player) {
    //Create a new game instance.
    var thegame = {
        id: UUID(),     //Generate a new id for the game.
        player_host: player, //So we know who initiated the game.
        player_client: null, //Nobody else has joined yet by default.
        player_count: 1 //For simple checking of state.
    };

    //Store it in the list of games.
    this.games[ thegame.id ] = thegame;

    //Keep track.
    /*This variable is in chess_server.*/
    this.game_count++;

    //Create a new game core instance, which actually handles the game logic.
    /*Obviously, game_core is brought in by the require() statement above.*/
    thegame.gamecore = new game_core( thegame );
    //Start updating the game loop on the server.
    thegame.gamecore.update( new Date().getTime() );

    //Tell the player that they are now the host.
    //s=server message, h=you are hosting.
    // player.send('s.h.' + String(thegame.gamecore.local_time).replace('.','-'));
    console.log('Server host at ' + thegame.gamecore.local_time);
    player.game = thegame;
    player.hosting = true;

    /* player.userid is defined elsewhere, in index.js.*/
    this.log('player ' + player.userid + ' created a game with id ' + player.game.id)

    //Return it.
    return thegame;
};

//Requesting to kill a game in progress.
/*This one seems pretty straight forward, and relies on 
chess_server.findGame, defined later.*/
chess_server.endGame = function(gameid, userid) {
    var thegame = this.games[gameid];

    if(thegame) {
        //Stop the game updates immediately.
        /*stop_update() may be a needed function in gamecore.*/
        thegame.gamecore.stop_update()

        //If the game has two players, the one is leaving.
        if(thegame.player_count > 1) {
            //Send the players the message the game is ending.
            if(userid == thegame.player_host.userid) {
                //The host left, let's join another game.
                if(thegame.player_client) {
                    //Tell them the game is over.
                    thegame.player_client.send('s.e'); /*What does this mean?*/
                    //Now look for/create a new game.
                    this.findGame(thegame.player_client);
                }
            }
            else {
                //The other player left, we were hosting.
                if(thegame.player_host) {
                    //Tell the client the game has ended.
                    thegame.player_host.send('s.e');
                    //I am no longer hosting, this game is done.
                    thegame.player_host.hosting = false;
                    //Now look for or create a new game.
                    this.findGame(thegame.player_host);
                }
            }
        }

        /*Get rid of the game's listing and deincrement the game count.*/
        delete this.games[gameid];
        this.game_count--;
    } else {
        this.log('That game was not found!');
    }

};

chess_server.startGame = function(game) {
    //A game has 2 players and wants to begin.
    //The host already knows they're hosting.
    //Tell the other client they are joining a game.
    //s=server message, j=you are joining, send them the host id.
    /*It looks like 's.e' means a game is ending and 's.j' means a game is being joined. 's.r' must mean reset position? This will have to change to accommodate the chess board.*/
    game.player_client.send('s.j.' + game.player_host.userid);
    game.player_client.game = game;

    //Now we tell both that the game is ready to start.
    //Clients will reset their positions in this case.
    game.player_client.send('s.r.'+String(game.gamecore.local_time).replace('.','-'));
    game.player_host.send('s.r.'+String(game.gamecore.local_time).replace('.','-'));

    //Set this flag so that the update loop can run it.
    game.active = true;
};

/*Finds a game looking for a player and connects to that game,
or creates a new game and waits for a new player to connect to it.*/
chess_server.findGame = function(player) {
    this.log('Looking for a game. We have: ' + this.game_count + ' games.');

    //If there are active games, we'll see if one needs a player.
    if(this.game_count) {
        var joined_a_game = false

        //Check the list of games for an open game.
        for(var gameid in this.games) {
            //Only care about our own properties.
            if(!this.games.hasOwnProperty(gameid)) continue;

            //Get the game we are checking against.
            var game_instance = this.games[gameid];

            //If the game is a player short.
            if(game_instance.player_count < 2) {
                //Someone wants us to join!
                joined_a_game = true;
                //Increase the player count and store
                //the player as the client of this game.
                game_instance.player_client = player;
                game_instance.gamecore.players.other.instance = player;
                game_instance.player_count++;

                //Start running the game on the server,
                //which will tell them to start.
                this.startGame(game_instance);
            }
        }
        //If you didn't join a game after looping through, create one.
        if(!joined_a_game) this.createGame(player);
    } else { //If there are 0 games currently, create one.
        this.createGame(player);
    }
};

