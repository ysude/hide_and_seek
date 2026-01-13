// public_html/src/entities/Level.js
import * as THREE from "three";
import { loadGLB } from "../core/GLTFLoader.js";

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.root = null;

    // Static colliders (duvarlar vs): [{ box, name }]
    this.colliders = [];

    // Dynamic colliders (kapı gibi hareket edenler): [{ mesh, box, name }]
    this.dynamicColliders = [];

    // Doors: [{ mesh, isOpen, angle }]
    this.doors = [];
  }

  async loadHouse(path = "./assets/models/House.glb") {
    const gltf = await loadGLB(path);
    this.root = gltf.scene;

    // House scale
    this.root.scale.set(1.5, 1.5, 1.5);

    // Gizlenecek yardımcı objeler: collision + boolean/controller
    this.root.traverse((o) => {
      const n = (o.name || "");
      if (
        n.startsWith("COL_") ||
        n.startsWith("CTRL_") ||
        n.toLowerCase().includes("hole")
      ) {
        o.visible = false;
      }
    });

    this.scene.add(this.root);

    // Collider + Door cache
    this.buildCollidersFromCOL();
    this.cacheDoors();

    // Spawn
    const spawnObj = this.root.getObjectByName("SPAWN");
    if (spawnObj) {
      return { spawn: spawnObj.getWorldPosition(new THREE.Vector3()) };
    }
    return { spawn: null };
  }

  cacheDoors() {
    this.doors.length = 0;
    if (!this.root) return;
  
    const doorRootRe = /^Door_\d{3}$/; // sadece Door_000, Door_001 ...
  
    this.root.traverse((o) => {
      if (!o.isObject3D) return;
      const n = (o.name || "");
      if (!doorRootRe.test(n)) return;
  
      this.doors.push({
        mesh: o,
        isOpen: false,
        angle: o.rotation.z, // blenderda hangi eksenle açıyorsan onu kullan
      });
    });
  
    console.log("Doors found:", this.doors.length, this.doors.map(d => d.mesh.name));
    console.log(
      "Static:", this.colliders.map(c=>c.name),
      "Dynamic:", this.dynamicColliders.map(c=>c.name)
    );
    
  }
  

  buildCollidersFromCOL() {
    this.colliders.length = 0;
    this.dynamicColliders.length = 0;
    if (!this.root) return;

    this.root.updateWorldMatrix(true, true);

    this.root.traverse((obj) => {
      if (!obj.isMesh) return;

      const name = (obj.name || "");
      if (!name.startsWith("COL_")) return;

      // Floor'ı istemiyorsan ignore
      if (name === "COL_FLOOR") return;

      // Kapı collider'ları hareket eder -> dynamic
      if (name.startsWith("COL_DOOR")) {
        this.dynamicColliders.push({
          mesh: obj,
          box: new THREE.Box3().setFromObject(obj),
          name,
        });
        return;
      }

      // Diğerleri static
      const box = new THREE.Box3().setFromObject(obj);
      if (Number.isFinite(box.min.x)) {
        this.colliders.push({ box, name });
      }
    });

    console.log("Static colliders:", this.colliders.length, "Dynamic colliders:", this.dynamicColliders.length);
  }

  // Kapı döndükten sonra dynamic collider box'larını güncelle
  updateDynamicColliders() {
    for (const c of this.dynamicColliders) {
      c.box.setFromObject(c.mesh);
    }
  }

  // Game.js kolay kullansın diye tek listede veren helper
  getAllColliders() {
    // dynamicColliders -> {box,...} formatına uydur
    return [
      ...this.colliders,
      ...this.dynamicColliders.map(dc => ({ box: dc.box, name: dc.name }))
    ];
  }
}
