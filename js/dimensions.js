// Pocket dimensions. Each is endless and repeating; the only way out is the
// same folded item that brought you in. Three of them, chosen at random.
//
// Every dimension exposes:
//   id, name, enterLine, soundKind
//   spawn               -> { x, z, yaw, groundY }
//   build(scene)        -> create meshes, set fog/background
//   update(dt, player)  -> recenter/extend the endless world
//   sampleGround(x, z)  -> ground world-Y, or null for void
//   colliders           -> array of {x,z,r} the player collides with this frame
//   hasVoid             -> whether falling off evaporates you
//   dispose(scene)

import * as THREE from 'three';
import { matFor, flat, glowSprite } from './props.js';
import { getTex } from './textures.js';

function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function cyl(rt, rb, h, s, mat) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), mat); }
function hash(n) { let h = Math.imul(n ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; }

// ============================================================ D1: the field
// The reference: rust-and-blue meadow, slight rolling elevation, monolith
// buildings on the horizon you can never reach, hard blue sky.

class FieldDimension {
  constructor() {
    this.id = 'field';
    this.name = 'THE MIRE OF HOURS';
    this.enterLine = 'The dark unfolds into a field with no edges, under a sky too blue to be trusted. Buildings stand at the horizon. They will keep their distance.';
    this.soundKind = 'field';
    this.hasVoid = false;
    this.camFar = 600;        // the horizon must be far enough to hold the towers
    this.colliders = [];
    this.spawn = { x: 0, z: 0, yaw: 0, groundY: 0 };
    this._snap = null;
  }

  ground(x, z) {
    // only a slight roll — never tall enough to wall off the horizon
    return 0.55 * Math.sin(x * 0.022) + 0.45 * Math.sin(z * 0.019 + 1.3)
      + 0.3 * Math.sin((x + z) * 0.013 - 0.7);
  }
  sampleGround(x, z) { return this.ground(x, z); }

  build(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    scene.background = new THREE.Color(0x3a66bc);
    scene.fog = new THREE.Fog(0x8fa6d4, 70, 360);

    this.sky = new THREE.HemisphereLight(0xbcd2ff, 0x8a5226, 1.5);
    this.group.add(this.sky);
    this.sun = new THREE.DirectionalLight(0xffe6c0, 0.9);
    this.sun.position.set(0.4, 1, 0.3);
    this.group.add(this.sun);

    // rolling ground patch, recentred on the player — warm rust meadow
    this.SEG = 64; this.SPAN = 220;
    const geo = new THREE.PlaneGeometry(this.SPAN, this.SPAN, this.SEG, this.SEG);
    geo.rotateX(-Math.PI / 2);
    this.groundGeo = geo;
    this.groundMesh = new THREE.Mesh(geo, matFor('grass', { color: 0xc27a38, emissive: 0x3a2410, emissiveIntensity: 1 }));
    this.groundMesh.frustumCulled = false;
    this.group.add(this.groundMesh);

    // blue flowers, instanced, recentred with the ground
    this.FLOWERS = 900;
    const fgeo = new THREE.PlaneGeometry(0.18, 0.42);
    fgeo.translate(0, 0.21, 0);
    const fmat = new THREE.MeshBasicMaterial({
      color: 0x4f7fe0, transparent: true, side: THREE.DoubleSide, fog: true,
    });
    this.flowers = new THREE.InstancedMesh(fgeo, fmat, this.FLOWERS);
    this.flowers.frustumCulled = false;
    this.flowerOff = [];
    for (let i = 0; i < this.FLOWERS; i++) {
      this.flowerOff.push({
        x: (hash(i * 3 + 1) - 0.5) * this.SPAN,
        z: (hash(i * 3 + 2) - 0.5) * this.SPAN,
        r: hash(i * 3 + 3) * Math.PI,
        s: 0.7 + hash(i * 7) * 0.8,
      });
    }
    this.group.add(this.flowers);

    // the unreachable monoliths — a group pinned to the horizon, moved with you
    this.far = new THREE.Group();
    scene.add(this.far);
    const pale = flat(0xe9e6dc);
    const cluster = [
      [-70, 150, 40, 60], [-20, 95, 52, 30], [25, 130, 58, 40],
      [70, 110, 44, 24], [10, 70, 26, 26], [-45, 80, 30, 22], [95, 140, 40, 34],
    ];
    for (const [ox, oh, ow, od] of cluster) {
      const b = box(ow, oh, od || ow, pale);
      b.position.set(ox * 3, oh / 2 - 6, -260);
      this.far.add(b);
    }
    this._recenter(this.spawn.x, this.spawn.z, true);
  }

  _recenter(px, pz, force) {
    const cell = this.SPAN / this.SEG;
    const sx = Math.round(px / cell) * cell, sz = Math.round(pz / cell) * cell;
    if (!force && this._snap && this._snap.x === sx && this._snap.z === sz) return;
    this._snap = { x: sx, z: sz };
    this.groundMesh.position.set(sx, 0, sz);
    const pos = this.groundGeo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const wx = pos.getX(k) + sx, wz = pos.getZ(k) + sz;
      pos.setY(k, this.ground(wx, wz));
    }
    pos.needsUpdate = true;
    this.groundGeo.computeVertexNormals();
    // flowers
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    for (let i = 0; i < this.FLOWERS; i++) {
      const o = this.flowerOff[i];
      const wx = sx + o.x, wz = sz + o.z;
      q.setFromEuler(e.set(0, o.r, 0));
      s.set(o.s, o.s, o.s);
      m.compose(new THREE.Vector3(wx, this.ground(wx, wz), wz), q, s);
      this.flowers.setMatrixAt(i, m);
    }
    this.flowers.instanceMatrix.needsUpdate = true;
  }

  update(dt, player) {
    this._recenter(player.pos.x, player.pos.z, false);
    this.far.position.set(player.pos.x, 0, player.pos.z); // forever out of reach
  }

  dispose(scene) {
    scene.remove(this.group);
    scene.remove(this.far);
    this.groundGeo.dispose();
  }
}

// ============================================================ D2: the stair
// An infinite staircase in a void. Climb forever, descend forever; it turns
// at every landing. Jump the railing and you fall, and shortly evaporate.

class StairDimension {
  constructor() {
    this.id = 'stair';
    this.name = 'THE TENANTLESS STAIR';
    this.enterLine = 'A staircase, lit from nowhere, climbing and falling into black on every side. There is no top. There is no bottom. There is a railing. Trust it, or do not.';
    this.soundKind = 'stair';
    this.hasVoid = true;
    this.colliders = [];
    this.railColliders = [];
    this.spawn = { x: 0, z: 0, yaw: 0, groundY: 0 };

    this.RISE = 0.24; this.RUN = 0.34; this.WIDTH = 3.4; this.FLIGHT = 13;
    this.nodes = [];          // {ix,x,z,y,dx,dz,landing}
    this.meshByIx = new Map();
    this.lo = 0; this.hi = 0;
    this.curIx = 0;
  }

  build(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.background = new THREE.Color(0x040406);
    scene.fog = new THREE.Fog(0x040406, 4, 30);

    this.stepMat = matFor('metalFloor', { color: 0xb6bcc4 });
    this.railMat = matFor('rust', { color: 0xd6dae0 });
    this.amb = new THREE.AmbientLight(0x46506a, 0.75);
    this.group.add(this.amb);
    // a soft travelling light so the near steps read out of the dark
    this.glow = new THREE.PointLight(0xcfdcef, 10, 22, 1.5);
    this.group.add(this.glow);

    // seed the staircase around index 0
    this.nodes = [{ ix: 0, x: 0, z: 0, y: 0, dx: 0, dz: -1, landing: false }];
    this.lo = 0; this.hi = 0;
    for (let k = 0; k < 60; k++) this._extendUp();
    for (let k = 0; k < 30; k++) this._extendDown();
  }

  _turn(dx, dz, sign) { return sign > 0 ? { dx: -dz, dz: dx } : { dx: dz, dz: -dx }; }

  _extendUp() {
    const top = this.nodes[this.nodes.length - 1];
    const nix = top.ix + 1;
    let n;
    if (nix % this.FLIGHT === 0) {
      // a landing: flat, then the stair turns
      const lx = top.x + top.dx * this.RUN, lz = top.z + top.dz * this.RUN;
      const t = this._turn(top.dx, top.dz, hash(nix * 17 + 5) < 0.5 ? 1 : -1);
      n = { ix: nix, x: lx, z: lz, y: top.y, dx: t.dx, dz: t.dz, landing: true };
    } else {
      n = { ix: nix, x: top.x + top.dx * this.RUN, z: top.z + top.dz * this.RUN, y: top.y + this.RISE, dx: top.dx, dz: top.dz, landing: false };
    }
    this.nodes.push(n); this.hi = nix; this._makeMesh(n);
  }

  _extendDown() {
    const bot = this.nodes[0];
    const nix = bot.ix - 1;
    // step below bot in the reverse direction
    const n = { ix: nix, x: bot.x - bot.dx * this.RUN, z: bot.z - bot.dz * this.RUN, y: bot.y - this.RISE, dx: bot.dx, dz: bot.dz, landing: false };
    this.nodes.unshift(n); this.lo = nix; this._makeMesh(n);
  }

  _makeMesh(n) {
    const g = new THREE.Group();
    const w = n.landing ? this.WIDTH * 1.3 : this.WIDTH;
    const d = n.landing ? this.WIDTH * 1.3 : this.RUN * 1.06;
    const ang = Math.atan2(n.dx, n.dz);
    const tread = box(w, 0.22, d, this.stepMat);
    tread.position.y = -0.11;
    g.add(tread);
    // railings down both sides
    for (const side of [-1, 1]) {
      const px = Math.cos(ang) * side * w / 2;
      const pz = -Math.sin(ang) * side * w / 2;
      const postA = box(0.07, 0.95, 0.07, this.railMat); postA.position.set(px, 0.45, pz); g.add(postA);
      const rail = box(0.06, 0.06, d, this.railMat); rail.position.set(px, 0.92, pz); rail.rotation.y = ang; g.add(rail);
    }
    g.position.set(n.x, n.y, n.z);
    g.rotation.y = ang;
    this.group.add(g);
    this.meshByIx.set(n.ix, g);
  }

  _cull(centerIx) {
    const KEEP = 55;
    for (const [ix, g] of this.meshByIx) {
      if (Math.abs(ix - centerIx) > KEEP) {
        this.group.remove(g);
        this.meshByIx.delete(ix);
      }
    }
  }

  _ensure(centerIx) {
    // regrow any in-window step whose mesh was culled (e.g. on backtrack)
    for (let ix = centerIx - 50; ix <= centerIx + 50; ix++) {
      if (this.meshByIx.has(ix)) continue;
      const n = this._nodeAt(ix);
      if (n) this._makeMesh(n);
    }
  }

  _nearestIx(x, z) {
    // local search around curIx across live nodes
    let best = this.curIx, bestD = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) { bestD = d; best = n.ix; }
    }
    return best;
  }

  _nodeAt(ix) {
    const i = ix - this.lo;
    return this.nodes[i];
  }

  sampleGround(x, z) {
    // is (x,z) over any nearby tread?
    let bestY = null, bestAlong = Infinity;
    for (let ix = this.curIx - 6; ix <= this.curIx + 6; ix++) {
      const n = this._nodeAt(ix);
      if (!n) continue;
      const w = n.landing ? this.WIDTH * 1.3 : this.WIDTH;
      const d = n.landing ? this.WIDTH * 1.3 : this.RUN * 1.06;
      const ang = Math.atan2(n.dx, n.dz);
      const rx = x - n.x, rz = z - n.z;
      const along = rx * Math.sin(ang) + rz * Math.cos(ang);   // along travel dir
      const perp = rx * Math.cos(ang) - rz * Math.sin(ang);    // across width
      if (Math.abs(along) <= d / 2 + 0.02 && Math.abs(perp) <= w / 2 - 0.12) {
        if (Math.abs(along) < bestAlong) { bestAlong = Math.abs(along); bestY = n.y; }
      }
    }
    return bestY;
  }

  update(dt, player) {
    this.curIx = this._nearestIx(player.pos.x, player.pos.z);
    while (this.hi - this.curIx < 40) this._extendUp();
    while (this.curIx - this.lo < 24) this._extendDown();
    this._cull(this.curIx);
    this._ensure(this.curIx);
    this.glow.position.set(player.pos.x, player.feetY + 1.5, player.pos.z);

    // railings collide only while grounded — so a deliberate jump clears them
    if (player.grounded) {
      this.colliders = this.railColliders = this._railsNear();
    } else {
      this.colliders = [];
    }
    // the floor of the fall, relative to the last solid footing
    if (player.grounded) player.voidBottom = player.feetY - 13;
  }

  _railsNear() {
    const out = [];
    for (let ix = this.curIx - 5; ix <= this.curIx + 5; ix++) {
      const n = this._nodeAt(ix);
      if (!n) continue;
      const w = n.landing ? this.WIDTH * 1.3 : this.WIDTH;
      const ang = Math.atan2(n.dx, n.dz);
      for (const side of [-1, 1]) {
        out.push({
          x: n.x + Math.cos(ang) * side * w / 2,
          z: n.z - Math.sin(ang) * side * w / 2,
          r: 0.28,
        });
      }
    }
    return out;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.meshByIx.clear();
    this.nodes = [];
  }
}

// ============================================================ D3: the flood
// An endless repeating colonnade standing in black water. A liminal hall with
// no doors. The pillars go on, identical, forever.

class FloodDimension {
  constructor() {
    this.id = 'flood';
    this.name = 'THE RECURRENT NAVE';
    this.enterLine = 'Black water to the ankles, and pillars in every direction, all alike, all the same distance apart. You have been here. You will be here. You are here.';
    this.soundKind = 'flood';
    this.hasVoid = false;
    this.colliders = [];
    this.spawn = { x: 4, z: 4, yaw: 0, groundY: 0 };
    this.GRID = 8;          // pillar spacing
    this.RAD = 4;           // chunks of pillars around player
    this._snap = null;
    this._pillars = new Map();
  }

  sampleGround() { return 0; }

  build(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.background = new THREE.Color(0x0c0f14);
    scene.fog = new THREE.Fog(0x0c0f14, 4, 34);

    this.amb = new THREE.AmbientLight(0x3a4456, 0.8);
    this.group.add(this.amb);
    this.glow = new THREE.PointLight(0x9fb6d2, 11, 32, 1.4);
    this.group.add(this.glow);

    // the black water
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshLambertMaterial({ color: 0x12181e, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.02;
    water.frustumCulled = false;
    this.water = water;
    this.group.add(water);

    this.pillarMat = matFor('stoneWall', { color: 0x9a9aa2 });
    this.capMat = matFor('cryptWall', { color: 0x7a7a82 });
    this._recenter(this.spawn.x, this.spawn.z, true);
  }

  _recenter(px, pz, force) {
    const ci = Math.round(px / this.GRID), cj = Math.round(pz / this.GRID);
    if (!force && this._snap && this._snap.i === ci && this._snap.j === cj) {
      this.water.position.set(px, 0.02, pz);
      return;
    }
    this._snap = { i: ci, j: cj };
    this.water.position.set(px, 0.02, pz);
    const want = new Set();
    for (let dj = -this.RAD; dj <= this.RAD; dj++) for (let di = -this.RAD; di <= this.RAD; di++) {
      const i = ci + di, j = cj + dj;
      const key = i + ',' + j;
      want.add(key);
      if (!this._pillars.has(key)) this._pillars.set(key, this._makePillar(i, j));
    }
    for (const [key, g] of this._pillars) {
      if (!want.has(key)) { this.group.remove(g); this._pillars.delete(key); }
    }
  }

  _makePillar(i, j) {
    const g = new THREE.Group();
    const x = i * this.GRID, z = j * this.GRID;
    const h = 7.5;
    const shaft = cyl(0.42, 0.5, h, 10, this.pillarMat);
    shaft.position.y = h / 2; g.add(shaft);
    const base = box(1.1, 0.4, 1.1, this.capMat); base.position.y = 0.2; g.add(base);
    const cap = box(1.0, 0.35, 1.0, this.capMat); cap.position.y = h - 0.2; g.add(cap);
    g.position.set(x, 0, z);
    this.group.add(g);
    this.colliders.push({ x, z, r: 0.6 });
    return g;
  }

  update(dt, player) {
    this._recenter(player.pos.x, player.pos.z, false);
    // colliders only need to be those near the player
    this.colliders = [];
    for (const [key, g] of this._pillars) {
      if (Math.hypot(g.position.x - player.pos.x, g.position.z - player.pos.z) < 14) {
        this.colliders.push({ x: g.position.x, z: g.position.z, r: 0.6 });
      }
    }
    this.glow.position.set(player.pos.x, player.feetY + 1.7, player.pos.z);
  }

  dispose(scene) {
    scene.remove(this.group);
    this._pillars.clear();
  }
}

const FACTORIES = [
  () => new FieldDimension(),
  () => new StairDimension(),
  () => new FloodDimension(),
];

export function randomDimension() {
  return FACTORIES[Math.floor(Math.random() * FACTORIES.length)]();
}
