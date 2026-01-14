import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

import SceneManager from "./core/SceneManager.js";
import { loadPostShaders } from "../assets/shaders/PostShaders.js";
import { Level } from "./entities/Level.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;

    // ---------------------------
    // RENDERER
    // ---------------------------
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ---------------------------
    // SCENE / CAMERA
    // ---------------------------
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 500);
    this.camera.position.set(0, 2, 10);

    // ---------------------------
    // POST FX
    // ---------------------------
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.postPassA = null;
    this.postPassB = null;
    this.activeShaderSet = "A";

    // ---------------------------
    // CONTROLS
    // ---------------------------
    this.controls = new PointerLockControls(this.camera, document.body);
    document.body.addEventListener("click", () => this.controls.lock());

    // ---------------------------
    // UI refs
    // ---------------------------
    this._interactPromptEl = document.getElementById("interactPrompt");
    this._interactTextEl = document.getElementById("interactText");
    this._modeToastEl = document.getElementById("modeToast");
    this._modeToastTimer = null;

    // ---------------------------
    // INPUT
    // ---------------------------
    this.keys = new Set();
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("wheel", (e) => this.onWheel(e), { passive: true });

    // ---------------------------
    // RAYCAST (interact)
    // ---------------------------
    this._ray = new THREE.Raycaster();
    this._centerNdc = new THREE.Vector2(0, 0);

    // ---------------------------
    // GAMEPLAY STATE
    // ---------------------------
    this.inventoryCards = 0;
    this.totalCards = 3;
    this.objects = [];

    // ---------------------------
    // Interact
    // ---------------------------
    this.interactMaxDist = 3.0;
    this.interactState = {
      visible: false,
      type: null,
      id: null,
      object: null,
      doorEntry: null,
      text: "",
    };

    // ---------------------------
    // NAMES VIEW (camera fly)
    // ---------------------------
    this.namesAnchor = null;
    this.namesMode = false;
    this.namesFly = {
      active: false,
      t: 0,
      dur: 1.25,
      fromPos: new THREE.Vector3(),
      toPos: new THREE.Vector3(),
      fromQuat: new THREE.Quaternion(),
      toQuat: new THREE.Quaternion(),
      savedPos: new THREE.Vector3(),
      savedQuat: new THREE.Quaternion(),
    };
    this.namesTopDownHeight = 14.0;
    this.namesTopDownForward = 0.001;

    // ---------------------------
    // FreeCam (6DOF)
    // ---------------------------
    this.freeCam = {
      enabled: false,
      rollSpeed: 1.8,     // rad/sec
      verticalSpeed: 4.0, // m/sec
      savedPos: new THREE.Vector3(),
      savedQuat: new THREE.Quaternion(),
      hasSaved: false,
    };

    // ---------------------------
    // PLAYER PHYSICS (FPS mode)
    // camera.position = eye position
    // ---------------------------
    this.player = {
      velocity: new THREE.Vector3(),
      onGround: false,
      radius: 0.35,
      standHeight: 1.7,
      crouchHeight: 1.1,
      height: 1.7,     // current
      smooth: 18.0,    // crouch smoothing
      jumpForce: 15.0,
    };
    this.jumpQueued = false;

    // ---------------------------
    // SWITCH/LAMP interactive lighting
    // ---------------------------
    this.switchRoots = [];
    this.lampAnchors = {};
    this.boundLights = {};
    this.lightDistance = 25;
    this.lightAngle = Math.PI / 4;

    // ---------------------------
    // Shadow blockers (from wall colliders)
    // ---------------------------
    this._shadowBlockers = [];

    // ---------------------------
    // LEVEL
    // ---------------------------
    this.level = new Level(this.scene);

    // extra static colliders (floor/ceiling like 2nd code)
    this.levelStaticColliders = [];

    // ---------------------------
    // LIGHTING (base ambience)
    // ---------------------------
    this.scene.add(new THREE.HemisphereLight(0x223344, 0x111122, 0.05));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.01));

    // small debug ambient if you want:
    // this.debugAmbient = new THREE.AmbientLight(0xffffff, 0.10);
    // this.scene.add(this.debugAmbient);

    // ---------------------------
    // FLOOR MESH (visual)
    // ---------------------------
    this.floorMesh = null;

    // ---------------------------
    // FLASHLIGHT (weapon layer)
    // ---------------------------
    this.WEAPON_LAYER = 1;
    this.camera.layers.enable(this.WEAPON_LAYER);

    this.flashlight = null;
    this.flashlightOn = true;
    this.flashlightLight = null;
    this.flashlightLightPoint = null;
    this.flashlightLightTarget = null;

    this.flashConeMin = Math.PI / 30;
    this.flashConeMax = Math.PI / 5;
    this.flashConeStep = 0.02;
    this.flashIntensityMin = 1.0;
    this.flashIntensityMax = 12.0;
    this.flashAxis = "x";         // x | y | z
    this.flashStepPos = 0.05;
    this.flashStepRot = 0.05;      // pozisyon adımı
    this.flashPivot = null;   // wrapper



    // Flashlight failure system
    this.flashPreFlicker = false;
    this.flashPreFlickerTime = 0;
    this.flashPreFlickerDuration = 2.0;

    this.flashFailTimer = 0;
    this.flashFailInterval = 0;
    this.flashFailing = false;
    this.flashFailRecoverTimer = 0;
    this.flashSavedIntensity = 0;
    this.flashSavedAngle = 0;

    // ---------------------------
    // AUDIO
    // ---------------------------
    this.listener = new THREE.AudioListener();
    this.audioLoader = new THREE.AudioLoader();

    this.horrorAmbience = new THREE.Audio(this.listener);
    this.horrorAmbienceVolume = 0.25;
    this.horrorFadeSpeed = 0.15;
    this.horrorTargetVolume = this.horrorAmbienceVolume;
    this.horrorActive = false;

    this.flashlightSwitchSound = new THREE.Audio(this.listener);
    this.lightBuzzSound = new THREE.Audio(this.listener);
    this.flashClickSound = new THREE.Audio(this.listener);
    this.doorSound = new THREE.Audio(this.listener);
    this.flashlightBrokenSound = new THREE.Audio(this.listener);

    this.knockTickSound = new THREE.PositionalAudio(this.listener);
    this.knockTickTimer = 0;
    this.knockTickInterval = THREE.MathUtils.randFloat(10, 20);

    this.scareSoundTimer = 0;
    this.scareSoundInterval = THREE.MathUtils.randFloat(6, 12);

    // Light flicker / door events
    this.lightFlickerTimer = 0;
    this.lightFlickerInterval = 0;

    // ---------------------------
    // DEBUG COLLISION LOG
    // ---------------------------
    this.debugCollisions = false;
    this._lastColLog = 0;

    // ---------------------------
    // QUEST
    // ---------------------------
    this.buildQuest();
    this.updateUI();
    this.hideInteractPrompt();

    // start init
    this.lastTime = 0;
    this.init();
  }

  // ============================================================
  // INIT
  // ============================================================
  async init() {
    // attach listener correctly
    this.scene.add(this.camera);
    this.camera.add(this.listener);

    // load audio (best-effort)
    this.loadAudioSafe("./assets/audio/flashlight_switch.mp3", (buf) => {
      this.flashlightSwitchSound.setBuffer(buf);
      this.flashlightSwitchSound.setVolume(0.6);
    });

    this.loadAudioSafe("./assets/audio/electric_buzz.mp3", (buf) => {
      this.lightBuzzSound.setBuffer(buf);
      this.lightBuzzSound.setVolume(0.55);
    });

    this.loadAudioSafe("./assets/audio/flashlight_switch.mp3", (buf) => {
      this.flashClickSound.setBuffer(buf);
      this.flashClickSound.setVolume(0.6);
    });

    this.loadAudioSafe("./assets/audio/door_open.mp3", (buf) => {
      this.doorSound.setBuffer(buf);
      this.doorSound.setVolume(0.7);
    });

    this.loadAudioSafe("./assets/audio/horror_background.mp3", (buf) => {
      this.horrorAmbience.setBuffer(buf);
      this.horrorAmbience.setLoop(true);
      this.horrorAmbience.setVolume(0.0);
      this.horrorAmbience.play();
      this.horrorActive = true;
    });

    this.loadAudioSafe("./assets/audio/flashlight_broken.mp3", (buf) => {
      this.flashlightBrokenSound.setBuffer(buf);
      this.flashlightBrokenSound.setVolume(0.5);
    });

    this.loadAudioSafe("./assets/audio/knock_knock.mp3", (buf) => {
      this.knockTickSound.setBuffer(buf);
      this.knockTickSound.setVolume(0.85);
      this.knockTickSound.setRefDistance(6);
      this.knockTickSound.setRolloffFactor(1.2);
    });

    // load house
    const { spawn } = await this.level.loadHouse("./assets/models/House.glb");

    // build floor mesh + static colliders (floor & ceiling)
    this.buildFloorAndCeiling();

    // load flashlight model (best-effort)
    await this.loadFlashlightSafe();

    // spawn
    if (spawn) {
      this.camera.position.copy(spawn);
      this.camera.position.y += this.player.height;
    } else {
      this.camera.position.set(3, 2, -6);
    }

    // names anchor
    this.namesAnchor = this.level.root?.getObjectByName("EMPTY_NAMES") ?? null;

    // interactive lights
    this.setupInteractiveLightsFromHouse();

    // shadow blockers from wall colliders
    this.buildShadowBlockersFromWallColliders();

    // if we spawned inside wall push out
    this.resolveCollisions(this.camera.position, this.player.radius, this.getAllColliders(), true);

    // post fx
    await this.initPostFX();

    // initial UI
    this.updateUI();
    this.hideInteractPrompt();
  }

  loadAudioSafe(url, onBuffer) {
    try {
      this.audioLoader.load(
        url,
        (buf) => onBuffer?.(buf),
        undefined,
        () => console.warn("[AUDIO] failed:", url)
      );
    } catch (e) {
      console.warn("[AUDIO] load error:", url, e);
    }
  }

  // ============================================================
  // FLOOR + CEILING (static colliders)
  // ============================================================
  buildFloorAndCeiling() {
    // Visual floor
    if (this.floorMesh) this.scene.remove(this.floorMesh);
    this.floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(200, 0.1, 200),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    this.floorMesh.position.set(0, -0.2, 0);
    this.floorMesh.receiveShadow = true;
    this.scene.add(this.floorMesh);

    // Static colliders list
    this.levelStaticColliders.length = 0;

    // Floor collider (bigger than house)
    this.levelStaticColliders.push({
      name: "COL_FLOOR_MAIN",
      box: new THREE.Box3(
        new THREE.Vector3(-100, -1.0, -100),
        new THREE.Vector3(100, -0.9, 100)
      ),
    });

    // Ceiling collider
    const CEILING_Y = 5.0;
    this.levelStaticColliders.push({
      name: "COL_CEILING_MAIN",
      isCeiling: true,
      box: new THREE.Box3(
        new THREE.Vector3(-120, CEILING_Y, -120),
        new THREE.Vector3(120, CEILING_Y + 1.0, 120)
      ),
    });
  }

  getAllColliders() {
    return [...this.level.getAllColliders(), ...this.levelStaticColliders];
  }

  // ============================================================
  // POST FX
  // ============================================================
  async initPostFX() {
    try {
      const shaders = await loadPostShaders();

      this.postPassA = new ShaderPass(shaders.stealth);
      this.postPassA.material.glslVersion = THREE.GLSL3;

      this.postPassB = new ShaderPass(shaders.panic);
      this.postPassB.material.glslVersion = THREE.GLSL3;

      this.composer.addPass(this.postPassA);
      this.composer.addPass(this.postPassB);

      this.setPostShader(this.activeShaderSet);
      this.updatePostFXUniforms(this.lastTime || 0);
    } catch (error) {
      console.error("[POSTFX] Failed to load shaders:", error);
    }
  }

  setPostShader(setId) {
    this.activeShaderSet = setId;
    const useA = setId === "A";

    if (this.postPassA) {
      this.postPassA.enabled = useA;
      this.postPassA.renderToScreen = useA;
    }
    if (this.postPassB) {
      this.postPassB.enabled = !useA;
      this.postPassB.renderToScreen = !useA;
    }
  }

  updatePostFXUniforms(t) {
    if (this.postPassA?.uniforms) {
      this.postPassA.uniforms.uTime.value = t;
      this.postPassA.uniforms.uResolution.value.set(innerWidth, innerHeight);
    }
    if (this.postPassB?.uniforms) {
      this.postPassB.uniforms.uTime.value = t;
      this.postPassB.uniforms.uResolution.value.set(innerWidth, innerHeight);
      this.postPassB.uniforms.uPanic.value = 1.0;
    }
  }

  // ============================================================
  // LOOP
  // ============================================================
  start() {
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(tMs) {
    const t = tMs * 0.001;
    const dt = Math.min(t - this.lastTime, 0.1);
    this.lastTime = t;

    this.update(dt);
    this.updatePostFXUniforms(t);

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    requestAnimationFrame((t2) => this.loop(t2));
  }

  // ============================================================
  // INPUT
  // ============================================================

adjustFlashlightAxis(dir, isRotation) {
  // Pivot varsa onu kontrol ederiz, yoksa flashlight’ı
  const obj = this.flashPivot ?? this.flashlight;
  if (!obj) return;

  if (!isRotation) {
    // ✅ TRANSLATION (J/K)
    const step = this.flashStepPos * dir;
    if (this.flashAxis === "x") obj.position.x += step;
    if (this.flashAxis === "y") obj.position.y += step;
    if (this.flashAxis === "z") obj.position.z += step;

    // güvenlik clamp: ekrandan kaçmasın
    obj.position.x = THREE.MathUtils.clamp(obj.position.x, -0.6, 0.6);
    obj.position.y = THREE.MathUtils.clamp(obj.position.y, -0.6, 0.3);
    obj.position.z = THREE.MathUtils.clamp(obj.position.z, -1.2, -0.05);
  } else {
    // ✅ ROTATION (Shift+J/K)
    // ✅ ROTATION (Shift+J/K): camera-space axis
      const step = this.flashStepRot * dir;

      // obj: flashPivot (kamera child’ı) daha iyi
      const q = new THREE.Quaternion();

      // Kamera child olduğumuz için "camera-space" axis demek aslında obj'nin LOCAL axis'i
      // Ama Euler yerine quaternion ile döndürünce axis drift daha az olur.
      if (this.flashAxis === "x") {
        // pitch
        q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), step);
      }
      if (this.flashAxis === "y") {
        // yaw
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), step);
      }
      if (this.flashAxis === "z") {
        // roll
        q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), step);
      }

      // local rotate: obj.quaternion = obj.quaternion * q
      obj.quaternion.multiply(q);
      obj.quaternion.normalize();

  }

  // Debug: pivot üzerinden bas
  console.log(
    `[FLASH ${isRotation ? "ROT" : "POS"}] axis=${this.flashAxis}`,
    "pos:",
    obj.position.x.toFixed(2),
    obj.position.y.toFixed(2),
    obj.position.z.toFixed(2),
    "rot:",
    obj.rotation.x.toFixed(2),
    obj.rotation.y.toFixed(2),
    obj.rotation.z.toFixed(2)
  );
}



  onKeyDown(e) {
    this.keys.add(e.code);

    if (e.code === "KeyH") {
      const help = document.getElementById("helpOverlay");
      if (help) help.style.display = help.style.display === "block" ? "none" : "block";
    }

    // PostFX sets
    if (e.code === "Digit1") this.setPostShader("A");
    if (e.code === "Digit2") this.setPostShader("B");

    // Names view
    if (e.code === "KeyN") this.toggleNamesView();

    // Interact
    if (e.code === "KeyE") this.tryInteract();

    // FreeCam toggle
    if (e.code === "KeyF") this.toggleFreeCam();
    if (e.code === "KeyR") this.resetFreeCamRoll();

    // Flashlight toggle (moved from F -> G to avoid conflict)
    if (e.code === "KeyG") this.toggleFlashlight();

    // Jump
    if (e.code === "Space") {
      if (!this.freeCam.enabled) this.jumpQueued = true;
      // freecam uses Space in update() (up)
    }

    // Flashlight axis select: 3/4/5 => x/y/z
    if (e.code === "Digit3") this.flashAxis = "x";
    if (e.code === "Digit4") this.flashAxis = "y";
    if (e.code === "Digit5") this.flashAxis = "z";

    // Flashlight axis move: J/K => -/+ along selected axis
    if (e.code === "KeyJ") this.adjustFlashlightAxis(-1, e.shiftKey === true);
    if (e.code === "KeyK") this.adjustFlashlightAxis(+1, e.shiftKey === true);


  }

  onKeyUp(e) {
    this.keys.delete(e.code);
    if (e.code === "Space") this.jumpQueued = false;
  }

  onWheel(e) {
    // Flashlight cone/intensity
    if (!this.flashlightLight) return;
    if (!this.flashlightOn) return;

    const dir = Math.sign(e.deltaY);

    this.flashlightLight.angle = THREE.MathUtils.clamp(
      this.flashlightLight.angle + dir * this.flashConeStep,
      this.flashConeMin,
      this.flashConeMax
    );

    const t = THREE.MathUtils.inverseLerp(this.flashConeMin, this.flashConeMax, this.flashlightLight.angle);
    this.flashlightLight.intensity = THREE.MathUtils.lerp(
      this.flashIntensityMax, // narrow = strong
      this.flashIntensityMin, // wide = weak
      t
    );
  }

  // ============================================================
  // UI
  // ============================================================
  showModeToast(text) {
    if (!this._modeToastEl) return;
    this._modeToastEl.textContent = text;
    this._modeToastEl.style.display = "block";

    if (this._modeToastTimer) clearTimeout(this._modeToastTimer);
    this._modeToastTimer = setTimeout(() => {
      if (this._modeToastEl) this._modeToastEl.style.display = "none";
    }, 1500);
  }

  updateUI() {
    const now = document.getElementById("cardsNow");
    const total = document.getElementById("cardsTotal");
    if (now) now.textContent = String(this.inventoryCards);
    if (total) total.textContent = String(this.totalCards);

    const ui = document.getElementById("ui");
    if (ui) ui.innerText = `Kartlar: ${this.inventoryCards} / ${this.totalCards}`;
  }

  // ============================================================
  // QUEST
  // ============================================================
  buildQuest() {
    const sm = new SceneManager();
    const data = sm.createQuestData();

    for (const item of data) {
      const geo = new THREE.BoxGeometry(item.size[0] * 2, item.size[1] * 2, item.size[2] * 2);
      const mat = new THREE.MeshStandardMaterial();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(item.pos[0], item.pos[1], item.pos[2]);
      mesh.userData = { type: item.type };
      this.scene.add(mesh);
      this.objects.push(mesh);
    }
  }

  // ============================================================
  // NAMES VIEW (fly)
  // ============================================================
  toggleNamesView() {
    if (!this.namesAnchor) {
      console.warn("[NAMES] EMPTY_NAMES not found in GLB.");
      return;
    }
    if (this.namesFly.active) return;

    // Transition sırasında freecam aç/kapatmayı da istemiyoruz
    // (pose restore vs karışmasın)
    // FreeCam açıksa kapatıp normal moda al
    if (this.freeCam.enabled) {
      this.freeCam.enabled = false;
      this.camera.rotation.z = 0;
      this.freeCam.hasSaved = false;
    }

    if (this.controls.isLocked) this.controls.unlock();

    if (!this.namesMode) {
      this.namesFly.savedPos.copy(this.camera.position);
      this.namesFly.savedQuat.copy(this.camera.quaternion);

      const anchorWp = this.namesAnchor.getWorldPosition(new THREE.Vector3());
      const targetPos = anchorWp.clone().add(new THREE.Vector3(0, this.namesTopDownHeight, 0));

      const lookAtTarget = anchorWp.clone().add(new THREE.Vector3(0, 0, this.namesTopDownForward));
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(targetPos, lookAtTarget, new THREE.Vector3(0, 0, -1))
      );

      this.beginCameraFly(targetPos, targetQuat);
      this.namesMode = true;
    } else {
      const targetPos = this.namesFly.savedPos.clone();
      const targetQuat = this.namesFly.savedQuat.clone();
      this.beginCameraFly(targetPos, targetQuat);
      this.namesMode = false;
    }
  }

  beginCameraFly(toPos, toQuat) {
    this.namesFly.active = true;
    this.namesFly.t = 0;

    this.namesFly.fromPos.copy(this.camera.position);
    this.namesFly.fromQuat.copy(this.camera.quaternion);

    this.namesFly.toPos.copy(toPos);
    this.namesFly.toQuat.copy(toQuat);
  }

  updateCameraFly(dt) {
    if (!this.namesFly.active) return;

    this.namesFly.t += dt;
    const u = Math.min(this.namesFly.t / this.namesFly.dur, 1);
    const s = u * u * (3 - 2 * u);

    this.camera.position.lerpVectors(this.namesFly.fromPos, this.namesFly.toPos, s);
    this.camera.quaternion.copy(this.namesFly.fromQuat).slerp(this.namesFly.toQuat, s);

    if (u >= 1) this.namesFly.active = false;
  }

  // ============================================================
  // FREECAM
  // ============================================================
  toggleFreeCam() {
    if (this.namesFly.active) return;

    if (!this.freeCam.enabled) {
      this.freeCam.savedPos.copy(this.camera.position);
      this.freeCam.savedQuat.copy(this.camera.quaternion);
      this.freeCam.hasSaved = true;

      this.freeCam.enabled = true;
      this.showModeToast("FREE CAMERA: ON (6DOF)");
      return;
    }

    // exit
    this.freeCam.enabled = false;
    if (this.freeCam.hasSaved) {
      this.camera.position.copy(this.freeCam.savedPos);
      this.camera.quaternion.copy(this.freeCam.savedQuat);
    }

    // remove roll
    this.resetFreeCamRoll();

    this.showModeToast("FREE CAMERA: OFF");
  }

  resetFreeCamRoll() {
    if (!this.freeCam.enabled && !this.freeCam.hasSaved) return;
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    e.z = 0;
    this.camera.quaternion.setFromEuler(e);
  }

  // ============================================================
  // INTERACTIVE LIGHTS (SWITCH/LAMP)
  // ============================================================
  setupInteractiveLightsFromHouse() {
    const root = this.level.root;
    if (!root) return;

    this.switchRoots.length = 0;
    this.lampAnchors = {};
    this.boundLights = {};

    root.traverse((obj) => {
      const n = obj.name || "";
      if (n.startsWith("SWITCH_")) this.switchRoots.push(obj);
      if (n.startsWith("LAMP_")) {
        const id = n.replace("LAMP_", "");
        this.lampAnchors[id] = obj;
      }
    });

    for (const id of Object.keys(this.lampAnchors)) {
      const anchor = this.lampAnchors[id];

      const light = new THREE.SpotLight(0xffffff, 0.0, this.lightDistance, this.lightAngle, 0.35, 1.0);
      const wp = anchor.getWorldPosition(new THREE.Vector3());

      light.position.copy(wp);
      light.position.y -= 0.15;
      light.target.position.set(wp.x, wp.y - 5, wp.z);

      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0002;
      light.shadow.normalBias = 0.02;
      light.angle = Math.PI / 3;
      light.penumbra = 0.4;

      this.scene.add(light);
      this.scene.add(light.target);

      this.boundLights[id] = { light, isOn: false, intensityOn: 8.0 };
    }
  }

  toggleLightBySwitchName(switchName) {
    const id = switchName.replace("SWITCH_", "");
    const entry = this.boundLights[id];
    if (!entry) {
      console.warn("[LIGHTING] No lamp bound for", switchName, "(expected LAMP_" + id + ")");
      return;
    }

    // click sound for room lamp
    if (this.flashClickSound?.buffer) {
      if (this.flashClickSound.isPlaying) this.flashClickSound.stop();
      this.flashClickSound.play();
    }

    entry.isOn = !entry.isOn;
    entry.light.intensity = entry.isOn ? entry.intensityOn : 0.0;
  }

  // ============================================================
  // SHADOW BLOCKERS (walls)
  // ============================================================
  buildShadowBlockersFromWallColliders() {
    const colliders = this.level.getAllColliders();

    for (const m of this._shadowBlockers) this.scene.remove(m);
    this._shadowBlockers = [];

    const mat = new THREE.ShadowMaterial({ opacity: 0.0 });

    for (const c of colliders) {
      const n = c.name || "";
      if (!n.startsWith("COL_WALL")) continue;

      const b = c.box;
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      b.getSize(size);
      b.getCenter(center);

      size.x = Math.max(size.x, 0.05);
      size.y = Math.max(size.y, 0.05);
      size.z = Math.max(size.z, 0.05);

      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(center);
      mesh.castShadow = true;

      this.scene.add(mesh);
      this._shadowBlockers.push(mesh);
    }
  }

  // ============================================================
  // COLLISIONS (ground + ceiling + horizontal push)
  // ============================================================
  resolveCollisions(pos, radius, colliders, logOnce = false) {
    let hitAny = false;
    let hitNames = [];

    this.player.onGround = false;

    const playerHead = pos.y + 0.2;
    const playerFeet = pos.y - this.player.height;

    // Safety floor clamp (prevents falling forever if no floor collider hit)
    if (pos.y < this.player.height) {
      pos.y = this.player.height;
      this.player.velocity.y = 0;
      this.player.onGround = true;
    }

    for (const c of colliders) {
      const b = c.box;

      // quick vertical reject
      if (playerHead < b.min.y || playerFeet > b.max.y) continue;

      // ceiling stop (only when moving up)
      if (c.isCeiling && this.player.velocity.y > 0) {
        const CEILING_EPS = 0.45;
        const CEILING_PUSH = 0.005;
        if (playerHead >= b.min.y - CEILING_EPS) {
          this.player.velocity.y = 0;
          pos.y = b.min.y - this.player.height - CEILING_PUSH;
          hitAny = true;
          hitNames.push(c.name ?? "(no-name)");
          continue;
        }
      }

      // ground snap (when falling and feet close to top surface)
      // require xz within expanded bounds
      const inXZ =
        pos.x >= b.min.x - radius && pos.x <= b.max.x + radius &&
        pos.z >= b.min.z - radius && pos.z <= b.max.z + radius;

      if (
        inXZ &&
        !c.isCeiling &&
        this.player.velocity.y <= 0 &&
        playerFeet <= b.max.y &&
        playerFeet >= b.max.y - 0.18
      ) {
        pos.y = b.max.y + this.player.height;
        this.player.onGround = true;
        this.player.velocity.y = 0;
        hitAny = true;
        hitNames.push(c.name ?? "(no-name)");
        // continue to horizontal push too, just in case
      }

      // horizontal push
      const closestX = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const closestZ = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const dist2 = dx * dx + dz * dz;

      if (dist2 < radius * radius) {
        hitAny = true;
        hitNames.push(c.name ?? "(no-name)");

        const dist = Math.sqrt(dist2) || 0.0001;
        const push = radius - dist;

        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      }
    }

    if (this.debugCollisions && hitAny) {
      const now = performance.now();
      if (logOnce || now - (this._lastColLog ?? 0) > 200) {
        this._lastColLog = now;
        const uniq = [...new Set(hitNames)];
        console.log("[COLLISION]", "pos:", pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2), "hit:", uniq);
      }
    }
  }

  // ============================================================
  // INTERACT HUD
  // ============================================================
  hideInteractPrompt() {
    if (this._interactPromptEl) this._interactPromptEl.style.display = "none";
    this.interactState.visible = false;
    this.interactState.type = null;
    this.interactState.id = null;
    this.interactState.object = null;
    this.interactState.doorEntry = null;
    this.interactState.text = "";
  }

  showInteractPrompt(text) {
    if (!this._interactPromptEl || !this._interactTextEl) return;
    this._interactTextEl.textContent = text;
    this._interactPromptEl.style.display = "block";
    this.interactState.visible = true;
    this.interactState.text = text;
  }

  scanInteractable() {
    if (this.namesFly.active) return null;
    if (!this.controls.isLocked) return null;

    this._ray.setFromCamera(this._centerNdc, this.camera);

    // 1) Cards
    const questHits = this._ray.intersectObjects(this.objects, false);
    if (questHits.length) {
      const hit = questHits[0].object;
      const wp = hit.getWorldPosition(new THREE.Vector3());
      const dist = wp.distanceTo(this.camera.position);
      if (dist <= this.interactMaxDist && hit.userData?.type === "card") {
        return { type: "card", object: hit, id: "CARD", doorEntry: null, distance: dist };
      }
    }

    // 2) Switches
    if (this.switchRoots.length) {
      const switchHits = this._ray.intersectObjects(this.switchRoots, true);
      if (switchHits.length) {
        let cur = switchHits[0].object;
        let switchRootName = null;
        while (cur) {
          const n = cur.name || "";
          if (n.startsWith("SWITCH_")) { switchRootName = n; break; }
          cur = cur.parent;
        }
        if (switchRootName) {
          const wp = switchHits[0].object.getWorldPosition(new THREE.Vector3());
          const dist = wp.distanceTo(this.camera.position);
          if (dist <= this.interactMaxDist) {
            const id = switchRootName.replace("SWITCH_", "");
            return { type: "switch", object: switchHits[0].object, id, doorEntry: null, distance: dist, switchRootName };
          }
        }
      }
    }

    // 3) Doors
    const doorRoots = this.level.doors.map((d) => d.mesh);
    if (doorRoots.length) {
      const doorHits = this._ray.intersectObjects(doorRoots, true);
      if (doorHits.length) {
        const hitObj = doorHits[0].object;
        const hitPos = hitObj.getWorldPosition(new THREE.Vector3());
        const dist = hitPos.distanceTo(this.camera.position);

        if (dist <= this.interactMaxDist) {
          const doorRootRe = /^Door_\d{3}$/;
          let cur = hitObj;
          let doorEntry = null;
          let doorName = null;

          while (cur) {
            if (doorRootRe.test(cur.name || "")) {
              doorName = cur.name;
              doorEntry = this.level.doors.find((d) => d.mesh === cur);
              break;
            }
            cur = cur.parent;
          }

          if (doorEntry && doorName) {
            return { type: "door", object: hitObj, id: doorName, doorEntry, distance: dist };
          }
        }
      }
    }

    return null;
  }

  updateInteractHUD() {
    const info = this.scanInteractable();
    if (!info) {
      this.hideInteractPrompt();
      return;
    }

    if (info.type === "card") {
      this.interactState = { ...this.interactState, ...info };
      this.showInteractPrompt("Pick up card");
      return;
    }

    if (info.type === "switch") {
      const entry = this.boundLights[info.id];
      const state = entry ? (entry.isOn ? "ON" : "OFF") : "UNBOUND";
      this.interactState = { ...this.interactState, ...info };
      this.showInteractPrompt(`Toggle switch ${info.id} (${state})`);
      return;
    }

    if (info.type === "door") {
      const state = info.doorEntry?.isOpen ? "Close" : "Open";
      this.interactState = { ...this.interactState, ...info };
      this.showInteractPrompt(`${state} ${info.id}`);
      return;
    }

    this.hideInteractPrompt();
  }

  tryInteract() {
    if (this.namesFly.active) return;

    if (this.interactState.visible && this.interactState.type) {
      if (this.interactState.type === "card") {
        const hit = this.interactState.object;
        if (hit && hit.userData?.type === "card") {
          this.inventoryCards++;
          this.scene.remove(hit);
          this.objects = this.objects.filter((o) => o !== hit);
          this.updateUI();
        }
        return;
      }

      if (this.interactState.type === "switch") {
        const id = this.interactState.id;
        this.toggleLightBySwitchName("SWITCH_" + id);
        return;
      }

      if (this.interactState.type === "door") {
        const d = this.interactState.doorEntry;
        if (d) d.isOpen = !d.isOpen;
        this.playDoorSound();
        return;
      }
    }
  }

  // ============================================================
  // DOORS ANIMATION
  // ============================================================
  updateDoors(dt) {
    const OPEN_ANGLE = -Math.PI / 2;
    const SPEED = 2.5;

    for (const d of this.level.doors) {
      const target = d.isOpen ? OPEN_ANGLE : 0;
      const diff = target - d.angle;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), SPEED * dt);
      d.angle += step;

      // IMPORTANT: your Level.js uses angle: o.rotation.z but Game uses rotation.y in older code.
      // Most models open around Y in Three. Keep Y here (matches your existing interact code).
      d.mesh.rotation.y = d.angle;
    }

    this.level.updateDynamicColliders();
  }

  // ============================================================
  // FLASHLIGHT
  // ============================================================
  async loadFlashlightSafe() {
    try {
      await this.loadFlashlight();
    } catch (e) {
      console.warn("[FLASHLIGHT] failed to load flashlight.glb (skipping)", e);
    }
  }

  async loadFlashlight() {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync("./assets/models/flashlight.glb");

    this.flashlight = gltf.scene;
    this.flashlight.layers.set(this.WEAPON_LAYER);

    this.flashlight.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.layers.set(this.WEAPON_LAYER);

        const m = obj.material;
        if (m) {
          if (m.map) {
            m.metalness = 0.6;
            m.roughness = 0.4;
          } else {
            m.metalness = 0.2;
            m.roughness = 0.5;
            m.color?.set?.(0x444444);
          }
          m.depthTest = true;
          m.depthWrite = true;
        }
      }
    });

    // FPS view pose
    this.flashlight.scale.set(0.01, 0.01, 0.01);


    this.flashPivot = new THREE.Group();
    this.camera.add(this.flashPivot);
    this.flashPivot.add(this.flashlight);
    this.flashPivot.position.set(0.10, -0.10, -0.20);
    this.flashPivot.rotation.set(0.15, 1.59, 0.15);
    this.flashPivot.layers.set(this.WEAPON_LAYER);




    // Light point at tip
    this.flashlightLightPoint = new THREE.Object3D();
    this.flashlightLightPoint.position.set(2.6, 0, 0);
    this.flashlightLightPoint.rotation.y = -Math.PI / 2;
    this.flashlight.add(this.flashlightLightPoint);

    // Spot light
    this.flashlightLight = new THREE.SpotLight(0xffffff, 6.0, 30, Math.PI / 9, 0.35, 1.0);
    this.flashlightLight.castShadow = true;
    this.flashlightLight.shadow.mapSize.set(2048, 2048);
    this.flashlightLight.shadow.bias = -0.0001;
    this.flashlightLight.shadow.normalBias = 0.02;

    this.flashlightLightPoint.add(this.flashlightLight);
    this.flashlightLight.position.set(0, 0, 0);

    // Target
    this.flashlightLightTarget = new THREE.Object3D();
    this.flashlightLightTarget.position.set(0, 0, -1);
    this.flashlightLightPoint.add(this.flashlightLightTarget);
    this.flashlightLight.target = this.flashlightLightTarget;

    console.log("[FLASHLIGHT] ready");
  }

  toggleFlashlight() {
    if (!this.flashlightLight) return;

    // switch sound
    if (this.flashlightSwitchSound?.buffer) {
      if (this.flashlightSwitchSound.isPlaying) this.flashlightSwitchSound.stop();
      this.flashlightSwitchSound.play();
    }

    this.flashlightOn = !this.flashlightOn;
    this.flashlightLight.intensity = this.flashlightOn ? this.flashIntensityMax : 0.0;
  }

  // ============================================================
  // HORROR EVENTS
  // ============================================================
  updateHorrorAmbience(dt) {
    if (!this.horrorAmbience || !this.horrorActive) return;

    const current = this.horrorAmbience.getVolume();

    if (current < this.horrorTargetVolume) {
      this.horrorAmbience.setVolume(Math.min(current + this.horrorFadeSpeed * dt, this.horrorTargetVolume));
    } else if (current > this.horrorTargetVolume) {
      this.horrorAmbience.setVolume(Math.max(current - this.horrorFadeSpeed * dt, this.horrorTargetVolume));
    }
  }

  playDoorSound() {
    if (!this.doorSound?.buffer) return;
    if (this.doorSound.isPlaying) this.doorSound.stop();
    this.doorSound.play();
  }

  playRandomScareSound() {
    // ambience boost
    this.horrorTargetVolume = 0.35;
    setTimeout(() => (this.horrorTargetVolume = this.horrorAmbienceVolume), 1200);

    const sound = new THREE.PositionalAudio(this.listener);

    const files = [
      "./assets/audio/whisper1.mp3",
      "./assets/audio/whisper2.mp3",
      "./assets/audio/footstep_far.mp3",
    ];

    const file = files[Math.floor(Math.random() * files.length)];

    this.audioLoader.load(
      file,
      (buffer) => {
        sound.setBuffer(buffer);
        sound.setRefDistance(5);
        sound.setVolume(0.6);

        const offset = new THREE.Vector3(
          THREE.MathUtils.randFloat(-4, 4),
          0,
          THREE.MathUtils.randFloat(-6, -3)
        );

        const pos = this.camera.position.clone().add(offset);
        sound.position.copy(pos);

        this.scene.add(sound);
        sound.play();

        setTimeout(() => this.scene.remove(sound), buffer.duration * 1000 + 500);
      },
      undefined,
      () => console.warn("[AUDIO] scare sound failed:", file)
    );
  }

  updateKnockTick(dt) {
    this.knockTickTimer += dt;
    if (this.knockTickTimer < this.knockTickInterval) return;

    this.knockTickTimer = 0;
    this.knockTickInterval = THREE.MathUtils.randFloat(12, 25);

    if (Math.random() > 0.4) return;

    const anyLightOn = Object.values(this.boundLights).some((l) => l.isOn);
    if (anyLightOn && Math.random() > 0.3) return;

    if (!this.knockTickSound?.buffer || this.knockTickSound.isPlaying) return;

    const offset = new THREE.Vector3(
      THREE.MathUtils.randFloat(-3, 3),
      THREE.MathUtils.randFloat(0.5, 2),
      THREE.MathUtils.randFloat(-4, -2)
    );

    const pos = this.camera.position.clone().add(offset);

    this.knockTickSound.position.copy(pos);
    this.scene.add(this.knockTickSound);
    this.knockTickSound.play();
  }

  updateLightFlicker(dt) {
    const hasAnyLightOn = Object.values(this.boundLights).some((entry) => entry.isOn);

    this.lightFlickerTimer += dt;

    if (this.lightFlickerTimer > this.lightFlickerInterval) {
      this.lightFlickerTimer = 0;
      this.lightFlickerInterval = THREE.MathUtils.randFloat(4, 7);

      if (Math.random() < 0.7 && hasAnyLightOn) {
        // buzz
        if (this.lightBuzzSound?.buffer) {
          if (this.lightBuzzSound.isPlaying) this.lightBuzzSound.stop();
          this.lightBuzzSound.play();
        }

        // ambience dips
        this.horrorTargetVolume = 0.15;

        for (const id in this.boundLights) {
          const entry = this.boundLights[id];
          if (!entry.isOn) continue;

          const light = entry.light;
          const original = entry.intensityOn;
          light.intensity = original * 0.2;

          setTimeout(() => {
            light.intensity = original;
          }, THREE.MathUtils.randInt(300, 900));
        }

        setTimeout(() => {
          if (this.lightBuzzSound?.isPlaying) this.lightBuzzSound.stop();
          this.horrorTargetVolume = this.horrorAmbienceVolume;
        }, 1000);
      }
    }

    if (!hasAnyLightOn && this.lightBuzzSound?.isPlaying) this.lightBuzzSound.stop();
  }

  tryAutoCloseDoor() {
    const openDoors = this.level.doors.filter((d) => d.isOpen);
    if (!openDoors.length) return;
    if (Math.random() > 0.35) return;

    const door = openDoors[Math.floor(Math.random() * openDoors.length)];
    door.isOpen = false;
    this.playDoorSound();
  }

  updateFlashlightFailure(dt) {
    if (!this.flashlightLight || !this.flashlightOn) return;

    // pre-flicker
    if (this.flashPreFlicker) {
      this.flashPreFlickerTime -= dt;

      this.flashlightLight.intensity =
        this.flashSavedIntensity * THREE.MathUtils.randFloat(0.1, 1.0);

      this.flashlightLight.angle =
        this.flashSavedAngle * THREE.MathUtils.randFloat(0.9, 1.1);

      if (this.flashPreFlickerTime <= 0) {
        this.flashPreFlicker = false;

        // fully off
        this.flashlightLight.intensity = 0;
        this.flashFailRecoverTimer = THREE.MathUtils.randFloat(1.2, 2.5);
        this.flashFailing = true;
      }
      return;
    }

    // failing off time
    if (this.flashFailing) {
      this.flashFailRecoverTimer -= dt;
      if (this.flashFailRecoverTimer <= 0) {
        this.flashlightLight.intensity = this.flashSavedIntensity;
        this.flashlightLight.angle = this.flashSavedAngle;
        this.flashFailing = false;
      }
      return;
    }

    // normal -> count to random failure
    this.flashFailTimer += dt;
    if (this.flashFailTimer > this.flashFailInterval) {
      this.flashFailTimer = 0;
      this.flashFailInterval = THREE.MathUtils.randFloat(5, 10);

      if (Math.random() < 0.3) this.startFlashlightFailure();
    }
  }

  startFlashlightFailure() {
    if (!this.flashlightLight) return;

    if (this.flashlightBrokenSound?.buffer) {
      if (this.flashlightBrokenSound.isPlaying) this.flashlightBrokenSound.stop();
      this.flashlightBrokenSound.play();
    }

    this.horrorTargetVolume = 0.45;

    this.flashSavedIntensity = this.flashlightLight.intensity;
    this.flashSavedAngle = this.flashlightLight.angle;

    this.flashPreFlicker = true;
    this.flashPreFlickerTime = this.flashPreFlickerDuration;
  }

  // ============================================================
  // UPDATE
  // ============================================================
  update(dt) {
    // horror systems run regardless (when locked is off, still ok)
    this.updateHorrorAmbience(dt);
    this.updateKnockTick(dt);

    // random scare one-shots (only while locked to avoid weirdness in menu)
    if (this.controls.isLocked && !this.namesFly.active) {
      this.scareSoundTimer += dt;
      if (this.scareSoundTimer > this.scareSoundInterval) {
        this.scareSoundTimer = 0;
        this.scareSoundInterval = THREE.MathUtils.randFloat(8, 15);
        if (Math.random() < 0.6) this.playRandomScareSound();
      }
    }

    // camera fly active
    if (this.namesFly.active) {
      this.hideInteractPrompt();
      this.updateCameraFly(dt);
      return;
    }

    if (!this.controls.isLocked) {
      this.hideInteractPrompt();
      return;
    }

    // auto door + flicker events
    this.updateLightFlicker(dt);

    this.autoCloseDoorCooldown -= dt;
    if (this.autoCloseDoorCooldown <= 0) {
      this.tryAutoCloseDoor();
      this.autoCloseDoorCooldown = THREE.MathUtils.randFloat(10, 18);
    }

    // Flashlight failure system
    this.updateFlashlightFailure(dt);

    // -----------------------------------------
    // MOVEMENT
    // -----------------------------------------
    const speed = (this.keys.has("ShiftLeft") ? 8 : 4) * dt;
    const dir = new THREE.Vector3();

    if (this.keys.has("KeyW")) dir.z += 1;
    if (this.keys.has("KeyS")) dir.z -= 1;
    if (this.keys.has("KeyA")) dir.x -= 1;
    if (this.keys.has("KeyD")) dir.x += 1;

    dir.normalize();

    this.controls.moveRight(dir.x * speed);
    this.controls.moveForward(dir.z * speed);

    // -----------------------------------------
    // FREECAM vs FPS PHYSICS
    // -----------------------------------------
    if (this.freeCam.enabled) {
      // vertical
      const vs = this.freeCam.verticalSpeed * dt;
      if (this.keys.has("Space")) this.camera.position.y += vs;
      if (this.keys.has("ControlLeft") || this.keys.has("ControlRight")) this.camera.position.y -= vs;

      // roll
      const rs = this.freeCam.rollSpeed * dt;
      if (this.keys.has("KeyQ")) this.camera.rotateZ(rs);
      if (this.keys.has("KeyZ")) this.camera.rotateZ(-rs);

      // no collisions in freecam
    } else {
      // crouch smoothing: keep feet constant while height changes
      const targetH = this.keys.has("KeyC") ? this.player.crouchHeight : this.player.standHeight;
      const a = 1 - Math.exp(-this.player.smooth * dt);
      const newH = this.player.height + (targetH - this.player.height) * a;
      const dh = newH - this.player.height;
      // move eye by dh so feet stays in place
      this.camera.position.y += dh;
      this.player.height = newH;

      // gravity
      this.player.velocity.y -= 60.0 * dt;
      this.camera.position.y += this.player.velocity.y * dt;

      // collisions
      this.resolveCollisions(this.camera.position, this.player.radius, this.getAllColliders());

      // jump
      if (this.player.onGround && this.jumpQueued) {
        this.player.velocity.y = this.player.jumpForce;
        this.player.onGround = false;
        this.jumpQueued = false;
      }
    }

    // -----------------------------------------
    // rotate quest cards
    // -----------------------------------------
    for (const o of this.objects) {
      if (o.userData.type === "card") o.rotation.y += 2.0 * dt;
    }

    // doors
    this.updateDoors(dt);

    // interact
    this.updateInteractHUD();
  }

  // ============================================================
  // RESIZE
  // ============================================================
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();

    if (this.composer) this.composer.setSize(innerWidth, innerHeight);

    if (this.postPassA?.uniforms) this.postPassA.uniforms.uResolution.value.set(innerWidth, innerHeight);
    if (this.postPassB?.uniforms) this.postPassB.uniforms.uResolution.value.set(innerWidth, innerHeight);
  }
}
