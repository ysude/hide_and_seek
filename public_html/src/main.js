import { Game } from './Game.js';

window.onload = () => {
    const canvas = document.getElementById('glCanvas');
    const game = new Game(canvas);
    game.start();
};