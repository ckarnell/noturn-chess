var board,
  gamecore = new game_core(),
  game = gamecore.chess,
  progress = $('#progress'),
  line = new ProgressBar.Line('#progress', {color: '#FCB03C'}),
  statusEl = $('#status'),
  moveStatusEl = $('#move_status'),
  ready_button = $('#button'),
  socket = io().connect();

clientProgressBarUpdate = function() {
    // Set the progress bar to reset in one second.
    progress_reset(1000, 'Game in progress');
};

// Not needed at the moment.
clientStatusUpdate = function() {
    // statusEl.html(gamecore.players.self.state);
};

clientMoveStatusUpdate = function(status) {
    ready_button.html(status);
};

clientOnIllegalMove = function() {
    fill_progress_bar('100');
};

clientOnConnected = function() {
    ready_button.html('Player connected. Click here when ready');
};

clientOnCountdown = function() {
    ready_button.html('Game starts in 5 seconds');
    progress_reset(5000, 'Game in progress');

    // Is there a better way to do this?
    setTimeout(function() {ready_button.html('Game starts in 4 seconds')}, 1000);
    setTimeout(function() {ready_button.html('Game starts in 3 seconds')}, 2000);
    setTimeout(function() {ready_button.html('Game starts in 2 seconds')}, 3000);
    setTimeout(function() {ready_button.html('Game starts in 1 second')}, 4000);
}

clientGameOver = function() {
    clientMoveStatusUpdate('Game over. Click here to rematch');
    gamecore.ready = false;
    gamecore.game_over = true;
    fill_progress_bar('0');
    socket.send('g');
    $('button').prop('disabled', false);
}

ready_button.click(function() {
    gamecore.ready = true;

    // Reset some values in case this is a rematch.
    gamecore.game_over = false;
    gamecore.board = ChessBoard('board', gamecore.cfg);
    gamecore.chess.load(gamecore.board.fen() + ' ' + gamecore.cfg.orientation[0] + ' KQkq - 0 1');
    gamecore.fen = gamecore.board.fen();

    $('button').prop('disabled', true);
    ready_button.html('Waiting for other player');

    // Let the server know the client is ready.
    socket.send('r');
});

progress_reset = function(duration, button_message) {
    progress.empty();
    line = new ProgressBar.Line('#progress', {color: '#FCB03C'});
    // Create a 1 second long animation for the progress bar filling up.
    line.animate(1.0, {
        duration: duration
    }, function() {
        // Added this check to avoid a bug when the server detects an illegal move.
        if (!gamecore.can_move && !gamecore.game_over) {
            gamecore.can_move = true;
            ready_button.html(button_message);
        }
    });
}

fill_progress_bar = function(stroke) {
    progress.empty();
    // Sets the progress bar graphic back to full.
    // This is ugly, I need to find a better way to do this.
    progress.html('<svg viewBox="0 0 100 1" preserveAspectRatio="none" \
            style="display: block; width: 100%;"><path d="M 0,0.5 L 100,0.5" \
            stroke="#FCB03C" stroke-width="1" fill-opacity="0" \
            style="stroke-dasharray: 100px, 100px; stroke-dashoffset: ' + stroke + 'px;"> \
            </path></svg>');
}
