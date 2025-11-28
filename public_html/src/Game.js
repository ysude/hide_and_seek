import { Monster } from './entities/Monster.js';

// Access mat4 from the global glMatrix object
const { mat4 } = glMatrix;

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2');

        if (!this.gl) {
            alert("WebGL 2.0 is not supported in this browser.");
            return;
        }

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Initialize Entities
        this.monster = new Monster(this.gl);

        this.lastTime = 0;
    }

    start() {
        requestAnimationFrame((time) => this.loop(time));
    }

    loop(currentTime) {
        // Convert to seconds
        currentTime *= 0.001; 
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame((time) => this.loop(time));
    }

    update(deltaTime) {
        this.monster.update(deltaTime);
    }

    draw() {
        const gl = this.gl;

        // Clear Screen
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        // --- CAMERA SETUP ---
        const fieldOfView = 45 * Math.PI / 180;
        const aspect = this.canvas.width / this.canvas.height;
        const zNear = 0.1;
        const zFar = 100.0;
        
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

        const viewMatrix = mat4.create();
        mat4.lookAt(viewMatrix, [0, 5, 15], [0, 2, 0], [0, 1, 0]);

        // Draw Entity
        this.monster.draw(gl, viewMatrix, projectionMatrix);
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
}