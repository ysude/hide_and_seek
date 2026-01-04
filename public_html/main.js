import Camera from './Camera.js';
import InputController from './InputController.js';
import ShaderProgram from './ShaderProgram.js';
import Cube from './Cube.js';
import SceneManager from './SceneManager.js';
import { vsSource, fsSourceDefault, fsSourceToon } from './ShaderSources.js';

const mat4 = window.glMatrix.mat4;
const vec3 = window.glMatrix.vec3;

// --- DURUM YÖNETİMİ ---
const STATE_GAME = 0, STATE_MOVING_TO_CINEMA = 1, STATE_CINEMA = 2, STATE_MOVING_TO_GAME = 3;
let currentState = STATE_GAME;

// --- GLOBALLER ---
let gl, canvas, camera, input, defaultShader, toonShader, currentShader;
let objects = [];
let flashlightOn = true, pointLightOn = false, useToon = false;
let lastFKeyPressed = false, lastTKeyPressed = false, lastEKeyPressed = false, lastCKeyPressed = false, lastVKeyPressed = false;

// HAFIZA VE QUEST
let playerReturnPos = vec3.create(), playerReturnYaw = -90, playerReturnPitch = 0;
let inventoryCards = 0, doorWarningShown = false;

// FİZİK
const PLAYER_HEIGHT = 2.0, PLAYER_WIDTH = 0.1, GRAVITY = 25.0, JUMP_FORCE = 10.0;
const WALK_SPEED = 5.0, RUN_SPEED = 10.0, MAX_STEP_HEIGHT = 1.2;
let playerVelocityY = 0, isGrounded = false;

// SİNEMATİK
const CINEMA_POS = [50, 2, 10], CINEMA_YAW = -90, CINEMA_PITCH = 0;
const GAME_START_POS = [0, 4, 10], ANIMATION_DURATION = 3.0;
let animationStartTime = 0, animStartPos = vec3.create(), animStartYaw = 0, animStartPitch = 0;

// --- MOUSE KONTROLÜ (FIXED) ---
function handleMouse() {
    let md = input.getMouseDelta();
    // Hareket varsa veya sinematik moddaysak kamera dönebilir
    if (md.x !== 0 || md.y !== 0) {
        camera.processMouseMovement(md.x, md.y);
    }
}

function checkCollision(pos) {
    for (let o of objects) {
        if (o.scale[0] > 50 || o.isCard) continue;
        let mX = o.position[0]-o.scale[0], MX = o.position[0]+o.scale[0], mZ = o.position[2]-o.scale[2], MZ = o.position[2]+o.scale[2], MY = o.position[1]+o.scale[1];
        if (pos[0]+PLAYER_WIDTH > mX && pos[0]-PLAYER_WIDTH < MX && pos[2]+PLAYER_WIDTH > mZ && pos[2]-PLAYER_WIDTH < MZ) {
            if (MY - (pos[1]-PLAYER_HEIGHT) <= MAX_STEP_HEIGHT) continue;
            return true;
        }
    } return false;
}

function update(dt) {
    // Mouse her zaman akıcı kalmalı (State fark etmeksizin)
    handleMouse();

    let cClicked = input.isKeyPressed("KeyC") && !lastCKeyPressed; lastCKeyPressed = input.isKeyPressed("KeyC");
    let eClicked = input.isKeyPressed("KeyE") && !lastEKeyPressed; lastEKeyPressed = input.isKeyPressed("KeyE");

    if (currentState === STATE_GAME) {
        // Fizik & Zemin
        let gH = -1.2; 
        for(let o of objects) if(o instanceof Cube && Math.abs(camera.position[0]-o.position[0]) < o.scale[0]+PLAYER_WIDTH && Math.abs(camera.position[2]-o.position[2]) < o.scale[2]+PLAYER_WIDTH) {
            let top = o.position[1]+o.scale[1]; if(top > gH && top <= camera.position[1]-PLAYER_HEIGHT+MAX_STEP_HEIGHT) gH = top;
        }
        let targetY = gH + PLAYER_HEIGHT;
        if (input.isKeyPressed("Space") && isGrounded) { playerVelocityY = JUMP_FORCE; isGrounded = false; camera.position[1] += 0.1; }
        playerVelocityY -= GRAVITY * dt;
        camera.position[1] += playerVelocityY * dt;
        if (camera.position[1] <= targetY) { camera.position[1] = targetY; playerVelocityY = 0; isGrounded = true; } else isGrounded = false;

        // Yürüme
        let s = (input.isKeyPressed("ShiftLeft") ? RUN_SPEED : WALK_SPEED) * dt;
        let f = vec3.fromValues(camera.front[0], 0, camera.front[2]); vec3.normalize(f, f);
        let r = vec3.fromValues(camera.right[0], 0, camera.right[2]); vec3.normalize(r, r);
        let dx = 0, dz = 0;
        if(input.isKeyPressed("KeyW")) { dx+=f[0]*s; dz+=f[2]*s; } if(input.isKeyPressed("KeyS")) { dx-=f[0]*s; dz-=f[2]*s; }
        if(input.isKeyPressed("KeyA")) { dx-=r[0]*s; dz-=r[2]*s; } if(input.isKeyPressed("KeyD")) { dx+=r[0]*s; dz+=r[2]*s; }
        if (!checkCollision([camera.position[0]+dx, camera.position[1], camera.position[2]])) camera.position[0]+=dx;
        if (!checkCollision([camera.position[0], camera.position[1], camera.position[2]+dz])) camera.position[2]+=dz;

        // Kartlar & Kapı Etkileşimi
        if (eClicked) {
            for (let i=0; i<objects.length; i++) {
                let o = objects[i]; if (vec3.distance(camera.position, o.position) < 3.0) {
                    if (o.isCard) { inventoryCards++; objects.splice(i, 1); document.getElementById("ui").innerText = `Kartlar: ${inventoryCards} / 3`; break; }
                    if (o.isDoor) {
                        if (inventoryCards >= 3) { o.isOpening = true; alert("Kapı Açılıyor..."); }
                        else if (!doorWarningShown) { alert(`3 Kart lazım! Sende: ${inventoryCards}`); doorWarningShown = true; setTimeout(()=>doorWarningShown=false, 3000); }
                        break;
                    }
                }
            }
        }
        
        objects.forEach(o => { if(o.isDoor && o.isOpening && o.position[0] < 5) o.position[0] += 0.05; });
        objects.forEach(o => { if(o.isCard) { o.rotation[1] += 2.0 * dt; o.position[1] = -0.5 + Math.sin(performance.now()*0.005)*0.1; } });

        if (cClicked) {
            vec3.copy(playerReturnPos, camera.position); playerReturnYaw = camera.yaw; playerReturnPitch = camera.pitch;
            animStartPos = vec3.clone(camera.position); animStartYaw = camera.yaw; animStartPitch = camera.pitch;
            animationStartTime = performance.now()*0.001; currentState = STATE_MOVING_TO_CINEMA;
        }
    } 
    else if (currentState === STATE_MOVING_TO_CINEMA || currentState === STATE_MOVING_TO_GAME) {
        let t = Math.min((performance.now()*0.001 - animationStartTime) / ANIMATION_DURATION, 1.0);
        let ease = t * t * (3 - 2 * t);
        let targetPos = (currentState === STATE_MOVING_TO_CINEMA) ? CINEMA_POS : playerReturnPos;
        let ty = (currentState === STATE_MOVING_TO_CINEMA) ? -90 : playerReturnYaw;
        let tp = (currentState === STATE_MOVING_TO_CINEMA) ? 0 : playerReturnPitch;
        for(let i=0; i<3; i++) camera.position[i] = animStartPos[i] + (targetPos[i] - animStartPos[i]) * ease;
        camera.yaw = animStartYaw + (ty - animStartYaw) * ease; camera.pitch = animStartPitch + (tp - animStartPitch) * ease;
        camera.updateCameraVectors();
        if (t >= 1.0) currentState = (currentState === STATE_MOVING_TO_CINEMA) ? STATE_CINEMA : STATE_GAME;
    } 
    else if (currentState === STATE_CINEMA && cClicked) {
        animStartPos = vec3.clone(camera.position); animStartYaw = camera.yaw; animStartPitch = camera.pitch;
        animationStartTime = performance.now()*0.001; currentState = STATE_MOVING_TO_GAME;
    }

    // --- IŞIK & SHADER TUŞLARI ---
    if (input.isKeyPressed("KeyV") && !lastVKeyPressed) { useToon = !useToon; currentShader = useToon ? toonShader : defaultShader; }
    lastVKeyPressed = input.isKeyPressed("KeyV");

    if (input.isKeyPressed("KeyF") && !lastFKeyPressed) { flashlightOn = !flashlightOn; lastFKeyPressed = true; } else if(!input.isKeyPressed("KeyF")) lastFKeyPressed = false;
    if (input.isKeyPressed("KeyT") && !lastTKeyPressed) { pointLightOn = !pointLightOn; lastTKeyPressed = true; } else if(!input.isKeyPressed("KeyT")) lastTKeyPressed = false;
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = mat4.create(); mat4.perspective(proj, 45 * Math.PI/180, canvas.width/canvas.height, 0.1, 200.0);
    const view = camera.getViewMatrix(); currentShader.use();
    const loc = (n) => gl.getUniformLocation(currentShader.program, n);
    gl.uniform3fv(loc("uLightPos"), camera.position); gl.uniform3fv(loc("uLightDir"), camera.front);
    gl.uniform1f(loc("uCutoff"), Math.cos(12.5 * Math.PI / 180));
    gl.uniform1i(loc("uLightOn"), flashlightOn); gl.uniform1i(loc("uPointLightOn"), pointLightOn);
    objects.forEach(o => o.draw(currentShader, view, proj));
}

window.onload = () => {
    canvas = document.getElementById("glCanvas"); canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    gl = canvas.getContext("webgl2"); gl.clearColor(0.1, 0.1, 0.1, 1.0); gl.enable(gl.DEPTH_TEST);
    defaultShader = new ShaderProgram(gl, vsSource, fsSourceDefault);
    toonShader = new ShaderProgram(gl, vsSource, fsSourceToon);
    currentShader = defaultShader;
    camera = new Camera(GAME_START_POS, [0, 1, 0], -90, 0); input = new InputController(canvas);
    const scene = new SceneManager(gl);
    objects.push(new Cube(gl, [0, -1.0, 0], [0.5, 0.5, 0.5, 1.0], [100, 0.2, 100]));
    scene.createNameLetters(objects); scene.createQuestObjects(objects);
    let lt = 0;
    function loop(n) { n*=0.001; update(n-lt); render(); lt=n; requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
};