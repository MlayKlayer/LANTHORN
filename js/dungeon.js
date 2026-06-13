// Procedural floor generator: rooms + corridors on a grid, themed per room.

import { RNG } from './rng.js';

export const CELL = 3;          // metres per grid cell
export const FINAL_FLOOR = 7;
export const FOREST_FLOOR = 4;  // the Black Pines

const THEME_HEIGHTS = {
  gothic: [5.6, 7.4],
  crypt: [3.1, 4.0],
  industrial: [4.4, 6.0],
  scifi: [3.2, 4.0],
};

function themeWeights(floor) {
  // surface floors lean gothic/crypt, the deep leans industrial/scifi
  const t = Math.min(1, (floor - 1) / 5);
  return [
    ['gothic', 2.4 - 1.5 * t],
    ['crypt', 1.6 - 0.6 * t],
    ['industrial', 0.5 + 1.6 * t],
    ['scifi', 0.15 + 1.5 * t],
  ];
}

function pickWeighted(rng, pairs) {
  let total = 0;
  for (const [, w] of pairs) total += w;
  let r = rng.float() * total;
  for (const [k, w] of pairs) { r -= w; if (r <= 0) return k; }
  return pairs[0][0];
}

export function generate(seedStr, floor) {
  const rng = new RNG(seedStr + ':floor:' + floor);

  if (floor >= FINAL_FLOOR) return generateFinale(rng);
  if (floor === FOREST_FLOOR) return generateForest(rng);

  const W = 40 + Math.min(8, floor * 2), H = W;
  const open = new Uint8Array(W * H);       // 0 solid, 1 room, 2 corridor
  const roomIdOf = new Int16Array(W * H).fill(-1);
  const height = new Float32Array(W * H);

  const idx = (i, j) => j * W + i;
  const inb = (i, j) => i >= 0 && j >= 0 && i < W && j < H;

  // ---- place rooms
  const rooms = [];
  const targetRooms = 9 + Math.min(4, floor);
  for (let tries = 0; tries < 140 && rooms.length < targetRooms; tries++) {
    const w = rng.int(3, 7), h = rng.int(3, 7);
    const x = rng.int(2, W - w - 3), y = rng.int(2, H - h - 3);
    let ok = true;
    for (const r of rooms) {
      if (x < r.x + r.w + 1 && r.x < x + w + 1 && y < r.y + r.h + 1 && r.y < y + h + 1) { ok = false; break; }
    }
    if (!ok) continue;
    const theme = pickWeighted(rng, themeWeights(floor));
    const [h0, h1] = THEME_HEIGHTS[theme];
    rooms.push({
      id: rooms.length, x, y, w, h, theme,
      ceil: rng.range(h0, h1),
      cx: (x + w / 2) * CELL, cz: (y + h / 2) * CELL,
      ci: Math.floor(x + w / 2), cj: Math.floor(y + h / 2),
    });
  }

  for (const r of rooms) {
    for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) {
      open[idx(i, j)] = 1;
      roomIdOf[idx(i, j)] = r.id;
      height[idx(i, j)] = r.ceil;
    }
  }

  // ---- connect with corridors (Prim's MST + a couple of loops)
  const corridorH = 2.9;
  const connected = new Set([0]);
  const edges = [];
  while (connected.size < rooms.length) {
    let best = null;
    for (const a of connected) {
      for (let b = 0; b < rooms.length; b++) {
        if (connected.has(b)) continue;
        const d = Math.abs(rooms[a].ci - rooms[b].ci) + Math.abs(rooms[a].cj - rooms[b].cj);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    connected.add(best.b);
    edges.push([best.a, best.b]);
  }
  const extra = Math.floor(rooms.length * 0.25);
  for (let k = 0; k < extra; k++) {
    const a = rng.int(0, rooms.length - 1), b = rng.int(0, rooms.length - 1);
    if (a !== b) edges.push([a, b]);
  }

  const carve = (i, j) => {
    if (!inb(i, j)) return;
    const id = idx(i, j);
    if (open[id]) return; // don't overwrite rooms
    open[id] = 2;
    roomIdOf[id] = -1;
    height[id] = corridorH;
  };

  for (const [a, b] of edges) {
    const A = rooms[a], B = rooms[b];
    let i = A.ci, j = A.cj;
    const horizFirst = rng.chance(0.5);
    const moveI = () => { while (i !== B.ci) { i += Math.sign(B.ci - i); carve(i, j); } };
    const moveJ = () => { while (j !== B.cj) { j += Math.sign(B.cj - j); carve(i, j); } };
    if (horizFirst) { moveI(); moveJ(); } else { moveJ(); moveI(); }
  }

  // ---- doorways: corridor cell adjacent to a room cell
  const doorways = [];
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    if (open[idx(i, j)] !== 2) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + dx, nj = j + dz;
      if (inb(ni, nj) && open[idx(ni, nj)] === 1) {
        doorways.push({
          x: (i + 0.5) * CELL + dx * CELL * 0.5,
          z: (j + 0.5) * CELL + dz * CELL * 0.5,
          dir: dx !== 0 ? 'x' : 'z',
          roomId: roomIdOf[idx(ni, nj)],
        });
      }
    }
  }

  // ---- spawn room and exit room (farthest pair-ish: farthest from room 0)
  const spawnRoom = rooms[0];
  let exitRoom = rooms[1] || rooms[0];
  let bestD = -1;
  for (const r of rooms) {
    if (r === spawnRoom) continue;
    const d = (r.cx - spawnRoom.cx) ** 2 + (r.cz - spawnRoom.cz) ** 2;
    if (d > bestD) { bestD = d; exitRoom = r; }
  }

  // key room: far from both spawn and exit
  let keyRoom = null; bestD = -1;
  for (const r of rooms) {
    if (r === spawnRoom || r === exitRoom) continue;
    const d = Math.min(
      (r.cx - spawnRoom.cx) ** 2 + (r.cz - spawnRoom.cz) ** 2,
      (r.cx - exitRoom.cx) ** 2 + (r.cz - exitRoom.cz) ** 2);
    if (d > bestD) { bestD = d; keyRoom = r; }
  }

  // the lift shaft rises through the ceiling at the exit-room centre
  const shaft = { i: exitRoom.ci, j: exitRoom.cj };

  const dng = {
    W, H, open, roomIdOf, height, rooms, doorways,
    spawnRoom, exitRoom, keyRoom, shaft,
    finale: false,
    isSolid(i, j) { return !inb(i, j) || open[idx(i, j)] === 0; },
    heightAt(i, j) { return inb(i, j) ? height[idx(i, j)] : 0; },
    roomAt(i, j) { return inb(i, j) ? roomIdOf[idx(i, j)] : -1; },
    openType(i, j) { return inb(i, j) ? open[idx(i, j)] : 0; },
    isShaft(i, j) { return shaft && i === shaft.i && j === shaft.j; },
  };
  return dng;
}

// Floor IV: a pine forest under the world, fogbound, watched from towers.
function generateForest(rng) {
  const W = 74, H = 74;
  const open = new Uint8Array(W * H);
  const roomIdOf = new Int16Array(W * H).fill(-1);
  const height = new Float32Array(W * H);
  const idx = (i, j) => j * W + i;
  const inb = (i, j) => i >= 0 && j >= 0 && i < W && j < H;

  // open ground inside a solid treeline border
  for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
    open[idx(i, j)] = 2;
    height[idx(i, j)] = 9;
  }

  const rooms = [];
  const carveClearing = (ci, cj, r) => {
    const room = {
      id: rooms.length,
      x: ci - r, y: cj - r, w: r * 2 + 1, h: r * 2 + 1,
      theme: 'forest', ceil: 9,
      cx: (ci + 0.5) * CELL, cz: (cj + 0.5) * CELL, ci, cj,
    };
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (!inb(i, j) || !open[idx(i, j)]) continue;
      open[idx(i, j)] = 1;
      roomIdOf[idx(i, j)] = room.id;
    }
    rooms.push(room);
    return room;
  };

  const mid = Math.floor(W / 2);
  const spawnRoom = carveClearing(mid, 6, 2);
  const exitRoom = carveClearing(mid + rng.int(-8, 8), H - 7, 2);
  for (let k = 0; k < 7; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const ci = rng.int(8, W - 9), cj = rng.int(12, H - 13);
      const farEnough = rooms.every(r => Math.abs(r.ci - ci) + Math.abs(r.cj - cj) > 13);
      if (!farEnough) continue;
      carveClearing(ci, cj, rng.int(2, 3));
      break;
    }
  }

  // a winding path stitched between the clearings
  const pathSet = new Set();
  const walkPath = (a, b) => {
    let i = a.ci, j = a.cj;
    let guard = 600;
    while ((i !== b.ci || j !== b.cj) && guard-- > 0) {
      pathSet.add(idx(i, j));
      if (rng.chance(0.4)) pathSet.add(idx(i + rng.int(-1, 1), j + rng.int(-1, 1)));
      const di = Math.sign(b.ci - i), dj = Math.sign(b.cj - j);
      if (rng.chance(0.2)) { i += rng.int(-1, 1); j += rng.int(-1, 1); }
      else if (di !== 0 && (dj === 0 || rng.chance(0.5))) i += di;
      else j += dj;
      i = Math.max(3, Math.min(W - 4, i));
      j = Math.max(3, Math.min(H - 4, j));
    }
  };
  walkPath(spawnRoom, exitRoom);
  for (let k = 2; k < rooms.length; k++) walkPath(rooms[k], rng.chance(0.5) ? spawnRoom : exitRoom);

  // watchtowers, off the path, spaced apart
  const towers = [];
  for (let tries = 0; tries < 120 && towers.length < 5; tries++) {
    const i = rng.int(7, W - 8), j = rng.int(9, H - 10);
    if (pathSet.has(idx(i, j))) continue;
    if (rooms.some(r => Math.abs(r.ci - i) + Math.abs(r.cj - j) < 6)) continue;
    if (towers.some(t => Math.abs(t.i - i) + Math.abs(t.j - j) < 16)) continue;
    towers.push({ i, j, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL });
  }

  // key clearing: farthest from both gates
  let keyRoom = null, bestD = -1;
  for (const r of rooms) {
    if (r === spawnRoom || r === exitRoom) continue;
    const d = Math.min(
      (r.cx - spawnRoom.cx) ** 2 + (r.cz - spawnRoom.cz) ** 2,
      (r.cx - exitRoom.cx) ** 2 + (r.cz - exitRoom.cz) ** 2);
    if (d > bestD) { bestD = d; keyRoom = r; }
  }

  return {
    W, H, open, roomIdOf, height, rooms, doorways: [],
    spawnRoom, exitRoom, keyRoom,
    finale: false, outdoor: true, towers,
    pathHas(i, j) { return pathSet.has(idx(i, j)); },
    towerNear(i, j) { return towers.some(t => Math.abs(t.i - i) <= 2 && Math.abs(t.j - j) <= 2); },
    isSolid(i, j) { return !inb(i, j) || open[idx(i, j)] === 0; },
    heightAt(i, j) { return inb(i, j) ? height[idx(i, j)] : 0; },
    roomAt(i, j) { return inb(i, j) ? roomIdOf[idx(i, j)] : -1; },
    openType(i, j) { return inb(i, j) ? open[idx(i, j)] : 0; },
  };
}

// Floor VII: one vast circular chamber with the Engine at its heart.
function generateFinale(rng) {
  const W = 36, H = 44;
  const open = new Uint8Array(W * H);
  const roomIdOf = new Int16Array(W * H).fill(-1);
  const height = new Float32Array(W * H);
  const idx = (i, j) => j * W + i;
  const inb = (i, j) => i >= 0 && j >= 0 && i < W && j < H;

  const cx = W / 2, cyz = 26, R = 14;
  // entry corridor from the south
  for (let j = 2; j <= cyz; j++) {
    for (let di = -1; di <= 1; di++) {
      const id = idx(Math.floor(cx) + di, j);
      open[id] = 2; height[id] = 3.4;
    }
  }
  // grand chamber
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const d = Math.sqrt((i - cx + 0.5) ** 2 + (j - cyz + 0.5) ** 2);
    if (d < R) {
      const id = idx(i, j);
      open[id] = 1; roomIdOf[id] = 0;
      height[id] = 16;
    }
  }

  const room = {
    id: 0, x: Math.floor(cx - R), y: cyz - R, w: R * 2, h: R * 2,
    theme: 'engine', ceil: 16,
    cx: cx * CELL, cz: cyz * CELL, ci: Math.floor(cx), cj: cyz,
  };
  const spawnRoom = {
    id: -2, x: Math.floor(cx) - 1, y: 2, w: 3, h: 3, theme: 'crypt', ceil: 3.4,
    cx: cx * CELL, cz: 4 * CELL, ci: Math.floor(cx), cj: 4,
  };

  return {
    W, H, open, roomIdOf, height,
    rooms: [room], doorways: [],
    spawnRoom, exitRoom: null, keyRoom: null,
    finale: true,
    engine: { x: cx * CELL, z: cyz * CELL, r: R * CELL },
    isSolid(i, j) { return !inb(i, j) || open[idx(i, j)] === 0; },
    heightAt(i, j) { return inb(i, j) ? height[idx(i, j)] : 0; },
    roomAt(i, j) { return inb(i, j) ? roomIdOf[idx(i, j)] : -1; },
    openType(i, j) { return inb(i, j) ? open[idx(i, j)] : 0; },
  };
}
