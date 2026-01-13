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

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
    this.camera.position.set(0, 2, 10);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.postPassA = null;
    this.postPassB = null;
    this.activeShaderSet = "A";

    this.controls = new PointerLockControls(this.camera, document.body);

    // ---- 6DOF Free Camera Mode ----
    // F toggles. When exiting, restore previous FPS pose.
    this.freeCam = {
      enabled: false,
      rollSpeed: 1.8,      // rad/sec
      verticalSpeed: 4.0,  // m/sec

      savedPos: new THREE.Vector3(),
      savedQuat: new THREE.Quaternion(),
      hasSaved: false,
    };

    // ---- Crouch (gameplay, FPS mode) ----
    this.eye = {
      standY: 1.7,
      crouchY: 1.1,
      curY: 1.7,
      smooth: 18.0,
      baseY: 0,
    };

    document.body.addEventListener("click", () => this.controls.lock());

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.15));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.05));
    const dir = new THREE.DirectionalLight(0xffffff, 0.25);
    dir.position.set(3, 10, 5);
    this.scene.add(dir);

    // gameplay
    this.inventoryCards = 0;
    this.totalCards = 3;
    this.objects = [];
    this.keys = new Set();

    // ---- SWITCH/LAMP interactive lighting ----
    this.switchRoots = [];
    this.lampAnchors = {};
    this.boundLights = {};
    this.lightDistance = 25;
    this.lightAngle = Math.PI / 4;

    // ---- NAMES VIEW (camera fly) ----
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

    // ---- Interact HUD ----
    this.interactMaxDist = 3.0;
    this.interactState = {
      visible: false,
      type: null,
      id: null,
      object: null,
      doorEntry: null,
      text: "",
    };
    this._interactPromptEl = document.getElementById("interactPrompt");
    this._interactTextEl = document.getElementById("interactText");
    this._modeToastEl = document.getElementById("modeToast");
    this._modeToastTimer = null;


    // re-use raycaster
    this._ray = new THREE.Raycaster();
    this._centerNdc = new THREE.Vector2(0, 0);

    // düz zemin (şimdilik)
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(200, 0.2, 200),
      new THREE.MeshStandardMaterial()
    );
    floor.position.set(0, -1.0, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.level = new Level(this.scene);
    this.buildQuest();

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);

      if (e.code === "KeyH") {
        const help = document.getElementById("helpOverlay");
        if (help) help.style.display = (help.style.display === "block") ? "none" : "block";
      }

      // 6DOF FreeCam
      if (e.code === "KeyF") this.toggleFreeCam();
      if (e.code === "KeyR") this.resetFreeCamRoll(); // only does something when freecam enabled

      // Post FX sets
      if (e.code === "Digit1") this.setPostShader("A");
      if (e.code === "Digit2") this.setPostShader("B");

      // Names view
      if (e.code === "KeyN") this.toggleNamesView();

      // Interact
      if (e.code === "KeyE") this.tryInteract();
    });

    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("resize", () => this.resize());

    this.debugCollisions = false;
    this._lastColLog = 0;

    this.lastTime = 0;
    this.init();
  }

  async init() {
    const { spawn } = await this.level.loadHouse("./assets/models/House.glb");
    if (spawn) {
      this.camera.position.copy(spawn);
      this.camera.position.y += this.eye.standY;
    } else {
      this.camera.position.set(3, 2, -6);
    }

    // ✅ EMPTY_NAMES anchor’ını bul
    this.namesAnchor = this.level.root?.getObjectByName("EMPTY_NAMES") ?? null;
    console.log("[NAMES] anchor:", this.namesAnchor ? "FOUND" : "NOT FOUND");

    // ışıkları kur
    this.setupInteractiveLightsFromHouse();

    // duvar collider’larından shadow blocker üret
    this.buildShadowBlockersFromWallColliders();

    // Spawn anında duvar içine doğduysan dışarı ittir
    this.resolveCollisions(this.camera.position, 0.05, this.level.getAllColliders());

    await this.initPostFX();

    // crouch reference
    this.eye.baseY = this.camera.position.y - this.eye.standY;
    this.eye.curY = this.eye.standY;

    // UI ilk güncelle
    this.updateUI();
    this.hideInteractPrompt();
  }

  // ------------------------------------------------------------
  // NAMES VIEW
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  // SWITCH/LAMP -> INTERACTIVE SPOTLIGHT SETUP
  // ------------------------------------------------------------
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

      const light = new THREE.SpotLight(
        0xffffff,
        0.0,
        this.lightDistance,
        this.lightAngle,
        0.35,
        1.0
      );

      const wp = anchor.getWorldPosition(new THREE.Vector3());
      light.position.copy(wp);
      light.target.position.copy(wp.clone().add(new THREE.Vector3(0, -1, 0)));

      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0002;
      light.shadow.normalBias = 0.02;

      this.scene.add(light);
      this.scene.add(light.target);

      this.boundLights[id] = {
        light,
        isOn: false,
        intensityOn: 8.0,
      };
    }

    console.log(
      "[LIGHTING] switches:",
      this.switchRoots.map((s) => s.name),
      "lamps:",
      Object.keys(this.boundLights)
    );
  }

  toggleLightBySwitchName(switchName) {
    const id = switchName.replace("SWITCH_", "");
    const entry = this.boundLights[id];
    if (!entry) {
      console.warn("[LIGHTING] No lamp bound for", switchName, "(expected LAMP_" + id + ")");
      return;
    }

    entry.isOn = !entry.isOn;
    entry.light.intensity = entry.isOn ? entry.intensityOn : 0.0;
  }

  buildShadowBlockersFromWallColliders() {
    const colliders = this.level.getAllColliders();

    if (this._shadowBlockers) {
      for (const m of this._shadowBlockers) this.scene.remove(m);
    }
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

    console.log("[SHADOW] wall blockers:", this._shadowBlockers.length);
  }

  resolveCollisions(pos, radius, colliders) {
    let hitAny = false;
    let hitNames = [];

    for (const c of colliders) {
      const b = c.box;
      const playerMinY = pos.y - 1.6;
      const playerMaxY = pos.y + 0.2;
      if (playerMaxY < b.min.y || playerMinY > b.max.y) continue;

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
      if (now - (this._lastColLog ?? 0) > 200) {
        this._lastColLog = now;
        const uniq = [...new Set(hitNames)];
        console.log(
          "[COLLISION]",
          "pos:",
          pos.x.toFixed(2),
          pos.y.toFixed(2),
          pos.z.toFixed(2),
          "hit:",
          uniq
        );
      }
    }
  }

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

    this.updateUI();
  }

  updateUI() {
    const now = document.getElementById("cardsNow");
    const total = document.getElementById("cardsTotal");
    if (now) now.textContent = String(this.inventoryCards);
    if (total) total.textContent = String(this.totalCards);

    const ui = document.getElementById("ui");
    if (ui) ui.innerText = `Kartlar: ${this.inventoryCards} / ${this.totalCards}`;
  }

  // ------------------------------------------------------------
  // FreeCam + crouch
  // ------------------------------------------------------------
  toggleFreeCam() {
    // Names fly sırasında aç/kapa yapma
    if (this.namesFly.active) return;

    // Enter FreeCam: save current FPS pose
    if (!this.freeCam.enabled) {
      this.freeCam.savedPos.copy(this.camera.position);
      this.freeCam.savedQuat.copy(this.camera.quaternion);
      this.freeCam.hasSaved = true;

      this.freeCam.enabled = true;
      this.showModeToast("FREE CAMERA: ON (6DOF)");
      return;
    }

    // Exit FreeCam: restore pose
    this.freeCam.enabled = false;

    if (this.freeCam.hasSaved) {
      this.camera.position.copy(this.freeCam.savedPos);
      this.camera.quaternion.copy(this.freeCam.savedQuat);
    }

    // reset roll
    

    // recompute crouch base from restored pose
    this.eye.baseY = this.camera.position.y - this.eye.curY;

    this.showModeToast("FREE CAMERA: OFF");

  }

  resetFreeCamRoll() {
    if (!this.freeCam.enabled) return;
  
    // Keep current yaw/pitch, remove roll by rebuilding quaternion from Euler with Z=0
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    e.z = 0;
    this.camera.quaternion.setFromEuler(e);
  }
  showModeToast(text) {
    if (!this._modeToastEl) return;
    this._modeToastEl.textContent = text;
    this._modeToastEl.style.display = "block";
  
    if (this._modeToastTimer) clearTimeout(this._modeToastTimer);
    this._modeToastTimer = setTimeout(() => {
      if (this._modeToastEl) this._modeToastEl.style.display = "none";
    }, 1500);
  }
  
  

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

  start() {
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(tMs) {
    const t = tMs * 0.001;
    const dt = t - this.lastTime;
    this.lastTime = t;

    this.update(dt);
    this.updatePostFXUniforms(t);

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    requestAnimationFrame((t2) => this.loop(t2));
  }

  // ------------------------------------------------------------
  // INTERACT HUD
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  update(dt) {
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

    // WASD move
    const speed = (this.keys.has("ShiftLeft") ? 8 : 4) * dt;
    const dir = new THREE.Vector3();

    if (this.keys.has("KeyW")) dir.z += 1;
    if (this.keys.has("KeyS")) dir.z -= 1;
    if (this.keys.has("KeyA")) dir.x -= 1;
    if (this.keys.has("KeyD")) dir.x += 1;

    dir.normalize();
    this.controls.moveRight(dir.x * speed);
    this.controls.moveForward(dir.z * speed);
    // --- collision resolution (FPS mode only) ---
    if (!this.freeCam.enabled) {
      // radius'u senin koridor genişliğine göre ayarla: 0.25-0.35 iyi
      this.resolveCollisions(this.camera.position, 0.28, this.level.getAllColliders());
    }


    // 6DOF vs crouch
    if (this.freeCam.enabled) {
      // Y translation
      const vs = this.freeCam.verticalSpeed * dt;
      if (this.keys.has("Space")) this.camera.position.y += vs;
      if (this.keys.has("ControlLeft") || this.keys.has("ControlRight")) this.camera.position.y -= vs;

      // roll rotation (Q / Z)
      const rs = this.freeCam.rollSpeed * dt;
      if (this.keys.has("KeyQ")) this.camera.rotateZ(rs);
      if (this.keys.has("KeyZ")) this.camera.rotateZ(-rs);

    } else {
      // crouch (C) always available in FPS mode
      const targetY = this.keys.has("KeyC") ? this.eye.crouchY : this.eye.standY;
      const a = 1 - Math.exp(-this.eye.smooth * dt);
      this.eye.curY += (targetY - this.eye.curY) * a;
      this.camera.position.y = this.eye.baseY + this.eye.curY;
    }

    // rotate cards
    for (const o of this.objects) {
      if (o.userData.type === "card") o.rotation.y += 2.0 * dt;
    }

    // doors animate
    const OPEN_ANGLE = -Math.PI / 2;
    const SPEED = 2.5;
    for (const d of this.level.doors) {
      const target = d.isOpen ? OPEN_ANGLE : 0;
      const diff = target - d.angle;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), SPEED * dt);
      d.angle += step;
      d.mesh.rotation.y = d.angle;
    }

    this.level.updateDynamicColliders();
    this.updateInteractHUD();
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
        return;
      }
    }
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(innerWidth, innerHeight);
    if (this.postPassA?.uniforms) this.postPassA.uniforms.uResolution.value.set(innerWidth, innerHeight);
    if (this.postPassB?.uniforms) this.postPassB.uniforms.uResolution.value.set(innerWidth, innerHeight);
  }
}
