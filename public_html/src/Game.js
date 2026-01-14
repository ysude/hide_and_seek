import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import SceneManager from "./core/SceneManager.js";
import { Level } from "./entities/Level.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    // Renk uzayını Sinematik (ACESFilmic) yapıyoruz, bu önemli.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // === AUDIO ===
    this.listener = new THREE.AudioListener();
    this.audioLoader = new THREE.AudioLoader();

    // === HORROR BACKGROUND AMBIENCE ===
    this.horrorAmbience = new THREE.Audio(this.listener);
    this.horrorAmbienceVolume = 0.25;
    this.horrorFadeSpeed = 0.15; // saniyede artış
    this.horrorTargetVolume = this.horrorAmbienceVolume;
    this.horrorActive = false;

    // === KNOCK TICK SOUND ===
    this.knockTickSound = new THREE.PositionalAudio(this.listener);
    this.knockTickTimer = 0;
    this.knockTickInterval = THREE.MathUtils.randFloat(10, 20);


    // One-shot korku sesleri
    this.scareSoundTimer = 0;
    this.scareSoundInterval = THREE.MathUtils.randFloat(6, 12);


    // Elektrik / fener
    this.lightBuzzSound         =  new THREE.Audio(this.listener);
    this.flashClickSound        =  new THREE.Audio(this.listener);
    this.doorSound              =  new THREE.Audio(this.listener);
    this.flashlightBrokenSound  = new THREE.Audio(this.listener);
    
    
    // === AUTO DOOR TRIGGER ===
    this.autoDoorCheckTimer = 0;
    this.autoDoorCheckInterval = 0.25; // saniyede 4 kez kontrol


    this.scene = new THREE.Scene();
    // Arka planı tam siyah yap
    this.scene.background = new THREE.Color(0x000000);

    // Kamerayı çok yakındaki nesneleri kesmemesi için 0.01'e çektik
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 500);
    this.camera.position.set(0, 2, 10);

    this.flashlight = null;
    this.flashlightLight = null;
    this.flashlightOn = true;

    // === FLASHLIGHT PRE-FLICKER ===
    this.flashPreFlicker = false;
    this.flashPreFlickerTime = 0;
    this.flashPreFlickerDuration = 2.0; // 1 saniye
    
    // === FLASHLIGHT FAILURE SYSTEM ===
    this.flashFailTimer = 0;
    this.flashFailInterval = 0;

    this.flashFailing = false;
    this.flashFailRecoverTimer = 0;

    this.flashSavedIntensity = 0;
    this.flashSavedAngle = 0;

    this.debugAmbient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.debugAmbient)
    
    // === FLASHLIGHT SCROLL (İLERİ–GERİ) ===
    this.flashScrollSpeed = 0.08;
    this.flashMinZ = -0.9;
    this.flashMaxZ = -0.3;

    // === FLASHLIGHT LENS (MERCEK) ===
    this.flashConeMin = Math.PI / 30;
    this.flashConeMax = Math.PI / 5;  // geniş
    this.flashConeStep = 0.02;

    // Işık gücü aralığı
    this.flashIntensityMin = 1.0;  // geniş açıda
    this.flashIntensityMax = 12.0;  // dar açıda
    
    // Fener ucu referansları
    this.flashlightLightPoint = null;
    this.flashlightLightTarget = null;

    // Debug ayarları (K ve L tuşları için)
    this.flashAxisMode = "pos";
    this.flashAxis = "x";
    this.flashStepPos = 0.05;
    this.flashStepRot = 0.05;

    // korkutmak için
    this.lightFlickerTimer = 0; // ışık için
    this.lightFlickerInterval = 0; // ışık için
    this.autoCloseDoorCooldown = 0; // kapılar için


    this.jumpQueued = false; // Zıplama tuşu için

    this.controls = new PointerLockControls(this.camera, document.body);
    document.body.addEventListener("click", () => this.controls.lock());

    // --- IŞIKLARI HAZIRLAMAK (Referans görsel için ilk adım) ---
    // Ortam ışığını çok kıstık ve maviye çektik (Ay ışığı gibi)
    this.scene.add(new THREE.HemisphereLight(0x223344, 0x111122, 0.05));
    // Genel aydınlatmayı neredeyse sıfırladık
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.01));

    // Güneş ışığını (DirectionalLight) KALDIRDIK. 
    // Korku oyununda ana ışık sadece fener olmalı.
    // Eğer camdan ay ışığı girsin istersen, çok düşük şiddette (intensity: 0.1) geri ekleyebilirsin.

    this.inventoryCards = 0;
    this.totalCards = 3;
    this.objects = [];
    this.keys = new Set();

    this.player = {
      velocity: new THREE.Vector3(),
      onGround: false,
      jumpForce: 15,
      height: 1.7,
      radius: 0.35
    };

    this.jumpQueued = false; // Zıplama tuşu için


    this.switchRoots = [];
    this.lampAnchors = {};
    this.boundLights = {};
    this.lightDistance = 25;
    this.lightAngle = Math.PI / 4;

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

    this._ray = new THREE.Raycaster();
    this._centerNdc = new THREE.Vector2(0, 0);

    this.level = new Level(this.scene);
    this.buildQuest();

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);

      if (e.code === "KeyH") {
        const help = document.getElementById("helpOverlay");
        if (help) help.style.display = (help.style.display === "block") ? "none" : "block";
      }

      if (e.code === "KeyF" && this.flashlightLight) {

      // 🔊 SWITCH SESİ
      if (this.flashlightSwitchSound) {
        if (this.flashlightSwitchSound.isPlaying) {
          this.flashlightSwitchSound.stop();
        }
        this.flashlightSwitchSound.play();
      }

      // 🔦 FENER AÇ / KAPA
      this.flashlightOn = !this.flashlightOn;
      this.flashlightLight.intensity = this.flashlightOn ? 6.0 : 0.0;
    }

      if (e.code === "KeyN") this.toggleNamesView();
      if (e.code === "KeyE") this.tryInteract();

      // Canlı düzenleme tuşları
      if (e.code === "KeyK") this.flashAxisMode = "pos";
      if (e.code === "KeyL") this.flashAxisMode = "rot";
      if (e.code === "Digit1") this.flashAxis = "x";
      if (e.code === "Digit2") this.flashAxis = "y";
      if (e.code === "Digit3") this.flashAxis = "z";

      if (this.flashlight) {
        if (e.code === "ArrowUp") this.adjustFlashlight(+1);
        if (e.code === "ArrowDown") this.adjustFlashlight(-1);
      }

      if (e.code === "Space") {
        this.jumpQueued = true;
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);

      if (e.code === "Space") {
        this.jumpQueued = false;
      }
    });


    window.addEventListener("wheel", (e) => {
      if (!this.flashlightLight) return;
      if (!this.flashlightOn) return; // 👈 KRİTİK SATIR

      const dir = Math.sign(e.deltaY);

      this.flashlightLight.angle = THREE.MathUtils.clamp(
        this.flashlightLight.angle + dir * this.flashConeStep,
        this.flashConeMin,
        this.flashConeMax
      );

      const t = THREE.MathUtils.inverseLerp(
        this.flashConeMin,
        this.flashConeMax,
        this.flashlightLight.angle
      );

      this.flashlightLight.intensity = THREE.MathUtils.lerp(
        this.flashIntensityMax, // dar = güçlü
        this.flashIntensityMin, // geniş = zayıf
        t
      );
    });




    window.addEventListener("resize", () => this.resize());

    this.debugCollisions = false;
    this._lastColLog = 0;

    this.lastTime = 0;
    this.init();

    this.WEAPON_LAYER = 1;
    this.camera.layers.enable(this.WEAPON_LAYER);
  }

  adjustFlashlight(dir) {
    if (!this.flashlight) return;

    if (this.flashAxisMode === "pos") {
      const step = this.flashStepPos * dir;
      if (this.flashAxis === "x") this.flashlight.position.x += step;
      if (this.flashAxis === "y") this.flashlight.position.y += step;
      if (this.flashAxis === "z") this.flashlight.position.z += step;
    }

    if (this.flashAxisMode === "rot") {
      const step = this.flashStepRot * dir;
      if (this.flashAxis === "x") this.flashlight.rotation.x += step;
      if (this.flashAxis === "y") this.flashlight.rotation.y += step;
      if (this.flashAxis === "z") this.flashlight.rotation.z += step;
    }
    
    console.log(
        "POS:", 
        this.flashlight.position.x.toFixed(2), 
        this.flashlight.position.y.toFixed(2), 
        this.flashlight.position.z.toFixed(2),
        " | ROT:",
        this.flashlight.rotation.x.toFixed(2), 
        this.flashlight.rotation.y.toFixed(2), 
        this.flashlight.rotation.z.toFixed(2)
    );
  }

  async init() {
    this.scene.add(this.camera);
    this.camera.add(this.listener); // ✅ DOĞRU YER

    // 🔊 FLASHLIGHT SWITCH SOUND
    this.flashlightSwitchSound = new THREE.Audio(this.listener);
    this.audioLoader.load(
      "./assets/audio/flashlight_switch.mp3",
      (buffer) => {
        this.flashlightSwitchSound.setBuffer(buffer);
        this.flashlightSwitchSound.setVolume(0.6);
      }
    );

    this.lightBuzzSound = new THREE.Audio(this.listener);
    this.audioLoader.load(
      "./assets/audio/electric_buzz.mp3",
      (buffer) => {
        this.lightBuzzSound.setBuffer(buffer);
        this.lightBuzzSound.setVolume(0.55);
      }
    );

    this.flashClickSound = new THREE.Audio(this.listener);
    this.audioLoader.load(
      "./assets/audio/flashlight_switch.mp3",
      (buffer) => {
        this.flashClickSound.setBuffer(buffer);
        this.flashClickSound.setVolume(0.6);
      }
    );

    this.audioLoader.load(
      "./assets/audio/door_open.mp3",
      (buffer) => {
        this.doorSound.setBuffer(buffer);
        this.doorSound.setVolume(0.7);
      }
    );

    this.audioLoader.load(
      "./assets/audio/horror_background.mp3",
      (buffer) => {
        this.horrorAmbience.setBuffer(buffer);
        this.horrorAmbience.setLoop(true);
        this.horrorAmbience.setVolume(0.0); // fade ile açacağız
        this.horrorAmbience.play();
        this.horrorActive = true;
      }
    );

    this.audioLoader.load(
      "./assets/audio/flashlight_broken.mp3",
      (buffer) => {
        this.flashlightBrokenSound.setBuffer(buffer);
        this.flashlightBrokenSound.setVolume(0.5); // korkutucu ama abartısız
      }
    );

    this.audioLoader.load(
      "./assets/audio/knock_knock.mp3",
      (buffer) => {
        this.knockTickSound.setBuffer(buffer);
        this.knockTickSound.setVolume(0.85);
        this.knockTickSound.setRefDistance(6);     // 👈 mesafe hissi
        this.knockTickSound.setRolloffFactor(1.2);
      }
    );


    const { spawn } = await this.level.loadHouse("./assets/models/House.glb");

    this.buildFloor();
    this.buildRoofCollider();
    
    await this.loadFlashlight();

    if (spawn) {
      this.camera.position.copy(spawn);
      this.camera.position.y += this.player.height;
    } else {
      this.camera.position.set(3, 2, -6);
    }

    this.namesAnchor = this.level.root?.getObjectByName("EMPTY_NAMES") ?? null;

    this.setupInteractiveLightsFromHouse();
    this.resolveCollisions(this.camera.position, 0.5, this.level.getAllColliders());

    this.updateUI();
    this.hideInteractPrompt();

  }

  buildFloor() {
    const floorCollider = {
      name: "COL_FLOOR_MAIN",
      box: new THREE.Box3(
        new THREE.Vector3(-50, -1.0, -50),
        new THREE.Vector3(50, -0.9, 50)
      )
    };

    if (!this.level.staticColliders) {
      this.level.staticColliders = [];
    }
    this.level.staticColliders.push(floorCollider);

    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(200, 0.1, 200),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    floorMesh.position.set(0, -0.2, 0);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);
  }

  buildRoofCollider() {
    // Tavan yüksekliği (3.0 ile 4.0 arası idealdir, test için 3.0 yapalım)
    const CEILING_Y = 5.0; 

    const ceilingCollider = {
      name: "COL_CEILING_MAIN",
      isCeiling: true, // Zıplama kontrolü için bu flag şart
      box: new THREE.Box3(
        // X ve Z'yi çok geniş tutuyoruz ki evin her yerini kapsasın
        new THREE.Vector3(-100, CEILING_Y, -100),
        new THREE.Vector3( 100, CEILING_Y + 1.0, 100)
      )
    };

    // Diziyi güvenli oluştur
    if (!this.level.staticColliders) {
      this.level.staticColliders = [];
    }
    this.level.staticColliders.push(ceilingCollider);

  }

  toggleNamesView() {
    if (!this.namesAnchor) return;
    if (this.namesFly.active) return;

    if (this.controls.isLocked) this.controls.unlock();

    if (!this.namesMode) {
      this.namesFly.savedPos.copy(this.camera.position);
      this.namesFly.savedQuat.copy(this.camera.quaternion);

      const anchorWp = this.namesAnchor.getWorldPosition(new THREE.Vector3());
      const targetPos = anchorWp.clone().add(new THREE.Vector3(0, this.namesTopDownHeight, 0));
      const lookAtTarget = anchorWp.clone().add(new THREE.Vector3(0, 0.01, this.namesTopDownForward));

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

    if (u >= 1) {
      this.namesFly.active = false;
    }
  }

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
      const light = new THREE.SpotLight(0xffffff, 0.0, this.lightDistance, this.lightAngle, 0.35, 1.0);

      const wp = anchor.getWorldPosition(new THREE.Vector3());
      light.position.copy(wp);
      light.position.y -= 0.15;

      light.target.position.set(wp.x, wp.y - 5, wp.z);
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0002;
      light.shadow.normalBias = 0.02;
      light.angle = Math.PI / 3;  // (3-3.5 iyi bence) açısını değiştiriyor /1 diyince daha tepeden /10 diyince en aşağıya daha düz bir ışık
      light.penumbra = 0.4;       // odanın ışık şiddeti gibi düşünülebilir


      this.scene.add(light);
      this.scene.add(light.target);

      // yardımcı fonksiyonlar var ışıkların konumunu ve yönünü gösteriyor, istersen açabilirsin
      // const helper = new THREE.SpotLightHelper(light);
      // this.scene.add(helper);

      this.boundLights[id] = { light, isOn: false, intensityOn: 8.0 };
    }
  }

  toggleLightBySwitchName(switchName) {
    const id = switchName.replace("SWITCH_", "");
    const entry = this.boundLights[id];
    if (!entry) return;

    entry.isOn = !entry.isOn;
    entry.light.intensity = entry.isOn ? entry.intensityOn : 0.0;
  }

  resolveCollisions(pos, radius, colliders) {
    this.player.onGround = false;

    if (pos.y < this.player.height) {
      pos.y = this.player.height;
      this.player.velocity.y = 0;
      this.player.onGround = true;
    }

    const playerHead = pos.y + 0.2;
    const playerFeet = pos.y - this.player.height;

    for (const c of colliders) {
      const b = c.box;

      if (pos.x >= b.min.x - radius && pos.x <= b.max.x + radius &&
        pos.z >= b.min.z - radius && pos.z <= b.max.z + radius) {

      if (
        !c.isCeiling &&
        this.player.velocity.y <= 0 &&
        playerFeet <= b.max.y &&
        playerFeet >= b.max.y - 0.15
      ) {
        pos.y = b.max.y + this.player.height;
        this.player.onGround = true;
        this.player.velocity.y = 0;
      }


        const CEILING_EPS = 0.45;
        const CEILING_PUSH = 0.005;

        if (c.isCeiling && this.player.velocity.y > 0 && playerHead >= b.min.y - CEILING_EPS) {
  this.player.velocity.y = 0;
  pos.y = b.min.y - this.player.height - CEILING_PUSH;
}
      }

      if (playerHead < b.min.y || playerFeet > b.max.y) continue;

      const closestX = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const closestZ = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const dist2 = dx * dx + dz * dz;

      if (dist2 < radius * radius) {
        const dist = Math.sqrt(dist2) || 0.0001;
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
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
    const dt = Math.min(t - this.lastTime, 0.1);
    this.lastTime = t;

    this.update(dt);
    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame((t2) => this.loop(t2));
  }

  hideInteractPrompt() {
    if (this._interactPromptEl) this._interactPromptEl.style.display = "none";
    this.interactState.visible = false;
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

    const questHits = this._ray.intersectObjects(this.objects, false);
    if (questHits.length) {
      const hit = questHits[0].object;
      const wp = hit.getWorldPosition(new THREE.Vector3());
      const dist = wp.distanceTo(this.camera.position);
      if (dist <= this.interactMaxDist && hit.userData?.type === "card") {
        return { type: "card", object: hit, id: "CARD", doorEntry: null };
      }
    }

    if (this.switchRoots.length) {
      const switchHits = this._ray.intersectObjects(this.switchRoots, true);
      if (switchHits.length) {
        let cur = switchHits[0].object;
        let switchRootName = null;
        while (cur) {
          const n = cur.name || "";
          if (n.startsWith("SWITCH_")) {
            switchRootName = n;
            break;
          }
          cur = cur.parent;
        }
        if (switchRootName) {
          const wp = switchHits[0].object.getWorldPosition(new THREE.Vector3());
          const dist = wp.distanceTo(this.camera.position);
          if (dist <= this.interactMaxDist) {
            const id = switchRootName.replace("SWITCH_", "");
            return { type: "switch", object: switchHits[0].object, id, doorEntry: null };
          }
        }
      }
    }

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
            return { type: "door", object: hitObj, id: doorName, doorEntry };
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

    this.interactState = { ...this.interactState, ...info };

    if (info.type === "card") {
      this.showInteractPrompt("Pick up card");
    } else if (info.type === "switch") {
      const entry = this.boundLights[info.id];
      const state = entry ? (entry.isOn ? "ON" : "OFF") : "UNBOUND";
      this.showInteractPrompt(`Toggle switch ${info.id} (${state})`);
    } else if (info.type === "door") {
      const state = info.doorEntry?.isOpen ? "Close" : "Open";
      this.showInteractPrompt(`${state} ${info.id}`);
    }
  }

  update(dt) {

    // background audio korkutması
    this.updateHorrorAmbience(dt);
    this.updateKnockTick(dt);
    this.updateAutoDoorTrigger(dt);


    if (this.namesFly.active) {
      this.hideInteractPrompt();
      this.updateCameraFly(dt);
      return;
    }

    if (!this.controls.isLocked) {
      this.hideInteractPrompt();
      return;
    }


    // audio korkutması
    this.scareSoundTimer += dt;
    if (this.scareSoundTimer > this.scareSoundInterval) {
      this.scareSoundTimer = 0;
      this.scareSoundInterval = THREE.MathUtils.randFloat(8, 15);

      if (Math.random() < 0.6) {
        this.playRandomScareSound();
      }
    }


    // el feneri için arıza sistemi
    this.updateFlashlightFailure(dt);

    // background audio korkutması
    this.updateHorrorAmbience(dt);



    // kapı kapanması için
    this.autoCloseDoorCooldown -= dt;
    if (this.autoCloseDoorCooldown <= 0) {
      this.tryAutoCloseDoor();
      this.autoCloseDoorCooldown = THREE.MathUtils.randFloat(10, 18);
    }
    
    this.updateAutoDoorTrigger(dt);

    const speed = (this.keys.has("ShiftLeft") ? 8 : 4) * dt;
    const dir = new THREE.Vector3();
    if (this.keys.has("KeyW")) dir.z += 1;
    if (this.keys.has("KeyS")) dir.z -= 1;
    if (this.keys.has("KeyA")) dir.x -= 1;
    if (this.keys.has("KeyD")) dir.x += 1;

    dir.normalize();
    this.controls.moveRight(dir.x * speed);
    this.controls.moveForward(dir.z * speed);

    this.player.velocity.y -= 60.0 * dt;
    this.camera.position.y += this.player.velocity.y * dt;

    const allColliders = [
        ...this.level.getAllColliders(), 
        ...(this.level.staticColliders || [])
    ];
    this.resolveCollisions(this.camera.position, 0.5, allColliders);

    if (this.player.onGround && this.jumpQueued) {
      this.player.velocity.y = 15; // SABİT
      this.player.onGround = false;
      this.jumpQueued = false;
    }

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

    this.updateLightFlicker(dt); // ışık korkutması


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
      } else if (this.interactState.type === "switch") {
        const id = this.interactState.id;

        // 🔊 ODA LAMBASI CLICK SESİ
        if (this.flashClickSound) {
          if (this.flashClickSound.isPlaying) {
            this.flashClickSound.stop();
          }
          this.flashClickSound.play();
        }

        this.toggleLightBySwitchName("SWITCH_" + id);
      } else if (this.interactState.type === "door") {
        const d = this.interactState.doorEntry;
        if (d) d.isOpen = !d.isOpen;
        this.playDoorSound();

      }
    }
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
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
        // renderOrder'ı kaldırdım, bazen duvarların içinden görünmesine sebep olur.
        // obj.renderOrder = 10; 
        obj.layers.set(this.WEAPON_LAYER);

        const m = obj.material;
        if (m) {
          // Eğer modelin kendi texture'ı varsa (image_0.png'da var gibi görünüyor)
          // Metalness ve roughness'ı ona göre ayarlayalım.
          if (m.map) {
             m.metalness = 0.6; 
             m.roughness = 0.4;
          } else {
             // Texture yoksa manuel ayar
             m.metalness = 0.2; 
             m.roughness = 0.5;
             m.color.set(0x444444);
          }
          // Duvarların içine girmesin diye depthTest'i açtık.
          m.depthTest = true; 
          m.depthWrite = true;
        }
      }
    });

    // Fenerin boyutu ve konumu (FPS Görünümü için)
    this.flashlight.scale.set(0.01, 0.01, 0.01);
    // Sağ alt köşe:
    this.flashlight.position.set(0.10, -0.10, -0.20);
    // Ucu karşıya baksın:
    this.flashlight.rotation.set(0.15, 1.59, 0.15);

    this.camera.add(this.flashlight);
    
    // Işık ayarları (Daha odaklı ve parlak)
    this.flashlightLight = new THREE.SpotLight(0xffffff, 5.0, 25, Math.PI / 8, 0.5, 1);
    this.flashlightLight.castShadow = true;
    this.flashlightLight.shadow.mapSize.set(2048, 2048); // Gölgeler daha keskin olsun

    // === FENER UCU (LIGHT POINT) ===
    this.flashlightLightPoint = new THREE.Object3D();
    this.flashlightLightPoint.position.set(2.6, 0, 0);

    this.flashlightLightPoint.rotation.y = -Math.PI / 2;

    this.flashlight.add(this.flashlightLightPoint);

    // === SPOT LIGHT ===
    this.flashlightLight = new THREE.SpotLight(
      0xffffff,
      6.0,
      30,
      Math.PI / 9,
      0.35,
      1.0
    );

    this.flashlightLight.castShadow = true;
    this.flashlightLight.shadow.mapSize.set(2048, 2048);
    this.flashlightLight.shadow.bias = -0.0001;
    this.flashlightLight.shadow.normalBias = 0.02;

    this.flashlightLightPoint.add(this.flashlightLight);
    this.flashlightLight.position.set(0, 0, 0);

    // === TARGET ===
    this.flashlightLightTarget = new THREE.Object3D();
    this.flashlightLightTarget.position.set(0, 0, -1);
    this.flashlightLightPoint.add(this.flashlightLightTarget);

    this.flashlightLight.target = this.flashlightLightTarget;



    console.log("[FLASHLIGHT] ready");
  }

updateLightFlicker(dt) {

  // 🔍 Açık lamba var mı?
  const hasAnyLightOn = Object.values(this.boundLights)
    .some(entry => entry.isOn);

  this.lightFlickerTimer += dt;

  if (this.lightFlickerTimer > this.lightFlickerInterval) {
    this.lightFlickerTimer = 0;
    this.lightFlickerInterval = THREE.MathUtils.randFloat(4, 7);

    if (Math.random() < 0.7 && hasAnyLightOn) {

      // 🔊 BUZZ BAŞLASIN (üst üste binmesin)
      if (this.lightBuzzSound) {
        if (this.lightBuzzSound.isPlaying) {
          this.lightBuzzSound.stop();
        }
        this.lightBuzzSound.play();
      }

      // 🎚️ ambience biraz geri çekilsin
      this.horrorTargetVolume = 0.15;

      for (const id in this.boundLights) {
        const entry = this.boundLights[id];
        if (!entry.isOn) continue;

        const light = entry.light;
        const original = entry.intensityOn;

        // ⚡ ışık düşüşü
        light.intensity = original * 0.2;

        setTimeout(() => {
          light.intensity = original;
        }, THREE.MathUtils.randInt(300, 900));
      }

      // 🔇 Flicker bitince
      setTimeout(() => {
        if (this.lightBuzzSound?.isPlaying) {
          this.lightBuzzSound.stop();
        }
        this.horrorTargetVolume = this.horrorAmbienceVolume;
      }, 1000);
    }
  }

  // 🛑 Güvenlik: açık lamba yoksa buzz ASLA çalmasın
  if (!hasAnyLightOn && this.lightBuzzSound?.isPlaying) {
    this.lightBuzzSound.stop();
  }
}



tryAutoCloseDoor() {
  // Rastgele bir açık kapı bul
  const openDoors = this.level.doors.filter(d => d.isOpen);
  if (!openDoors.length) return;

  // %35 ihtimalle
  if (Math.random() > 0.35) return; //KAPI OTOMATİK YAKLAŞINCA AÇMA KAPAMA OLASILIĞI

  const door = openDoors[Math.floor(Math.random() * openDoors.length)];
  door.isOpen = false;
  this.playDoorSound();

  console.log("[EVENT] Door closed by itself:", door.mesh.name);
}


updateFlashlightFailure(dt) {
  if (!this.flashlightLight || !this.flashlightOn) return;

  // === KAPANMADAN ÖNCE TİTREME ===
  if (this.flashPreFlicker) {
    this.flashPreFlickerTime -= dt;

    this.flashlightLight.intensity =
      this.flashSavedIntensity *
      THREE.MathUtils.randFloat(0.1, 1.0);

    this.flashlightLight.angle =
      this.flashSavedAngle *
      THREE.MathUtils.randFloat(0.9, 1.1);

    if (this.flashPreFlickerTime <= 0) {
      this.flashPreFlicker = false;

      // TAM KAPANMA
      this.flashlightLight.intensity = 0;

      // Ne kadar kapalı kalacak
      this.flashFailRecoverTimer = THREE.MathUtils.randFloat(1.2, 2.5);
    }

    return;
  }

  // === KAPALI DURUM ===
  if (this.flashFailing) {
    this.flashFailRecoverTimer -= dt;

    if (this.flashFailRecoverTimer <= 0) {
      // 🔥 GERİ GELME
      this.flashlightLight.intensity = this.flashSavedIntensity;
      this.flashlightLight.angle = this.flashSavedAngle;

      this.flashFailing = false;
    }

    return;
  }

  // === NORMAL DURUM → ARIZA SAYACI ===
  this.flashFailTimer += dt;

  if (this.flashFailTimer > this.flashFailInterval) {
    this.flashFailTimer = 0;
    this.flashFailInterval = THREE.MathUtils.randFloat(5, 10);

    if (Math.random() < 0.3) {
      this.startFlashlightFailure();
    }
  }
}


startFlashlightFailure() {
  if (!this.flashlightLight) return;

  // 🔊 FAIL SESİ (CLICK DEĞİL)
  if (this.flashlightBrokenSound) {
    if (this.flashlightBrokenSound.isPlaying) {
      this.flashlightBrokenSound.stop();
    }
    this.flashlightBrokenSound.play();
  }

  // ambience yükselsin
  this.horrorTargetVolume = 0.45;

  this.flashFailing = true;
  this.flashSavedIntensity = this.flashlightLight.intensity;
  this.flashSavedAngle = this.flashlightLight.angle;

  this.flashPreFlicker = true;
  this.flashPreFlickerTime = this.flashPreFlickerDuration;
}




playRandomScareSound() {
  
  // 🔥 AMBIENCE BOOST
  this.horrorTargetVolume = 0.35;
  setTimeout(() => {
    this.horrorTargetVolume = this.horrorAmbienceVolume;
  }, 1200);


  const sound = new THREE.PositionalAudio(this.listener);

  const files = [
    "./assets/audio/whisper1.mp3",
    "./assets/audio/whisper2.mp3",
    "./assets/audio/footstep_far.mp3",
  ];

  const file = files[Math.floor(Math.random() * files.length)];

  this.audioLoader.load(file, (buffer) => {
    sound.setBuffer(buffer);
    sound.setRefDistance(5);
    sound.setVolume(0.6);

    // Oyuncunun ARKASINDA random pozisyon
    const offset = new THREE.Vector3(
      THREE.MathUtils.randFloat(-4, 4),
      0,
      THREE.MathUtils.randFloat(-6, -3)
    );

    const pos = this.camera.position.clone().add(offset);
    sound.position.copy(pos);

    this.scene.add(sound);
    sound.play();

    // Bitince sil
    setTimeout(() => {
      this.scene.remove(sound);
    }, buffer.duration * 1000 + 500);
  });
}

playDoorSound() {
  if (!this.doorSound) return;

  if (this.doorSound.isPlaying) {
    this.doorSound.stop();
  }

  this.doorSound.play();
}

updateHorrorAmbience(dt) {
  if (!this.horrorAmbience || !this.horrorActive) return;

  const current = this.horrorAmbience.getVolume();

  if (current < this.horrorTargetVolume) {
    this.horrorAmbience.setVolume(
      Math.min(current + this.horrorFadeSpeed * dt, this.horrorTargetVolume)
    );
  }

  if (current > this.horrorTargetVolume) {
    this.horrorAmbience.setVolume(
      Math.max(current - this.horrorFadeSpeed * dt, this.horrorTargetVolume)
    );
  }
}

updateKnockTick(dt) {
  this.knockTickTimer += dt;

  if (this.knockTickTimer < this.knockTickInterval) return;

  this.knockTickTimer = 0;
  this.knockTickInterval = THREE.MathUtils.randFloat(12, 25);

  // %40 ihtimal
  if (Math.random() > 0.4) return;

  // Eğer ODADA AÇIK LAMBA VARSA ihtimali düşür
  const anyLightOn = Object.values(this.boundLights)
    .some(l => l.isOn);

  if (anyLightOn && Math.random() > 0.3) return;

  if (!this.knockTickSound || this.knockTickSound.isPlaying) return;

  // 🎯 Oyuncunun YANINDA ama GÖRÜŞ DIŞI
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

updateAutoDoorTrigger(dt) {

  this.autoDoorCheckTimer += dt;
  if (this.autoDoorCheckTimer < this.autoDoorCheckInterval) return;
  this.autoDoorCheckTimer = 0;

  const camPos = this.camera.position;
  const camDir = new THREE.Vector3();
  this.camera.getWorldDirection(camDir);

  for (const door of this.level.doors) {

    // Kapıya özel cooldown (Level’e dokunmadan ekliyoruz)
    if (door._autoCooldown === undefined) {
      door._autoCooldown = 0;
    }

    door._autoCooldown -= this.autoDoorCheckInterval;
    if (door._autoCooldown > 0) continue;

    const doorPos = door.mesh.getWorldPosition(new THREE.Vector3());
    const toDoor = doorPos.clone().sub(camPos);
    const distance = toDoor.length();

    // Mesafe kontrolü (yaklaşıyor ama E mesafesine girmeden)
    if (distance > 3.5 || distance < 1.4) continue;

    toDoor.normalize();

    // Oyuncu kapıya bakıyor mu?
    const looking = camDir.dot(toDoor) > 0.7;
    if (!looking) continue;

    // 🎲 %25 ihtimal
    if (Math.random() > 0.25) continue;

    // 🔥 TETİKLE
    door.isOpen = !door.isOpen;
    door._autoCooldown = 6; // aynı kapı 6 sn tekrar yapmasın

    this.playDoorSound();

    console.log(
      "[AUTO DOOR]",
      door.mesh.name,
      door.isOpen ? "OPENED" : "CLOSED"
    );
  }
}



}