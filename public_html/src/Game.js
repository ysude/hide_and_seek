import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import SceneManager from './core/SceneManager.js';
import { Level } from "./entities/Level.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
    this.camera.position.set(0, 2, 10);

    this.controls = new PointerLockControls(this.camera, document.body);
    document.body.addEventListener("click", () => this.controls.lock());

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(3, 10, 5);
    this.scene.add(dir);

    // gameplay
    this.inventoryCards = 0;
    this.totalCards = 3;
    this.objects = [];
    this.keys = new Set();

    // düz zemin (şimdilik)
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(200, 0.2, 200),
      new THREE.MeshStandardMaterial()
    );
    floor.position.set(0, -1.0, 0);
    this.scene.add(floor);

    // level + colliders
    this.level = new Level(this.scene);

    this.buildQuest();

    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (e) => { if (e.code === "KeyE") this.tryInteract(); });

    this.lastTime = 0;

    // House'ı yükle (async)
    this.init();
  }

  async init() {
    // House.glb path’i burada
    const { spawn } = await this.level.loadHouse("./assets/models/House.glb");
    if (spawn) {
      this.camera.position.copy(spawn);
      this.camera.position.y += 1.7; // göz yüksekliği
    } else {
      this.camera.position.set(3, 2, -6); // fallback
    }
  }

  resolveCollisions(pos, radius, colliders) {
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
        const dist = Math.sqrt(dist2) || 0.0001;
        const push = (radius - dist);
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

  update(dt) {
    if (!this.controls.isLocked) return;

    const speed = (this.keys.has("ShiftLeft") ? 8 : 4) * dt;
    const dir = new THREE.Vector3();

    // PointerLockControls için genelde W = ileri: moveForward(+)
    if (this.keys.has("KeyW")) dir.z += 1;
    if (this.keys.has("KeyS")) dir.z -= 1;
    if (this.keys.has("KeyA")) dir.x -= 1;
    if (this.keys.has("KeyD")) dir.x += 1;

    dir.normalize();
    this.controls.moveRight(dir.x * speed);
    this.controls.moveForward(dir.z * speed);

    // ✅ playerPos = camera.position
    this.resolveCollisions(this.camera.position, 0.35, this.level.colliders);

    for (const o of this.objects) {
      if (o.userData.type === "door" && o.userData.opening && o.position.x < 5) {
        o.position.x += 2.0 * dt;
      }
      if (o.userData.type === "card") {
        o.rotation.y += 2.0 * dt;
      }
    }
  }

  tryInteract() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    const hits = ray.intersectObjects(this.objects, false);
    if (!hits.length) return;

    const hit = hits[0].object;
    const dist = hit.position.distanceTo(this.camera.position);
    if (dist > 3.0) return;

    if (hit.userData.type === "card") {
      this.inventoryCards++;
      this.scene.remove(hit);
      this.objects = this.objects.filter(o => o !== hit);
      this.updateUI();
      return;
    }

    if (hit.userData.type === "door") {
      if (this.inventoryCards >= this.totalCards) {
        hit.userData.opening = true;
        alert("Kapı Açılıyor...");
      } else {
        alert(`3 Kart lazım! Sende: ${this.inventoryCards}`);
      }
    }
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
