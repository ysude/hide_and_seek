// public_html/src/entities/Level.js
import * as THREE from "three";
import { loadGLB } from "../core/GLTFLoader.js";

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.root = null;

    this.colliders = [];
    this.dynamicColliders = [];
    this.doors = [];
    this.anchors = [];

  }

  async loadHouse(path = "./assets/models/House.glb") {
    const gltf = await loadGLB(path);
    this.root = gltf.scene;

    // House scale
    this.root.scale.set(1.5, 1.5, 1.5);

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
        this.scene.traverse((obj) => {
    if (!obj.isMesh) return;

    if (
      obj.name === "AREA_SPAWN" ||
      obj.name.startsWith("AREA_")
    ) {
      obj.visible = false;
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
    });

    this.anchors.length = 0;
    this.root.updateWorldMatrix(true, true);

    this.root.traverse((o) => {
      const n = (o.name || "");
      if (!n) return;

      if (
        n === "SPAWN" ||
        n === "EMPTY_NAMES" ||
        n.startsWith("AI_SPAWN") ||     
        n.startsWith("AI_PATROL") ||  
        n.startsWith("AI_GUARD")
      ) {
        this.anchors.push(o);
      }
    });



    console.log("[LEVEL] anchors:", this.anchors.map(a => a.name));

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
  
    const doorRootRe = /^Door_\d{3}$/;
  
    this.root.traverse((o) => {
      if (!o.isObject3D) return;
      const n = (o.name || "");
      if (!doorRootRe.test(n)) return;
  
      this.doors.push({
        mesh: o,
        isOpen: false,
        angle: o.rotation.z, 
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

      if (name.startsWith("COL_DOOR")) {
        this.dynamicColliders.push({
          mesh: obj,
          box: new THREE.Box3().setFromObject(obj),
          name,
        });
        return;
      }

      const box = new THREE.Box3().setFromObject(obj);
      if (Number.isFinite(box.min.x)) {
        this.colliders.push({ box, name });
      }
    });

    console.log("Static colliders:", this.colliders.length, "Dynamic colliders:", this.dynamicColliders.length);
  }

  updateDynamicColliders() {
    for (const c of this.dynamicColliders) {
      c.box.setFromObject(c.mesh);
    }
  }

  getAllColliders() {
    return [
      ...this.colliders,
      ...this.dynamicColliders.map(dc => ({ box: dc.box, name: dc.name }))
    ];
  }
}
