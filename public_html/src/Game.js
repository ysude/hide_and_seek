import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import SceneManager from "./core/SceneManager.js";
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

    this.controls = new PointerLockControls(this.camera, document.body);
    document.body.addEventListener("click", () => this.controls.lock());

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.15));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.05));
    const dir = new THREE.DirectionalLight(0xffffff, 0.25);
    dir.position.set(3, 10, 5);
    this.scene.add(dir);

    // gameplay
    this.inventoryCards = 0;
    this.totalCards = 3;
    this.objects = []; // quest objeleri
    this.keys = new Set();

    // ---- SWITCH/LAMP interactive lighting ----
    this.switchRoots = [];     // raycast hedefleri (switch root objeler)
    this.lampAnchors = {};     // { id: Object3D (empty) }
    this.boundLights = {};     // { id: { light, isOn, intensityOn } }
    this.lightDistance = 25;
    this.lightAngle = Math.PI / 4;

    // ---- NAMES VIEW (camera fly) ----
    this.namesAnchor = null; // EMPTY_NAMES object
    this.namesMode = false;  // currently showing names view?
    this.namesFly = {
      active: false,
      t: 0,
      dur: 1.25,             // seconds
      fromPos: new THREE.Vector3(),
      toPos: new THREE.Vector3(),
      fromQuat: new THREE.Quaternion(),
      toQuat: new THREE.Quaternion(),
      savedPos: new THREE.Vector3(),
      savedQuat: new THREE.Quaternion(),
    };
    // Top-down offset: anchor’ın üstünden bakış
    this.namesTopDownHeight = 14.0; // ev scale’ine göre gerekirse 20-30 yap
    this.namesTopDownForward = 0.001; // tam üstte gimbal hissi olmasın diye

    // ---- Interact HUD ----
    this.interactMaxDist = 3.0;
    this.interactState = {
      visible: false,
      type: null,          // "card" | "switch" | "door"
      id: null,            // "MAIN" / "Door_003" / etc.
      object: null,        // THREE.Object3D
      doorEntry: null,     // Level door entry
      text: "",
    };
    this._interactPromptEl = document.getElementById("interactPrompt");
    this._interactTextEl = document.getElementById("interactText");

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

      // Help toggle
      if (e.code === "KeyH") {
        const help = document.getElementById("helpOverlay");
        if (help) help.style.display = (help.style.display === "block") ? "none" : "block";
      }

      // ✅ Names view toggle
      if (e.code === "KeyN") {
        this.toggleNamesView();
      }

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
      this.camera.position.y += 1.7;
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
    if (this.namesFly.active) return; // transition sırasında spam engelle

    // PointerLock açıkken kamerayı script ile animasyonlamak için unlock daha stabil
    if (this.controls.isLocked) this.controls.unlock();

    // toggle hedef: names’e git / geri dön
    if (!this.namesMode) {
      // current -> names top-down
      this.namesFly.savedPos.copy(this.camera.position);
      this.namesFly.savedQuat.copy(this.camera.quaternion);

      const anchorWp = this.namesAnchor.getWorldPosition(new THREE.Vector3());

      const targetPos = anchorWp.clone().add(new THREE.Vector3(0, this.namesTopDownHeight, 0));

      // anchor’a baksın (tam aşağı). Küçük forward veriyoruz.
      const lookAtTarget = anchorWp.clone().add(new THREE.Vector3(0, 0, this.namesTopDownForward));
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(targetPos, lookAtTarget, new THREE.Vector3(0, 0, -1))
      );

      this.beginCameraFly(targetPos, targetQuat);
      this.namesMode = true;
    } else {
      // names -> saved
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

    // smoothstep easing
    const s = u * u * (3 - 2 * u);

    this.camera.position.lerpVectors(this.namesFly.fromPos, this.namesFly.toPos, s);
    this.camera.quaternion.copy(this.namesFly.fromQuat).slerp(this.namesFly.toQuat, s);


    if (u >= 1) {
      this.namesFly.active = false;
    }
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
      if (n.startsWith("SWITCH_")) {
        this.switchRoots.push(obj);
      }
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
      mesh.receiveShadow = false;

      this.scene.add(mesh);
      this._shadowBlockers.push(mesh);
    }

    console.log("[SHADOW] wall blockers:", this._shadowBlockers.length);
  }

  // ------------------------------------------------------------

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

  start() {
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(tMs) {
    const t = tMs * 0.001;
    const dt = t - this.lastTime;
    this.lastTime = t;

    this.update(dt);
    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame((t2) => this.loop(t2));
  }

  // ------------------------------------------------------------
  // INTERACT HUD (what am I looking at?)
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
    // Transition sırasında etkileşim prompt’u göstermeyelim
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
    // ✅ Kamera fly varsa input/interaction kapat, sadece animasyonu çalıştır
    if (this.namesFly.active) {
      this.hideInteractPrompt();
      this.updateCameraFly(dt);
      return;
    }

    if (!this.controls.isLocked) {
      this.hideInteractPrompt();
      return;
    }

    const speed = (this.keys.has("ShiftLeft") ? 8 : 4) * dt;
    const dir = new THREE.Vector3();

    if (this.keys.has("KeyW")) dir.z += 1;
    if (this.keys.has("KeyS")) dir.z -= 1;
    if (this.keys.has("KeyA")) dir.x -= 1;
    if (this.keys.has("KeyD")) dir.x += 1;

    dir.normalize();
    this.controls.moveRight(dir.x * speed);
    this.controls.moveForward(dir.z * speed);

    this.resolveCollisions(this.camera.position, 0.35, this.level.getAllColliders());

    for (const o of this.objects) {
      if (o.userData.type === "card") o.rotation.y += 2.0 * dt;
    }

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
    // transition sırasında etkileşim yok
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
  }
}
