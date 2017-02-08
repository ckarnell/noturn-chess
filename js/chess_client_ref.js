/*  Copyright (c) 2012 Sven "FuzzYspo0N" Bergström
    
    written by : http://underscorediscovery.com
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    MIT Licensed.
*/

// A window global for the game root variable.
var game = {};

// When loading, store references to our drawing
// canvases, and initiate a game instance.
window.onload = function(){
    //Create our game client instance.
    game = new game_core();

    //Fetch the viewport.
    /*Not sure what this is yet, this may need to be adjusted.*/
    game.viewport = document.getElementById('viewport');

    /*Some things were ommitted here due to irrelevance, they
     * may need to be addressed later.*/

    game.update( new Date().getTime() );
};
