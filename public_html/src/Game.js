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
    this.scene.add(floor);

    this.level = new Level(this.scene);
    this.buildQuest();

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);

      // Help toggle (opsiyonel)
      if (e.code === "KeyH") {
        const help = document.getElementById("helpOverlay");
        if (help) help.style.display = (help.style.display === "block") ? "none" : "block";
      }

      if (e.code === "KeyE") this.tryInteract();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("resize", () => this.resize());

    this.debugCollisions = true;
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


    // ışıkları kur
    this.setupInteractiveLightsFromHouse();

    // ✅ duvar collider’larından shadow blocker üret
    this.buildShadowBlockersFromWallColliders();

    // Spawn anında duvar içine doğduysan dışarı ittir
    this.resolveCollisions(this.camera.position, 0.05, this.level.getAllColliders());

    // UI ilk güncelle
    this.updateUI();
    this.hideInteractPrompt();
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

    // Her LAMP için spotlight oluştur
    for (const id of Object.keys(this.lampAnchors)) {
      const anchor = this.lampAnchors[id];

      const light = new THREE.SpotLight(
        0xffffff,
        0.0,                 // başlangıç kapalı
        this.lightDistance,  // distance
        this.lightAngle,     // angle
        0.35,                // penumbra
        1.0                  // decay
      );


      // Anchor world pos
      const wp = anchor.getWorldPosition(new THREE.Vector3());
      light.position.copy(wp);

      // Target: aşağı
      light.target.position.copy(wp.clone().add(new THREE.Vector3(0, -1, 0)));

      this.scene.add(light);
      this.scene.add(light.target);

      this.boundLights[id] = {
        light,
        isOn: false,
        intensityOn: 8.0,
      };

      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0002;        // acne olursa bunu değiştiririz
      light.shadow.normalBias = 0.02;     // shadow acne azaltır

      const helper = new THREE.SpotLightHelper(light);
this.scene.add(helper);

// update’te her frame helper’ı güncelle
this._lightHelpers = this._lightHelpers || [];
this._lightHelpers.push(helper);



    }

    console.log(
      "[LIGHTING] switches:",
      this.switchRoots.map(s => s.name),
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
    // Level collider listesi: { name, box } formatında zaten var
    const colliders = this.level.getAllColliders();
  
    // Eski blocker’ları temizle (yeniden load vs olursa)
    if (this._shadowBlockers) {
      for (const m of this._shadowBlockers) this.scene.remove(m);
    }
    this._shadowBlockers = [];
  
    // Görünmez ama gölge atan materyal
    const mat = new THREE.ShadowMaterial({ opacity: 0.0 }); // 0 => tamamen görünmez
  
    for (const c of colliders) {
      const n = c.name || "";
      if (!n.startsWith("COL_WALL")) continue; // ✅ sadece duvar collider’ları
  
      const b = c.box; // THREE.Box3
  
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      b.getSize(size);
      b.getCenter(center);
  
      // Çok ince collider varsa, gölge stabil olsun diye minimum kalınlık ver
      size.x = Math.max(size.x, 0.05);
      size.y = Math.max(size.y, 0.05);
      size.z = Math.max(size.z, 0.05);
  
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(center);
  
      // Shadow için kritik flag’ler
      mesh.castShadow = true;     // ✅ ışığı kessin
      mesh.receiveShadow = false; // gerek yok
  
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

  // Returns {type, object, doorEntry, id, distance}
  scanInteractable() {
    // Pointer lock yoksa prompt gösterme
    if (!this.controls.isLocked) return null;

    this._ray.setFromCamera(this._centerNdc, this.camera);

    // 1) Cards (quest objects)
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

    // Prompt text üret
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

    // collision (static + door dynamic)
    this.resolveCollisions(this.camera.position, 0.35, this.level.getAllColliders());

    // quest obj anim
    for (const o of this.objects) {
      if (o.userData.type === "card") o.rotation.y += 2.0 * dt;
    }

    // DOOR ANIMATION
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

    // ✅ her frame “neyi etkileşebilirsin?” UI güncelle
    this.updateInteractHUD();
  }

  tryInteract() {
    // ✅ Önce HUD’nin bulduğu şeyi kullan (en tutarlı davranış)
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

    // fallback: eğer prompt görünmüyorsa eski raycast logic’i çalıştırma (karışmasın)
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
