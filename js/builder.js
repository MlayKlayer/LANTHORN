// Builds a playable floor: merged level geometry, themed props, lights,
// item pickups, NPCs, the rest-beacon and the descent lift.

import * as THREE from 'three';
import { CELL } from './dungeon.js';
import {
  matFor, brazier, candles, pillar, statue, coffin, bonePile, bannerHang,
  crate, barrel, pipeRun, chainHang, cagedLamp, terminal, serverRack,
  cableMass, swordGrave, emberBeacon, liftGate, fogWallMesh, engineHeart,
  glowSprite, flat, pineTree, mushroomCluster, watchtower,
} from './props.js';
import { Penitent, Archive } from './npcs.js';
import { RELICS, NOTES, itemDef } from './items.js';

const THEMES = {
  gothic: { wall: 'stoneWall', floor: 'stoneFloor', ceil: 'stoneWall', step: 'stone' },
  crypt: { wall: 'cryptWall', floor: 'cryptFloor', ceil: 'cryptWall', step: 'stone' },
  industrial: { wall: 'metalWall', floor: 'metalFloor', ceil: 'metalCeil', step: 'metal' },
  scifi: { wall: 'sciWall', floor: 'sciFloor', ceil: 'sciCeil', step: 'sci' },
  corridor: { wall: 'cryptWall', floor: 'stoneFloor', ceil: 'cryptWall', step: 'stone' },
  engine: { wall: 'metalWall', floor: 'metalFloor', ceil: 'metalCeil', step: 'metal' },
  forest: { wall: 'treeline', floor: 'grass', ceil: 'treeline', step: 'soil' },
};

// merge a list of pre-transformed indexed BufferGeometries into one
function mergeGeoms(list) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const index = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nrm.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let k = 0; k < gi.length; k++) index[io + k] = gi[k] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

class Geo {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; }
  quad(p1, p2, p3, p4, n, uvs) {
    const b = this.pos.length / 3;
    for (const p of [p1, p2, p3, p4]) this.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) this.nrm.push(n[0], n[1], n[2]);
    for (const u of uvs) this.uv.push(u[0], u[1]);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return new THREE.Mesh(g, mat);
  }
}

export function buildFloor(scene, dng, rng, floorNum, flags) {
  const root = new THREE.Group();
  scene.add(root);

  const FS = {
    root,
    colliders: [],
    interactables: [],
    lights: [],
    npcs: [],
    pickups: [],
    fogWalls: [],
    keyNeeded: floorNum >= 2 && !dng.finale,
    beacon: null,
    exit: null,
    engine: null,
    engineProp: null,
    sirens: [],
    outdoor: !!dng.outdoor,
  };

  const themeOf = (i, j) => {
    if (dng.outdoor) return 'forest';
    const rid = dng.roomAt(i, j);
    if (rid >= 0) return dng.rooms[rid].theme;
    return 'corridor';
  };

  FS.matAt = (x, z) => {
    const t = themeOf(Math.floor(x / CELL), Math.floor(z / CELL));
    return (THEMES[t] || THEMES.corridor).step;
  };

  // ---------------------------------------------------------- level geometry
  const geos = new Map();
  const geoFor = (tex) => {
    if (!geos.has(tex)) geos.set(tex, new Geo());
    return geos.get(tex);
  };
  const UV = 0.5; // texture tiles per metre

  for (let j = 0; j < dng.H; j++) for (let i = 0; i < dng.W; i++) {
    if (dng.isSolid(i, j)) continue;
    const th = THEMES[themeOf(i, j)] || THEMES.corridor;
    const h = dng.heightAt(i, j);
    const x0 = i * CELL, x1 = x0 + CELL, z0 = j * CELL, z1 = z0 + CELL;

    geoFor(th.floor).quad(
      [x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0],
      [0, 1, 0],
      [[x0 * UV, z0 * UV], [x0 * UV, z1 * UV], [x1 * UV, z1 * UV], [x1 * UV, z0 * UV]]);

    // ceiling — skipped outdoors, and pierced by the lift shaft
    if (!dng.outdoor && !(dng.isShaft && dng.isShaft(i, j))) {
      geoFor(th.ceil).quad(
        [x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1],
        [0, -1, 0],
        [[x0 * UV, z0 * UV], [x1 * UV, z0 * UV], [x1 * UV, z1 * UV], [x0 * UV, z1 * UV]]);
    }

    // forests have no walls — only trees and fog seal the world
    if (dng.outdoor) continue;

    const sides = [
      { di: 1, dj: 0, x: x1, za: z0, zb: z1, n: [-1, 0, 0], axis: 'z' },
      { di: -1, dj: 0, x: x0, za: z0, zb: z1, n: [1, 0, 0], axis: 'z' },
      { di: 0, dj: 1, z: z1, xa: x0, xb: x1, n: [0, 0, -1], axis: 'x' },
      { di: 0, dj: -1, z: z0, xa: x0, xb: x1, n: [0, 0, 1], axis: 'x' },
    ];
    for (const s of sides) {
      const ni = i + s.di, nj = j + s.dj;
      let y0 = -1, y1 = -1;
      if (dng.isSolid(ni, nj)) { y0 = 0; y1 = h; }
      else {
        const nh = dng.heightAt(ni, nj);
        if (nh < h - 0.01) { y0 = nh; y1 = h; } // ledge above a lower opening
      }
      if (y1 < 0) continue;
      const wallGeo = geoFor(th.wall);
      if (s.axis === 'z') {
        wallGeo.quad(
          [s.x, y0, s.za], [s.x, y0, s.zb], [s.x, y1, s.zb], [s.x, y1, s.za],
          s.n,
          [[s.za * UV, y0 * UV], [s.zb * UV, y0 * UV], [s.zb * UV, y1 * UV], [s.za * UV, y1 * UV]]);
      } else {
        wallGeo.quad(
          [s.xa, y0, s.z], [s.xb, y0, s.z], [s.xb, y1, s.z], [s.xa, y1, s.z],
          s.n,
          [[s.xa * UV, y0 * UV], [s.xb * UV, y0 * UV], [s.xb * UV, y1 * UV], [s.xa * UV, y1 * UV]]);
      }
    }
  }
  for (const [tex, geo] of geos) root.add(geo.mesh(matFor(tex)));

  // ---------------------------------------------------------- lift shaft
  if (!dng.outdoor && dng.shaft) {
    const si = dng.shaft.i, sj = dng.shaft.j;
    const h = dng.heightAt(si, sj);
    const SH = 8;                       // how far the shaft climbs before the dark closes
    const x0 = si * CELL, x1 = x0 + CELL, z0 = sj * CELL, z1 = z0 + CELL;
    const shaftMat = matFor('metalWall', { color: 0x6a6a70 });
    const capMat = flat(0x040405);
    const shaftGeo = new Geo();
    const SUV = 0.5;
    // four inward-facing walls
    shaftGeo.quad([x0, h, z0], [x0, h, z1], [x0, h + SH, z1], [x0, h + SH, z0], [1, 0, 0],
      [[z0 * SUV, 0], [z1 * SUV, 0], [z1 * SUV, SH * SUV], [z0 * SUV, SH * SUV]]);
    shaftGeo.quad([x1, h, z1], [x1, h, z0], [x1, h + SH, z0], [x1, h + SH, z1], [-1, 0, 0],
      [[z1 * SUV, 0], [z0 * SUV, 0], [z0 * SUV, SH * SUV], [z1 * SUV, SH * SUV]]);
    shaftGeo.quad([x1, h, z0], [x0, h, z0], [x0, h + SH, z0], [x1, h + SH, z0], [0, 0, 1],
      [[x1 * SUV, 0], [x0 * SUV, 0], [x0 * SUV, SH * SUV], [x1 * SUV, SH * SUV]]);
    shaftGeo.quad([x0, h, z1], [x1, h, z1], [x1, h + SH, z1], [x0, h + SH, z1], [0, 0, -1],
      [[x0 * SUV, 0], [x1 * SUV, 0], [x1 * SUV, SH * SUV], [x0 * SUV, SH * SUV]]);
    root.add(shaftGeo.mesh(shaftMat));
    // the dark closes overhead
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), capMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.set((x0 + x1) / 2, h + SH - 0.05, (z0 + z1) / 2);
    root.add(cap);
    // chains rising out of sight
    const chainMat = matFor('rust');
    for (const [cx, cz] of [[x0 + 0.5, z0 + 0.5], [x1 - 0.5, z1 - 0.5]]) {
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, SH, 5), chainMat);
      ch.position.set(cx, h + SH / 2, cz);
      root.add(ch);
    }
  }

  // ---------------------------------------------------------- placement utils
  const occupied = new Set();
  const occKey = (i, j) => j * dng.W + i;
  const occupy = (i, j, pad = 0) => {
    for (let dj = -pad; dj <= pad; dj++) for (let di = -pad; di <= pad; di++) {
      occupied.add(occKey(i + di, j + dj));
    }
  };
  const isFree = (i, j) => !occupied.has(occKey(i, j)) && !dng.isSolid(i, j);
  const cellCenter = (i, j) => ({ x: (i + 0.5) * CELL, z: (j + 0.5) * CELL });

  // keep doorways walkable
  for (const d of dng.doorways) {
    occupy(Math.floor(d.x / CELL), Math.floor(d.z / CELL), 0);
  }

  const addProp = (made, x, z, rotY = 0) => {
    made.group.position.set(x, 0, z);
    made.group.rotation.y = rotY;
    root.add(made.group);
    if (made.r > 0) FS.colliders.push({ x, z, r: made.r });
    for (const L of made.lights || []) FS.lights.push(L);
    return made;
  };

  let lightBudget = dng.finale ? 6 : 13;
  const takeLight = () => (lightBudget > 0 ? (lightBudget--, true) : false);

  const roomCells = (room) => {
    const cells = [];
    for (let j = room.y; j < room.y + room.h; j++) {
      for (let i = room.x; i < room.x + room.w; i++) {
        let wallDir = null;
        if (dng.isSolid(i - 1, j)) wallDir = [-1, 0];
        else if (dng.isSolid(i + 1, j)) wallDir = [1, 0];
        else if (dng.isSolid(i, j - 1)) wallDir = [0, -1];
        else if (dng.isSolid(i, j + 1)) wallDir = [0, 1];
        cells.push({ i, j, ...cellCenter(i, j), wallDir });
      }
    }
    return cells;
  };

  // ---------------------------------------------------------- item pickups
  const ICON_COLOR = {
    key: 0xc8a84a, relic: 0xb9b3d8, note: 0xd8d2c4, oil: 0xa8742c,
    ampoule: 0xe6e2d4, sword: 0x9aa0a8, psalm: 0xc8b68a, lantern: 0xc8a84a,
  };
  const placePickup = (itemId, x, z) => {
    const def = itemDef(itemId);
    const node = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.16),
      flat(ICON_COLOR[def.icon] || 0xd8d2c4, { emissive: ICON_COLOR[def.icon] || 0xd8d2c4, emissiveIntensity: 0.25 }));
    core.rotation.y = rng.range(0, Math.PI);
    core.position.y = 0.25;
    node.add(core);
    node.add(itemWisp());
    node.position.set(x, 0, z);
    root.add(node);
    FS.pickups.push({ node, baseY: 0, t: rng.range(0, 9) });
    FS.interactables.push({
      x, z, r: 1.7, label: `Take ${def.name}`, node,
      action: (game) => {
        game.give(itemId, 1);
        return 'remove';
      },
    });
  };

  // reserve the beacon and lift cells up front so NOTHING spawns on top of them
  if (dng.spawnRoom) occupy(dng.spawnRoom.ci, dng.spawnRoom.cj, 1);
  if (dng.exitRoom) occupy(dng.exitRoom.ci, dng.exitRoom.cj, 1);

  // ---------------------------------------------------------- per-room dressing
  if (!dng.finale) {
    for (const room of dng.rooms) {
      const cells = rng.shuffle(roomCells(room));
      const isSpawn = room === dng.spawnRoom;
      const isExit = room === dng.exitRoom;
      const th = room.theme;

      // grand pillars in big rooms — never in the spawn or lift rooms
      if (!isSpawn && !isExit && room.w >= 5 && room.h >= 5 && (th === 'gothic' || th === 'industrial')) {
        for (let pj = room.y + 1; pj < room.y + room.h - 1; pj += 2) {
          for (let pi = room.x + 1; pi < room.x + room.w - 1; pi += 2) {
            if ((pi + pj) % 2 !== 0) continue;
            const { x, z } = cellCenter(pi, pj);
            if (!isFree(pi, pj)) continue;
            addProp(pillar(th, room.ceil), x, z);
            occupy(pi, pj);
          }
        }
      }

      if (isSpawn || isExit) continue; // dressed separately

      let placed = 0;
      const maxProps = Math.floor(room.w * room.h * 0.28);
      for (const c of cells) {
        if (placed >= maxProps) break;
        if (!isFree(c.i, c.j)) continue;
        const nearWall = !!c.wallDir;
        const rot = nearWall ? Math.atan2(-c.wallDir[0], -c.wallDir[1]) : rng.range(0, Math.PI * 2);
        const wx = nearWall ? c.x + c.wallDir[0] * 0.9 : c.x;
        const wz = nearWall ? c.z + c.wallDir[1] * 0.9 : c.z;
        let made = null;

        if (th === 'gothic') {
          const pickN = rng.float();
          if (pickN < 0.16 && nearWall) made = addProp(statue(), wx, wz, rot);
          else if (pickN < 0.3 && takeLight()) made = addProp(brazier(true), c.x, c.z);
          else if (pickN < 0.42) made = addProp(candles(rng), wx, wz);
          else if (pickN < 0.5 && nearWall) made = addProp(bannerHang(room.ceil), wx, wz, rot);
          else if (pickN < 0.56) made = addProp(swordGrave(rng), c.x, c.z, rng.range(0, 6));
        } else if (th === 'crypt') {
          const pickN = rng.float();
          if (pickN < 0.3) made = addProp(coffin(), c.x, c.z, rng.range(0, Math.PI));
          else if (pickN < 0.42) made = addProp(bonePile(rng), c.x, c.z);
          else if (pickN < 0.52) made = addProp(candles(rng), wx, wz);
          else if (pickN < 0.6 && nearWall) made = addProp(statue(), wx, wz, rot);
          else if (pickN < 0.66) made = addProp(swordGrave(rng), c.x, c.z, rng.range(0, 6));
        } else if (th === 'industrial') {
          const pickN = rng.float();
          if (pickN < 0.24) made = addProp(crate(rng), c.x, c.z);
          else if (pickN < 0.42) made = addProp(barrel(rng), c.x, c.z);
          else if (pickN < 0.54 && nearWall) made = addProp(pipeRun(CELL, rng.range(1.6, 2.4)), wx, wz, rot);
          else if (pickN < 0.68) made = addProp(chainHang(room.ceil, rng), c.x, c.z);
          else if (pickN < 0.76 && takeLight()) made = addProp(cagedLamp(room.ceil, true), c.x, c.z);
        } else if (th === 'scifi') {
          const pickN = rng.float();
          if (pickN < 0.2 && nearWall && takeLight()) made = addProp(terminal(rng), wx, wz, rot);
          else if (pickN < 0.42 && nearWall) made = addProp(serverRack(rng), wx, wz, rot);
          else if (pickN < 0.54) made = addProp(cableMass(rng), c.x, c.z);
          else if (pickN < 0.62) made = addProp(crate(rng), c.x, c.z);
        }

        if (made) { occupy(c.i, c.j); placed++; }
      }
    }

    // corridors: rare candle or chain
    if (!dng.outdoor) {
      for (let j = 1; j < dng.H - 1; j++) for (let i = 1; i < dng.W - 1; i++) {
        if (dng.openType(i, j) !== 2 || !isFree(i, j)) continue;
        if (rng.chance(0.03)) {
          const { x, z } = cellCenter(i, j);
          addProp(candles(rng), x + rng.range(-0.8, 0.8), z + rng.range(-0.8, 0.8));
          occupy(i, j);
        }
      }
    }
  }

  // ---------------------------------------------------------- the Black Pines
  if (dng.outdoor) {
    const trunkGeoms = [], canopyGeoms = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1);
    const addTree = (x, z) => {
      const hgt = rng.range(5, 8.5);
      const tg = new THREE.CylinderGeometry(0.1, 0.22, hgt * 0.55, 7);
      q.setFromEuler(e.set(0, rng.range(0, Math.PI), 0));
      m4.compose(new THREE.Vector3(x, hgt * 0.27, z), q, s1);
      tg.applyMatrix4(m4);
      trunkGeoms.push(tg);
      const cw = rng.range(2.0, 2.9), ch = hgt * 0.85;
      for (let k = 0; k < 2; k++) {
        const pg = new THREE.PlaneGeometry(cw, ch);
        q.setFromEuler(e.set(0, k * Math.PI / 2 + rng.range(-0.25, 0.25), 0));
        m4.compose(new THREE.Vector3(x, hgt * 0.52, z), q, s1);
        pg.applyMatrix4(m4);
        canopyGeoms.push(pg);
      }
      FS.colliders.push({ x, z, r: 0.3 });
    };

    const edgeDist = (i, j) => Math.min(i - 2, j - 2, dng.W - 3 - i, dng.H - 3 - j);
    for (let j = 2; j < dng.H - 2; j++) for (let i = 2; i < dng.W - 2; i++) {
      if (dng.isSolid(i, j)) continue;
      if (dng.roomAt(i, j) >= 0) continue;          // clearings stay clear
      if (dng.towerNear(i, j)) continue;            // towers get their footing
      const onPath = dng.pathHas(i, j);
      const { x, z } = cellCenter(i, j);
      const near = edgeDist(i, j);
      // a dense wall of pines drowns the world's edge in fog
      if (near < 4) {
        const ringN = near === 0 ? 4 : (near < 2 ? 3 : 2);
        for (let k = 0; k < ringN; k++) addTree(x + rng.range(-1.4, 1.4), z + rng.range(-1.4, 1.4));
        continue;
      }
      const treeChance = onPath ? 0.05 : 0.45;
      if (rng.chance(treeChance)) {
        addTree(x + rng.range(-1.1, 1.1), z + rng.range(-1.1, 1.1));
        if (!onPath && rng.chance(0.4)) addTree(x + rng.range(-1.2, 1.2), z + rng.range(-1.2, 1.2));
      }
      // fairytale undergrowth and old believers
      if (rng.chance(0.025)) addProp(mushroomCluster(rng), x + rng.range(-1, 1), z + rng.range(-1, 1));
      else if (!onPath && rng.chance(0.008)) { addProp(statue(), x, z, rng.range(0, Math.PI * 2)); occupy(i, j); }
      else if (rng.chance(0.01)) { addProp(swordGrave(rng), x, z, rng.range(0, 6)); occupy(i, j); }
      else if (rng.chance(0.012)) addProp(bonePile(rng), x, z);
    }

    if (trunkGeoms.length) root.add(new THREE.Mesh(mergeGeoms(trunkGeoms), matFor('bark')));
    if (canopyGeoms.length) root.add(new THREE.Mesh(mergeGeoms(canopyGeoms), matFor('pine', { alphaTest: 0.5 })));

    // the watchtowers
    for (const t of dng.towers) {
      addProp(watchtower(rng), t.x, t.z, rng.range(0, Math.PI * 2));
      occupy(t.i, t.j, 1);
      FS.sirens.push({ x: t.x, z: t.z });
    }

    // hero pines ringing each clearing
    for (const room of dng.rooms) {
      for (let k = 0; k < 3; k++) {
        const a = rng.range(0, Math.PI * 2);
        const made = pineTree(rng);
        const px = room.cx + Math.cos(a) * (room.w * CELL * 0.62);
        const pz = room.cz + Math.sin(a) * (room.h * CELL * 0.62);
        const pi = Math.floor(px / CELL), pj = Math.floor(pz / CELL);
        if (dng.isSolid(pi, pj) || dng.towerNear(pi, pj)) continue;
        addProp(made, px, pz);
      }
    }
  }

  // ---------------------------------------------------------- spawn beacon
  {
    const sr = dng.spawnRoom;
    const { x, z } = cellCenter(sr.ci, sr.cj);
    const b = emberBeacon();
    addProp(b, x, z);
    occupy(sr.ci, sr.cj, 1);
    FS.beacon = { x, z };
    FS.interactables.push({
      x, z, r: 2.0, label: 'Rest at the ember',
      action: (game) => { game.rest(); },
    });
  }

  // ---------------------------------------------------------- exit lift
  if (!dng.finale && dng.exitRoom) {
    const er = dng.exitRoom;
    const { x, z } = cellCenter(er.ci, er.cj);
    const lg = liftGate(er.ceil);
    addProp(lg, x, z);
    occupy(er.ci, er.cj, 1);
    FS.exit = { x, z };
    // fog wall hangs over the platform
    const fw = fogWallMesh(2.7, 2.6);
    fw.position.set(x, 1.3, z);
    fw.rotation.y = rng.range(0, Math.PI);
    root.add(fw);
    FS.fogWalls.push(fw);
    FS.interactables.push({
      x: x + 1.7, z, r: 1.6, label: 'Turn the winch',
      action: (game) => {
        if (FS.keyNeeded && !game.hasItem('winchkey')) {
          game.sound.thunk();
          game.msg('The winch wants a key. Somewhere on this floor, a key wants to be found.');
        } else {
          if (FS.keyNeeded) game.takeItem('winchkey');
          game.sound.lever();
          game.msg('The chains take the weight. The fog leans toward you.');
          game.unlockLift();
        }
      },
    });
  }

  // ---------------------------------------------------------- key + items
  if (FS.keyNeeded && dng.keyRoom) {
    const kr = dng.keyRoom;
    const cells = rng.shuffle(roomCells(kr)).filter(c => isFree(c.i, c.j));
    const c = cells[0] || { ...cellCenter(kr.ci, kr.cj), i: kr.ci, j: kr.cj };
    placePickup('winchkey', c.x, c.z);
    occupy(c.i, c.j);
  }

  if (!dng.finale) {
    const lootRooms = dng.rooms.filter(r => r !== dng.spawnRoom);
    const dropIn = (itemId) => {
      for (let tries = 0; tries < 12; tries++) {
        const room = rng.pick(lootRooms);
        const cells = rng.shuffle(roomCells(room)).filter(c => isFree(c.i, c.j));
        if (!cells.length) continue;
        const c = cells[0];
        placePickup(itemId, c.x + rng.range(-0.6, 0.6), c.z + rng.range(-0.6, 0.6));
        occupy(c.i, c.j);
        return true;
      }
      return false;
    };

    for (let n = rng.int(2, 3); n > 0; n--) dropIn('oil');
    for (let n = rng.int(1, floorNum >= 4 ? 2 : 1); n > 0; n--) dropIn('ampoule');
    for (let n = rng.int(1, 2); n > 0; n--) dropIn(rng.pick(RELICS).id);
    for (let n = rng.int(1, 2); n > 0; n--) dropIn(rng.pick(NOTES).id);

    // the verger's drum and the winch-wright's lamp wait on the early floors
    if (floorNum <= 3 && !flags.gotRadar) dropIn('radar');
    if (floorNum >= 2 && floorNum <= 4 && !flags.gotCrank) dropIn('cranklamp');
    // the folded hour — a way sideways out of the world
    if (floorNum >= 2 && floorNum <= 5 && !flags.gotFolded) dropIn('foldedhour');

    // the greatsword waits in early grave-soil
    if (floorNum <= 2 && !flags.gotSword) {
      for (let tries = 0; tries < 12; tries++) {
        const room = rng.pick(lootRooms);
        const cells = rng.shuffle(roomCells(room)).filter(c => isFree(c.i, c.j));
        if (!cells.length) continue;
        const c = cells[0];
        const sg = addProp(swordGrave(rng), c.x, c.z, rng.range(0, 6));
        const gl = glowSprite(1.2, 0xd8e0f0, 0.3); gl.position.y = 1.0; sg.group.add(gl);
        occupy(c.i, c.j);
        FS.interactables.push({
          x: c.x, z: c.z, r: 1.7, label: 'Draw the sword from the grave',
          action: (game) => {
            game.give('sword', 1);
            game.flags.gotSword = true;
            game.saveFlags();
            game.sound.swordEquip();
            return 'done';
          },
        });
        break;
      }
    }
  }

  // ---------------------------------------------------------- NPCs
  if (!dng.finale) {
    const npcRooms = dng.rooms
      .filter(r => r !== dng.spawnRoom && r !== dng.exitRoom && r.w >= 4 && r.h >= 4)
      .sort((a, b) => b.w * b.h - a.w * a.h);
    const wantPenitent = floorNum % 2 === 1;
    const wantArchive = floorNum % 2 === 0;
    const npcRoom = npcRooms[0];
    if (npcRoom) {
      const cells = roomCells(npcRoom).filter(c => c.wallDir && isFree(c.i, c.j));
      const c = cells.length ? rng.pick(cells) : { ...cellCenter(npcRoom.ci, npcRoom.cj), i: npcRoom.ci, j: npcRoom.cj, wallDir: [0, 1] };
      const rot = Math.atan2(-c.wallDir[0], -c.wallDir[1]);
      const px = c.x + c.wallDir[0] * 0.6, pz = c.z + c.wallDir[1] * 0.6;
      let npc = null;
      if (wantPenitent) npc = new Penitent(px, pz, rot);
      else if (wantArchive) npc = new Archive(px, pz, rot);
      if (npc) {
        root.add(npc.group);
        FS.npcs.push(npc);
        FS.colliders.push(...npc.colliders);
        FS.interactables.push(npc.interactable);
        for (const L of npc.lights || []) FS.lights.push(L);
        occupy(c.i, c.j, 1);
      }
    }
  }

  // ---------------------------------------------------------- the Engine
  if (dng.finale && dng.engine) {
    const e = engineHeart();
    addProp(e, dng.engine.x, dng.engine.z);
    FS.engine = { x: dng.engine.x, z: dng.engine.z };
    FS.engineProp = e.group;
    // a ring of dead braziers
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      addProp(brazier(false), dng.engine.x + Math.cos(a) * 9.5, dng.engine.z + Math.sin(a) * 9.5);
    }
  }

  // ---------------------------------------------------------- per-frame
  FS.tick = (t, dt) => {
    for (const L of FS.lights) {
      if (L.style === 'fire') {
        const n = Math.sin(t * 11 + L.base) * 0.5 + Math.sin(t * 23 + L.base * 7) * 0.5;
        L.light.intensity = L.base * (0.86 + 0.18 * n) * (L.dimmer ?? 1);
        if (L.flame) L.flame.scale.x = 0.6 * (1 + 0.12 * n);
      } else if (L.style === 'electric') {
        // occasional brown-out
        const flickSeed = Math.sin(t * 1.7 + L.base * 13);
        L.light.intensity = (flickSeed > 0.97 ? L.base * 0.25 : L.base) * (L.dimmer ?? 1);
      } else if (L.style === 'screen') {
        L.light.intensity = L.base * (0.85 + 0.15 * Math.sin(t * 9 + L.base)) * (L.dimmer ?? 1);
      } else if (L.style === 'blink') {
        // slow tower beacon: swells and dies, never snaps
        const ph = 0.5 + 0.5 * Math.sin(t * 1.3 + L.base * 3);
        L.light.intensity = L.base * (0.12 + 0.88 * ph * ph) * (L.dimmer ?? 1);
        if (L.glow) L.glow.material.opacity = 0.12 + 0.5 * ph * ph;
      }
    }
    for (const p of FS.pickups) {
      p.node.children[0].rotation.y += dt * 0.8;
      p.node.position.y = p.baseY + Math.sin(t * 1.4 + p.t) * 0.02;
    }
    if (FS.engineProp) {
      const u = FS.engineProp.userData;
      u.rings[0].rotation.z += dt * 0.05;
      u.rings[1].rotation.z -= dt * 0.03;
      u.rings[2].rotation.z += dt * 0.018;
      const pulse = 0.6 + 0.4 * Math.sin(t * 1.1);
      u.heartLi.intensity = 70 * pulse;
      u.glow.material.opacity = 0.2 + 0.14 * pulse;
    }
  };

  FS.dispose = () => {
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    scene.remove(root);
  };

  return FS;
}

// little item wisp sprite (souls pickup glow)
import { getTex } from './textures.js';
function itemWisp() {
  const mat = new THREE.SpriteMaterial({
    map: getTex('itemglow'), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.6, 1.3, 1);
  s.position.y = 0.65;
  return s;
}
