// src/entities/SeekerAI.js
import * as THREE from "three";

export class SeekerAI {
  /**
   * @param {THREE.Scene} scene
   * @param {Level} level
   * @param {THREE.PerspectiveCamera} playerCamera
   * @param {THREE.Object3D} monsterRoot
   * @param {Function} getCollidersFn  -> returns [{box,name,isCeiling?},...]
   * @param {Object} opts
   * @param {(seeing:boolean)=>void} opts.onSeePlayer
   */
  constructor(scene, level, playerCamera, monsterRoot, getCollidersFn, opts = {}) {
    this.scene = scene;
    this.level = level;
    this.playerCamera = playerCamera;
    this.root = monsterRoot;
    this.getColliders = getCollidersFn;
    this.onSeePlayer = opts.onSeePlayer || null;

    /* ===== PARAMS ===== */
    this.viewDistance = 14;
    this.fov = THREE.MathUtils.degToRad(60);
    this.moveSpeed = 2.0;
    // LOS: low obstacle ignore
    this.lowOccluderMargin = 0.55; 

    // collision capsule-ish radius (XZ)
    this.radius = 0.35;
    // ===== PARAMS =====
    this.doorOpenDistance = 1.6;              
    this.doorOpenFov = THREE.MathUtils.degToRad(110); 


    // LOS heights
    this.eyeHeightAI = 1.55;     
    this.eyeHeightPlayer = 1.55; 
    this.eyeHeightPlayerCrouch = 1.05;

    // search behavior
    this.searchRadius = 5;
    this.searchPointCount = 10;
    this.searchTimeLimit = 4;
    this.debugRange = 5.0;


    // anti-stuck / ledge
    this._stuckTime = 0;
    this._detourTarget = null;
    this._detourTime = 0;
    this._patrolTimer = 0;
    this._patrolTimeout = 5.0;

    // vertical sanity
    this.groundY = null;
    this.maxYStep = 0.35;   
    this.snapToGround = true;

    /* ===== STATE ===== */
    this.state = "PATROL";
    this.patrolPoints = [];
    this.patrolIndex = 0;

    this.lastSeenPos = new THREE.Vector3();
    this.searchPoints = [];
    this.searchIndex = 0;
    this.searchTimer = 0;

    /* ===== INTERNAL ===== */
    this.raycaster = new THREE.Raycaster();
    this._tmpV1 = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._tmpV3 = new THREE.Vector3();

    // collider meshes for LOS (COL_ only)
    this._colMeshes = null;

    this._seeing = false;
    this._seeHold = 0;       
    this._seeHoldDur = 0.25;
    this.stuckDoorDistance = 3.0;  
    this._stuckDoorCooldown = 0;   

    /* ===== DEBUG: ground sector (wedge) ===== */
    this.debugSector = this.createGroundSector();
    this.scene.add(this.debugSector);
  }

  /* -------------------- SETUP -------------------- */

  setWaypointsFromAnchors(anchors) {
    // patrol
    this.patrolPoints = anchors
      .filter(a => (a.name || "").startsWith("AI_PATROL"))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map(a => a.getWorldPosition(new THREE.Vector3()));

    // spawn
    const spawn = anchors.find(a => (a.name || "").startsWith("AI_SPAWN"));
    if (spawn) {
      const p = spawn.getWorldPosition(new THREE.Vector3());
      this.root.position.copy(p);
      this.groundY = p.y;
    } else {
      this.groundY = this.root.position.y;
    }

    for (const p of this.patrolPoints) p.y = this.groundY;

    console.log("[AI] patrolPoints:", this.patrolPoints.map(p => p.toArray().map(v=>v.toFixed(2)).join(",")));
    if (!this.patrolPoints.length) console.warn("[AI] No patrol points found!");
  }

  /* -------------------- DEBUG SHAPE -------------------- */

  createGroundSector() {
    // ring-sector (daire dilimi) - zeminde görünsün
    const seg = 48;
    const r = this.debugRange;

    // sector angle = fov
    const theta = this.fov;

    // geometry: 0..theta arası üçgen fan (center + arc)
    const positions = [];
    const indices = [];

    // center
    positions.push(0, 0, 0);

    for (let i = 0; i <= seg; i++) {
      const t = (-theta / 2) + (theta * (i / seg));
      const x = Math.sin(t) * r;
      const z = Math.cos(t) * r;
      positions.push(x, 0, z);
    }

    for (let i = 1; i <= seg; i++) {
      indices.push(0, i, i + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 999;
    return mesh;
  }

  updateGroundSector() {
    if (!this.debugSector) return;

    const y = (this.groundY ?? this.root.position.y) + 0.02;
    this.debugSector.position.set(this.root.position.x, y, this.root.position.z);

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    const yaw = Math.atan2(forward.x, forward.z);
    this.debugSector.rotation.set(0, yaw, 0);

    const m = this.debugSector.material;
    m.opacity = this._seeing ? 0.32 : 0.18;
  }

  /* -------------------- COLLISION (XZ push) -------------------- */

  resolveMonsterCollisions(pos, radius, colliders) {
    for (const c of colliders) {
      const b = c.box;
      if (!b) continue;

      const y = pos.y;
      if (y < b.min.y - 1.5 || y > b.max.y + 1.5) continue;

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

  /* -------------------- UPDATE -------------------- */

  update(dt) {
    if (this.groundY === null) this.groundY = this.root.position.y;

    if (this._seeHold > 0) this._seeHold -= dt;

    switch (this.state) {
      case "PATROL": this.updatePatrol(dt); break;
      case "CHASE":  this.updateChase(dt);  break;
      case "SEARCH": this.updateSearch(dt); break;
      case "RETURN": this.updateReturn(dt); break;
    }
    this.tryAutoOpenDoor();
    this.updateGroundSector();
  }

  /* -------------------- STATES -------------------- */

  updatePatrol(dt) {
    if (this.canSeePlayer()) { this.enterChase(); return; }
    if (!this.patrolPoints.length) return;

    this._patrolTimer += dt;

    this.moveTowards(this.patrolPoints[this.patrolIndex], dt);

    if (this.reached(this.patrolPoints[this.patrolIndex])) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
      this._patrolTimer = 0;
    } else if (this._patrolTimer > this._patrolTimeout) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
      this._patrolTimer = 0;
      this._detourTarget = null;
      this._detourTime = 0;
    }
  }

  updateChase(dt) {
    if (this.canSeePlayer()) {
      this.lastSeenPos.copy(this.playerCamera.position);
      this.lastSeenPos.y = this.groundY;
      this.moveTowards(this.lastSeenPos, dt);
    } else {
      this.enterSearch();
    }
  }

  updateSearch(dt) {
    this.searchTimer += dt;

    if (this.canSeePlayer()) {
      this.enterChase();
      return;
    }

    if (this.searchIndex < this.searchPoints.length) {
      this.moveTowards(this.searchPoints[this.searchIndex], dt);
      if (this.reached(this.searchPoints[this.searchIndex])) {
        this.searchIndex++;
      }
    }

    if (this.searchTimer > this.searchTimeLimit) {
      this.enterReturn();
    }
  }

  updateReturn(dt) {
    const nearest = this.findNearestPatrol();
    if (!nearest) return;

    this.moveTowards(nearest, dt);

    if (this.reached(nearest)) {
      this.state = "PATROL";
    }
  }

  /* -------------------- TRANSITIONS -------------------- */

  enterChase() {
    this.state = "CHASE";
    this.lastSeenPos.copy(this.playerCamera.position);
    this.lastSeenPos.y = this.groundY;
    console.log("[AI] ENTER CHASE", this.lastSeenPos.toArray().map(n=>n.toFixed(2)).join(","));
  }

  enterSearch() {
    this.state = "SEARCH";
    this.searchTimer = 0;
    this.searchIndex = 0;
    this.generateSearchPoints();
  }

  enterReturn() {
    this.state = "RETURN";
  }

  /* -------------------- VISION (crouch-aware LOS) -------------------- */

  getPlayerEyeWorld() {
    const cam = this.playerCamera.position;
    const h = cam.y - (this.groundY ?? 0);
    const crouching = h < 1.35; // threshold
    const eyeH = crouching ? this.eyeHeightPlayerCrouch : this.eyeHeightPlayer;

    return new THREE.Vector3(cam.x, (this.groundY ?? cam.y) + eyeH, cam.z);
  }

  canSeePlayer() {
    // AI eye world
    const eye = new THREE.Vector3(
      this.root.position.x,
      (this.groundY ?? this.root.position.y) + this.eyeHeightAI,
      this.root.position.z
    );

    const targetEye = this.getPlayerEyeWorld();
    const toPlayer = targetEye.clone().sub(eye);
    const dist = toPlayer.length();

    // distance check
    if (dist > this.viewDistance) return this._setSeeing(false);

    // fov check (yaw-based)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    forward.y = 0; forward.normalize();
    const dirFlat = toPlayer.clone(); dirFlat.y = 0; dirFlat.normalize();

    const ang = forward.angleTo(dirFlat);
    if (ang > this.fov / 2) return this._setSeeing(false);

    // collider meshes cache (COL_ only)
    if (!this._colMeshes) {
      this._colMeshes = [];
      this.level.root?.traverse((o) => {
        if (o.isMesh && (o.name || "").startsWith("COL_")) this._colMeshes.push(o);
      });
    }

    // raycast: eye -> playerEye
    this.raycaster.set(eye, toPlayer.clone().normalize());
    const hits = this.raycaster.intersectObjects(this._colMeshes, true);

    if (!hits.length) return this._setSeeing(true);

    let blocked = false;

    const playerEyeY = targetEye.y;
    const margin = this.lowOccluderMargin ?? 0.35; 

    for (const h of hits) {
      if (h.distance >= dist - 0.15) break;
      const hp = h.point;
      if (hp.y < playerEyeY - margin) continue;
      blocked = true;
      break;
    }

    const visible = !blocked;

    // see-hold
    if (visible) {
      this._seeHold = this._seeHoldDur;
      return this._setSeeing(true);
    } else {
      if (this._seeHold > 0) return this._setSeeing(true);
      return this._setSeeing(false);
    }
  }


  _setSeeing(v) {
    const prev = this._seeing;
    this._seeing = v;
    if (prev !== v) this.onSeePlayer?.(v);
    return v;
  }

/* -------------------- MOVEMENT -------------------- */

  moveTowards(target, dt) {
    // snap y
    if (this.snapToGround) {
      const dy = this.root.position.y - (this.groundY ?? this.root.position.y);
      if (Math.abs(dy) > this.maxYStep) this.root.position.y = this.groundY;
    }

    let goal = target;
    if (this._detourTarget && this._detourTime > 0) {
      goal = this._detourTarget;
      this._detourTime -= dt;
      if (this._detourTime <= 0) this._detourTarget = null;
    }

    const before = this.root.position.clone();

    const dir = goal.clone().sub(this.root.position);
    dir.y = 0;

    const len = dir.length();
    if (len < 0.0001) return;

    dir.multiplyScalar(1 / len);

    // move step
    this.root.position.addScaledVector(dir, this.moveSpeed * dt);

    // collisions
    const cols = this.getColliders ? this.getColliders() : [];
    this.resolveMonsterCollisions(this.root.position, this.radius, cols);

    // keep on ground
    this.root.position.y = this.groundY;

    // face (yaw only)
    this.root.lookAt(goal.x, this.root.position.y, goal.z);

    // stuck detect 
    const moved = this.root.position.distanceTo(before);
    if (moved < 0.005) this._stuckTime += dt;
    else this._stuckTime = 0;

    if (this._stuckTime > 0.25) {
      this._stuckTime = 0;
      this.pickDetour(goal, cols);
    }
  }

  pickDetour(goal, cols) {
    const toGoal = goal.clone().sub(this.root.position);
    toGoal.y = 0;
    if (toGoal.lengthSq() < 0.0001) return;
    toGoal.normalize();

    const angles = [90, -90, 45, -45, 135, -135, 30, -30];
    const candidates = [];

    for (const angle of angles) {
      const rad = THREE.MathUtils.degToRad(angle);
      const dir = new THREE.Vector3(
        toGoal.x * Math.cos(rad) - toGoal.z * Math.sin(rad),
        0,
        toGoal.x * Math.sin(rad) + toGoal.z * Math.cos(rad)
      );

      const step = 2.0;
      const cand = this.root.position.clone().addScaledVector(dir, step);
      
      const score = this.evaluatePosition(cand, goal, cols);
      candidates.push({ pos: cand, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    
    if (candidates[0].score > -100) {
      this._detourTarget = candidates[0].pos;
      this._detourTime = 1.2;
      console.log("[AI] Detour picked, score:", candidates[0].score.toFixed(2));
    }
  }

  evaluatePosition(pos, goal, cols) {
    let score = 100;

    for (const c of cols) {
      const b = c.box;
      if (!b) continue;
      
      const inBox = pos.x >= b.min.x - 0.1 && pos.x <= b.max.x + 0.1 &&
                    pos.z >= b.min.z - 0.1 && pos.z <= b.max.z + 0.1;
      
      if (inBox) {
        score -= 50;
      } else {
        const closestX = Math.max(b.min.x, Math.min(pos.x, b.max.x));
        const closestZ = Math.max(b.min.z, Math.min(pos.z, b.max.z));
        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < 1.0) score -= (1.0 - dist) * 20;
      }
    }

    const distToGoal = pos.distanceTo(goal);
    score += Math.max(0, 30 - distToGoal * 2);

    return score;
  }

  reached(target) {
    const dx = this.root.position.x - target.x;
    const dz = this.root.position.z - target.z;
    return (dx * dx + dz * dz) < (0.45 * 0.45);
  }

  tryAutoOpenDoor() {
  const doors = this.level?.doors;
  if (!doors || !doors.length) return;

  const aiPos = this.root.position;

  // AI forward (yaw only)
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
  fwd.y = 0; fwd.normalize();

  let best = null;
  let bestD2 = Infinity;

  for (const d of doors) {
    if (!d?.mesh) continue;
    if (d.isOpen) continue;  

    // Door world pos
    const dp = d.mesh.getWorldPosition(this._tmpV1);
    const dx = dp.x - aiPos.x;
    const dz = dp.z - aiPos.z;
    const d2 = dx * dx + dz * dz;

    if (d2 > this.doorOpenDistance * this.doorOpenDistance) continue;

    const toDoor = this._tmpV2.set(dx, 0, dz);
    if (toDoor.lengthSq() < 1e-6) continue;
    toDoor.normalize();

    const ang = fwd.angleTo(toDoor);
    if (ang > this.doorOpenFov * 0.5) continue;

    if (d2 < bestD2) {
      bestD2 = d2;
      best = d;
    }
  }

  if (best) {
    best.isOpen = true;
  }
}

  /* -------------------- SEARCH POINTS -------------------- */

  generateSearchPoints() {
    this.searchPoints = [];
    for (let i = 0; i < this.searchPointCount; i++) {
      const a = (i / this.searchPointCount) * Math.PI * 2;
      const p = this.lastSeenPos.clone().add(
        new THREE.Vector3(
          Math.cos(a) * this.searchRadius,
          0,
          Math.sin(a) * this.searchRadius
        )
      );
      p.y = this.groundY;
      this.searchPoints.push(p);
    }
  }

  findNearestPatrol() {
    let best = null;
    let bestDist = Infinity;
    for (const p of this.patrolPoints) {
      const dx = this.root.position.x - p.x;
      const dz = this.root.position.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) {
        bestDist = d2;
        best = p;
      }
    }
    return best;
  }
  findNearestClosedDoor(maxDist = 3.0) {
  const doors = this.level?.doors;
  if (!doors?.length) return null;

  const p = this.root.position;
  let best = null;
  let bestD2 = Infinity;

  for (const d of doors) {
    if (!d?.mesh) continue;
    if (d.isOpen) continue;

    const dp = d.mesh.getWorldPosition(this._tmpV1);
    const dx = dp.x - p.x;
    const dz = dp.z - p.z;
    const d2 = dx * dx + dz * dz;

    if (d2 < bestD2 && d2 <= maxDist * maxDist) {
      bestD2 = d2;
      best = { door: d, pos: dp.clone() };
    }
  }
  return best;
}

}
