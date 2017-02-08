var verbose = true;

/* The game_core class */
var game_core = function(game_instance) {
    this.chess = new Chess();
    this.opponent_chess = new Chess();
    this.fen = this.chess.fen();
    this.instance = game_instance;
    // Store a flag if we are the server, since the
    // server always passes in an argument for game_instance.
    this.server = this.instance !== undefined;
    this.can_move = false;

    // Define the players if we are the server.
    if(this.server) {
        this.players = {
            self: new game_player(this, this.instance.player_host),
            other: new game_player(this, this.instance.player_client)
        };
    } else {
        this.players = {
            self: new game_player(this),
            other: new game_player(this)
        };
    };

    // Define attributes and methods if we are the client.
    if(!this.server) {

        this.onDrop = clientOnDrop.bind(this);
        this.onDragStart = clientOnDragStart.bind(this);
        this.onChange = clientOnChange.bind(this);
        this.onSnapEnd = clientOnSnapEnd.bind(this);
        this.onSnapbackEnd = clientOnSnapbackEnd.bind(this);
        this.onMoveEnd = clientOnMoveEnd.bind(this);
        this.ready = false;

        this.dragged_piece = '';
        this.dragged_piece_source = '';

        // Client specific configurations.
        this.client_create_configuration();

        this.server_updates = [];

        // Connect to the server.
        this.client_connect_to_server();

    } else {
        this.server_time = 0;
        this.laststate = {};
    }

    this.local_time = 0.016; // The local timer.
    this._dt = new Date().getTime(); // The local timer delta.

}; // game_core.constructor.

// Sets the game_core class to a global type server side.
if( 'undefined' != typeof global ) {
    module.exports = global.game_core = game_core;
}

clientOnDragStart = function(source, piece, position, orientation) {
    // If the game hasn't started, don't drag.
    if (!this.ready) return false;

    if ((this.cfg.orientation === 'white' && piece.search(/^b/) !== -1) ||
            (this.cfg.orientation === 'black' && piece.search(/^w/) !== -1)) {
                status = 'Can\'t move the other player\'s pieces!';
                clientMoveStatusUpdate(status);
                if (verbose) console.log(status);
                return false;
            }

    if (!this.players.self.connected) {
        if (verbose) {
                    status = 'Wait until a player has connected with you!';
                    console.log(status);
                    clientMoveStatusUpdate(status);
        }
        return false;
    }

    if (game.game_over() === true) {
        status = 'The game is over! No more moves can be made!';
        clientMoveStatusUpdate(status);
        if (verbose) console.log(status);
        return false;
    }

    this.dragged_piece = piece;
    this.dragged_piece_source = source;

    // Might not be necessary to store the position unless I add 
    // animations to show player's the other player's dragging piece.
    this.dragged_piece_position = position;
};

// When a piece is dropped.
clientOnDrop = function(source, target) {
    // Piece is no longer being dragged.
    this.dragged_piece = '';
    this.dragged_piece_source = '';

    // See if one second has passed since the last move.
    if (!this.can_move) {
        status = 'Can\'t move until the progress bar is full!';
        clientMoveStatusUpdate(status);
        if (verbose) console.log(status);
        return 'snapback';
    }

    // See if the move is legal.
    var move = this.chess.move({
        from: source,
        to: target,
        promotion: 'q' // NOTE: defaults to queen, should add some sort of option.
    });

    // If the move isn't legal, snap the piece back, otherwise send it to the server.
    if (move === null) {
        if (source != target) {
            status = 'Illegal move!';
            clientMoveStatusUpdate(status);
        }
        return 'snapback'
    } else {
        this.can_move = false;
        clientProgressBarUpdate(); 
        this.fen = this.chess.fen(); 

        if (verbose) console.log('Local on drop:', this.fen);

        // Need to emit the new FEN and move to the server.
        this.socket.send('m.' + this.fen + '*' + source + '-' + target);
    }
}

// Not needed for anything at the moment.
clientOnMoveEnd = function(oldPos, newPos) {
};

// Determines when the game is over.
clientOnChange = function(oldPos, newPos) {
    // If one of the kings is captured, end the game.
    wK = bK = true;
    for (var pos in newPos) {
        if (!(newPos[pos] == 'wK')) {
            if (!(newPos[pos] == 'bK')) {
                continue;
            } else bK = false;
        } else wK = false; 
    }

    // Checks if the dragged king has been captured.
    checkDraggedPiece = function(piece) {
        if (newPos[this.dragged_piece_source]) {
            return true; // The piece has been captured.
        } else { return false }
    }

    // If a dragged piece is a king, check to see if it's been captured.
    if (this.dragged_piece[1] == 'K') {
        if (this.players.self.orientation == 'white') {
            wK = checkDraggedPiece('wK');
        } else { bK = checkDraggedPiece('bK'); }
    }

    // Need to load a chess game from the opponent's point of view,
    // or else the checkmate condition can't be calculated properly.
    // This can likely be simplified.
    opponent_fen = this.chess.fen().split(' ');
    opponent_fen[1] = swap_color(this.players.self.orientation[0]);
    opponent_fen = opponent_fen.join(' ');
    console.log('OPPONENT_FEN:', opponent_fen);
    this.opponent_chess.load(opponent_fen);

    // If there's a game over, end the game.
    if (bK || wK || this.chess.game_over() || this.opponent_chess.game_over()) {
        this.ready = false;
        this.can_move = false;
        clientGameOver();
    }
}

// For castling, en passant (not currently implemented), and pawn promotion.
clientOnSnapEnd = function() {
    this.board.position(this.fen);
};

// Trying to fix a bug that doesn't draw snap-backed pieces.
clientOnSnapbackEnd = function() {
    console.log("WE SNAPPED BACK BABY:", this.fen);
    this.board.position(this.fen);
}

game_core.prototype.client_connect_to_server = function() {
    this.socket = io.connect();

    //Not really connected until we have a server id and are placed
    //in a game by the server.
    this.socket.on('connect', function(){
        this.players.self.state = 'connecting';
        clientStatusUpdate(); 
    }.bind(this));

    // Other socket events will be handled here.
    // this.socket.on('disconnect', this.client_ondisconnect.bind(this));
    this.socket.on('onconnected', this.client_onconnected.bind(this));
    this.socket.on('message', this.client_onnetmessage.bind(this));
}

game_core.prototype.client_onconnected = function(data) {
    this.players.self.id = data.id;
    this.players.self.state = 'connected';
    clientStatusUpdate(); 
    this.players.self.online = true;
}

function swap_color(c) {
    return c === 'w' ? 'b' : 'w';
}

function data_to_move_locations(data) {
    var data = data.split('*'),
        move_parts = data[1].split('-');
    var source = move_parts[0],
        target = move_parts[1];
    return [data, move_parts, source, target];
}

game_core.prototype.client_onmove = function(data) {
    var parts = data_to_move_locations(data)
    var data = parts[0],
        move_parts = parts[1],
        source = parts[2],
        target = parts[3];

    // Keep track of the opponent's point of view.
    // Doesn't work on it's own currently.
    // this.opponent_chess.load(data[0]);

    new_fen = data[0].split(' ')[0];
    new_obj = window.ChessBoard.fenToObj(new_fen);
    console.log('NEW OBJ:', new_obj);

    // Load the new position in the local chess rules module.
    // Currently doesn't bother to check for move legality since
    // that's already done on the server side.
    var position = data[0].split(' ');
    position[1] = swap_color(position[1]);
    position = position.join(' ');
    console.log('Position:', position);
    this.chess.load(position);

    this.fen = this.chess.fen();

    // Sadly this logic is necessary, since the ChessBoard.move
    // function redraws all pieces including those being dragged.
    // Otherwise a single line could replace all of the following code.
    if (new_obj[this.dragged_piece_source] == this.dragged_piece) {
        delete new_obj[this.dragged_piece_source];
        new_fen = window.ChessBoard.objToFen(new_obj);
        this.board.position(new_fen);
        this.fen = this.chess.fen();
    } else {
        if (verbose) console.log('Received on drop:', data);
        this.board.position(data[0]); 
        this.fen = this.board.fen();
    }

}

game_core.prototype.client_onhostgame = function(data) {

    // The server sends the time when asking us to host, but it should be a new game
    // so the value will be really small anyway (15 or 16ms).
    var server_time = parseFloat(data.replace('-','.'));

    // Get an estimate of the current time on the server.
    this.local_time = server_time + this.net_latency;

    // Set the flag that we are hosting.
    this.players.self.host = true;

    // Update debugging information to display state.
    this.players.self.state = 'hosting.waiting for a player';
    clientStatusUpdate(); 
    
    this.cfg.orientation = 'white'
    this.players.self.orientation = 'white';

    // Draw the chess board as host!
    this.board = ChessBoard('board', this.cfg);

    // Make sure we start in the correct place as the host.
    // this.client_reset_positions(); // Shouldn't be necessary.

}; //client_onhostgame


game_core.prototype.client_onjoingame = function(data) {

    // We are not the host.
    this.players.self.host = false;
    // Update the local state.
    this.players.self.state = 'connected.joined.waiting';
    clientStatusUpdate(); 

    this.players.self.orientation = 'black';
    // Switch the start color to black.
    fen = this.chess.fen().split(' ');
    fen[1] = 'b';
    this.chess.load(fen.join(' '));

    this.cfg.orientation = 'black';
    // Draw the chess board as client!
    this.board = ChessBoard('board', this.cfg);

    // Make sure the positions match servers and other clients
    // this.client_reset_positions(); // Shouldn't be necessary.

}; //client_onjoingame


game_core.prototype.client_onreadygame = function(data) {

    var server_time = parseFloat(data.replace('-','.'));

    var player_host = this.players.self.host ?  this.players.self : this.players.other;
    var player_client = this.players.self.host ?  this.players.other : this.players.self;

    this.local_time = server_time + this.net_latency;
    console.log('server time is about ' + this.local_time);

    this.players.self.state = 'In game. ' + this.players.self.state.split('.')[0];
    this.players.self.connected = true;
    clientStatusUpdate(); 

    // Make the "Ready" button visible.
    clientOnConnected();

    //Make sure colors are synced up
     // this.socket.send('c.' + this.players.self.color);

}; //client_onreadygame

game_core.prototype.client_oncountdown = function(data) {
    // console.log('Countdown should start now');
    clientOnCountdown();
};

game_core.prototype.client_onillegalmove = function(data) {
    // Illegal moves detected on the server side cause the board for that client
    // to revert to the most current state of the board according to the server.
    console.log('Illegal move:', data);
    clientMoveStatusUpdate('Opponent\'s most recent move invalidated your move!');
    this.fen = data;
    this.chess.load(data);
    this.board.position(data.split(' ')[0]);
    this.can_move = true;
    clientOnIllegalMove();
}

game_core.prototype.client_onnetmessage = function(data) {

    var commands = data.split('.');
    var command = commands[0];
    var subcommand = commands[1] || null;
    var commanddata = commands[2] || null;

    switch(command) {
        case 's': //server message

            switch(subcommand) {

                case 'm' : // Receiving a move.
                    this.client_onmove(commanddata); break;

                case 'h' : // Host a game requested.
                    this.client_onhostgame(commanddata); break;

                case 'j' : // Join a game requested.
                    this.client_onjoingame(commanddata); break;

                case 'r' : // Ready a game requested.
                    this.client_onreadygame(commanddata); break;

                case 'c' : // Start countdown to begin game.
                    this.client_oncountdown(commanddata); break;

                case 'i' : // Illegal move made by client.
                    this.client_onillegalmove(commanddata); break;

                case 'e' : // End game requested. [NOT IMPLEMENTED]
                    this.client_ondisconnect(commanddata); break;

                case 'p' : // Server ping. [NOT IMPLEMENTED]
                    this.client_onping(commanddata); break;

            } //subcommand

        break; //'s'
    } //command
                
}; //client_onnetmessage

/* The game_player class */
var game_player = function(game_instance, player_instance) {
    //Store the instances.
    this.instance = player_instance;
    this.game = game_instance;
    //State information.
    this.state = 'not-connected';
    this.id = '';
    this.state_time = new Date().getTime();

    //Local history of moves.
    this.moves = [];
}; //game_player contructor.

// Client specific configurations.
game_core.prototype.client_create_configuration = function() {
        this.net_latency = 0.001;           //the latency between the client and the server (ping/2)
        this.cfg = {
                      draggable: true,
                      position: 'start',
                      onDragStart: this.onDragStart,
                      onDrop: this.onDrop,
                      onSnapbackEnd: this.onSnapbackEnd,
                      onChange: this.onChange,
                      onSnapEnd: this.onSnapEnd,
                      onMoveEnd: this.onMoveEnd,
                      moveSpeed: 1
                   };
};
