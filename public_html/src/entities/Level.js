// public_html/src/entities/Level.js
import * as THREE from "three";
import { loadGLB } from "../core/GLTFLoader.js";

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.colliders = []; // [{ box: THREE.Box3 }]
  }

  async loadHouse(path = "./assets/models/House.glb") {
    const gltf = await loadGLB(path);
    this.root = gltf.scene;
    this.root.traverse((obj) => {
      if (!obj.isMesh) return;
      if ((obj.name || "").startsWith("COL_")) {
        obj.visible = false;          // çizme
        // obj.material = new THREE.MeshBasicMaterial({ wireframe: true }); // debug istersen
      }
    });
    
    this.root.scale.set(1.5, 1.5, 1.5);
    this.scene.add(this.root);

    // İstersen house'u hizala:
    // this.root.position.set(0, 0, 0);

    // Level.js: loadHouse sonunda
    this.buildCollidersFromCOL();
    const spawnObj = this.root.getObjectByName("SPAWN");
    if (spawnObj) {
    return { spawn: spawnObj.getWorldPosition(new THREE.Vector3()) };
    }
    return { spawn: null };

  }

  buildCollidersFromCOL() {
    this.colliders.length = 0;
    if (!this.root) return;

    this.root.updateWorldMatrix(true, true);

    this.root.traverse((obj) => {
      if (!obj.isMesh) return;

      const name = (obj.name || "");
      // Blender'daki collider isimleri: COL_WALL_1, COL_DOOR, COL_FLOOR vs
      if (!name.startsWith("COL_")) return;

      // İstersen floor collider'ı ignore et (biz şimdilik düz floor kullanıyoruz)
      if (name === "COL_FLOOR") return;

      const box = new THREE.Box3().setFromObject(obj);
      if (Number.isFinite(box.min.x)) {
        this.colliders.push({ box, name });
      }
    });

    console.log("Level colliders:", this.colliders.length);
  }
}
