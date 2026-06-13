// Procedural textures, revision 2: 128px masters with chiseled detail,
// still drawn from noise and rectangles like it's 2002. No image assets.

import * as THREE from 'three';
import { RNG } from './rng.js';

const cache = new Map();
const animated = [];

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { canvas: c, ctx: c.getContext('2d') };
}

function finishTex(canvas, { srgb = true, clamp = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNoiseFn(rng, cells) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng.float();
  const at = (x, y) => g[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)];
  return (fx, fy) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function noiseFill(ctx, size, rng, base, varAmt, scale = 8) {
  const n1 = makeNoiseFn(rng, scale), n2 = makeNoiseFn(rng, scale * 2), n3 = makeNoiseFn(rng, scale * 4);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size * scale, v = y / size * scale;
      const nv = (n1(u, v) * 0.55 + n2(u * 2, v * 2) * 0.3 + n3(u * 4, v * 4) * 0.15) - 0.5;
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, base[0] + nv * varAmt));
      img.data[i + 1] = Math.max(0, Math.min(255, base[1] + nv * varAmt));
      img.data[i + 2] = Math.max(0, Math.min(255, base[2] + nv * varAmt));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function mottle(ctx, size, rng, amount, alpha = 0.14) {
  for (let i = 0; i < amount; i++) {
    const v = rng.float();
    ctx.fillStyle = v > 0.5
      ? `rgba(255,250,235,${alpha * rng.float()})`
      : `rgba(0,0,0,${alpha * 1.5 * rng.float()})`;
    ctx.fillRect(rng.int(0, size - 1), rng.int(0, size - 1), rng.int(1, 3), rng.int(1, 2));
  }
}

function mossPatches(ctx, size, rng, count, color = '64,78,44') {
  for (let i = 0; i < count; i++) {
    const cx = rng.int(0, size), cy = rng.int(0, size), r = rng.int(3, 9);
    for (let k = 0; k < r * 3; k++) {
      ctx.fillStyle = `rgba(${color},${rng.range(0.1, 0.4)})`;
      const a = rng.range(0, Math.PI * 2), d = rng.range(0, r);
      ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, 2, 1);
    }
  }
}

function tallyMarks(ctx, rng, x, y, scale = 1) {
  ctx.strokeStyle = 'rgba(20,18,15,0.65)';
  ctx.lineWidth = 1;
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 3 * scale, y);
    ctx.lineTo(x + i * 3 * scale, y + 7 * scale);
    ctx.stroke();
  }
  if (n === 5) {
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 6 * scale); ctx.lineTo(x + 13 * scale, y + 1);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- makers

const MAKERS = {

  // gothic dressed stone: chiseled blocks, mossy seams, the odd carved tally
  stoneWall() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('stoneWall2');
    noiseFill(ctx, S, rng, [84, 80, 71], 42, 6);
    const rows = 6, bh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rng.int(0, 20);
      ctx.fillStyle = 'rgba(16,14,12,0.9)';
      ctx.fillRect(0, r * bh, S, 2);
      while (x < S) {
        const bw = rng.int(22, 42);
        // mortar
        ctx.fillStyle = 'rgba(16,14,12,0.9)';
        ctx.fillRect(x, r * bh, 2, bh);
        // per-block tint
        ctx.fillStyle = `rgba(${rng.int(0, 70)},${rng.int(0, 60)},${rng.int(0, 45)},${rng.range(0.04, 0.13)})`;
        ctx.fillRect(x + 2, r * bh + 2, bw - 2, bh - 2);
        // chisel: light top-left, dark bottom-right
        ctx.fillStyle = 'rgba(220,212,190,0.13)';
        ctx.fillRect(x + 2, r * bh + 2, bw - 2, 1);
        ctx.fillRect(x + 2, r * bh + 2, 1, bh - 3);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x + 2, r * bh + bh - 2, bw - 2, 1);
        ctx.fillRect(x + bw - 1, r * bh + 2, 1, bh - 3);
        // pitting
        for (let p = 0; p < 4; p++) {
          ctx.fillStyle = `rgba(0,0,0,${rng.range(0.1, 0.3)})`;
          ctx.fillRect(x + rng.int(3, bw - 3), r * bh + rng.int(3, bh - 3), rng.int(1, 3), rng.int(1, 2));
        }
        if (rng.chance(0.06)) tallyMarks(ctx, rng, x + 6, r * bh + 5);
        x += bw;
      }
      // moss along the seam
      ctx.fillStyle = 'rgba(58,72,40,0.45)';
      for (let i = 0; i < 10; i++) ctx.fillRect(rng.int(0, S), r * bh + rng.int(0, 3) - 1, rng.int(2, 7), 1);
    }
    mossPatches(ctx, S, rng, 4);
    mottle(ctx, S, rng, 420, 0.1);
    return finishTex(canvas);
  },

  stoneFloor() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('stoneFloor2');
    noiseFill(ctx, S, rng, [68, 65, 59], 36, 7);
    // flagstones with worn centers
    for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
      const x = gx * 32 + rng.int(-2, 2), y = gy * 32 + rng.int(-2, 2);
      ctx.strokeStyle = 'rgba(12,11,9,0.92)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, 32, 32);
      ctx.fillStyle = `rgba(${rng.int(180, 230)},${rng.int(175, 220)},${rng.int(160, 200)},${rng.range(0.03, 0.08)})`;
      ctx.fillRect(x + 8, y + 8, 18, 18);
      if (rng.chance(0.3)) { // crack
        let cx = x + rng.int(4, 28), cy = y + 2;
        ctx.fillStyle = 'rgba(10,9,8,0.7)';
        for (let s = 0; s < rng.int(6, 14); s++) {
          ctx.fillRect(cx, cy, 1, 2);
          cx += rng.int(-2, 2); cy += rng.int(1, 3);
        }
      }
    }
    mossPatches(ctx, S, rng, 5);
    mottle(ctx, S, rng, 480, 0.09);
    return finishTex(canvas);
  },

  cryptWall() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('cryptWall2');
    noiseFill(ctx, S, rng, [56, 53, 50], 52, 5);
    // rough-hewn courses
    for (let r = 0; r < 5; r++) {
      const y = r * 26 + rng.int(-3, 3);
      ctx.fillStyle = 'rgba(10,9,8,0.75)';
      for (let x = 0; x < S; x += 3) ctx.fillRect(x, y + rng.int(-1, 1), 3, 2);
    }
    // cracks
    ctx.fillStyle = 'rgba(8,7,6,0.75)';
    for (let i = 0; i < 14; i++) {
      let x = rng.int(0, S), y = rng.int(0, S);
      for (let s = 0; s < rng.int(5, 16); s++) {
        ctx.fillRect(x, y, 1, rng.int(1, 3));
        x += rng.int(-2, 2); y += rng.int(1, 3);
      }
    }
    // pale bone inclusions
    ctx.fillStyle = 'rgba(186,176,150,0.22)';
    for (let i = 0; i < 16; i++) ctx.fillRect(rng.int(0, S), rng.int(0, S), rng.int(2, 5), rng.int(1, 2));
    if (rng.chance(0.9)) tallyMarks(ctx, rng, rng.int(10, 100), rng.int(10, 110));
    mossPatches(ctx, S, rng, 3, '58,64,46');
    mottle(ctx, S, rng, 560, 0.13);
    return finishTex(canvas);
  },

  cryptFloor() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('cryptFloor2');
    noiseFill(ctx, S, rng, [54, 51, 47], 40, 9);
    ctx.fillStyle = 'rgba(11,10,9,0.8)';
    for (let i = 0; i < 70; i++) ctx.fillRect(rng.int(0, S), rng.int(0, S), rng.int(3, 11), 1);
    // bone dust drifts
    ctx.fillStyle = 'rgba(182,172,150,0.16)';
    for (let i = 0; i < 40; i++) ctx.fillRect(rng.int(0, S), rng.int(0, S), rng.int(1, 4), rng.int(1, 2));
    // a worn ring, where wax was
    ctx.strokeStyle = 'rgba(160,150,128,0.12)';
    ctx.beginPath(); ctx.arc(rng.int(30, 96), rng.int(30, 96), rng.int(10, 18), 0, Math.PI * 2); ctx.stroke();
    mottle(ctx, S, rng, 380, 0.11);
    return finishTex(canvas);
  },

  // industrial riveted panels: sub-panels, stencils, rust runs
  metalWall() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('metalWall2');
    noiseFill(ctx, S, rng, [56, 57, 61], 22, 6);
    for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
      const x = px * 64, y = py * 64;
      ctx.strokeStyle = 'rgba(10,10,12,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, 62, 62);
      // inner seam
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(14,14,16,0.6)';
      ctx.strokeRect(x + 7.5, y + 7.5, 49, 49);
      // rivet rows
      ctx.fillStyle = 'rgba(165,167,173,0.55)';
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(x + 4 + i * 9, y + 3, 2, 2);
        ctx.fillRect(x + 4 + i * 9, y + 59, 2, 2);
        ctx.fillRect(x + 3, y + 4 + i * 9, 2, 2);
        ctx.fillRect(x + 59, y + 4 + i * 9, 2, 2);
      }
      // panel shading: top highlight, bottom shadow
      ctx.fillStyle = 'rgba(210,212,220,0.07)'; ctx.fillRect(x + 2, y + 2, 60, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 2, y + 60, 60, 2);
      // stencil markings
      if (rng.chance(0.5)) {
        ctx.fillStyle = 'rgba(196,176,120,0.30)';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(rng.pick(['IX-', 'VII', 'C-4', 'LFT', 'NV.', '044', 'PSL']), x + rng.int(12, 34), y + rng.int(20, 50));
      }
    }
    // rust drips
    for (let i = 0; i < 16; i++) {
      const x = rng.int(0, S), y0 = rng.int(0, 80), len = rng.int(10, 38);
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, 'rgba(98,52,28,0.6)');
      g.addColorStop(1, 'rgba(98,52,28,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y0, rng.int(1, 3), len);
    }
    mottle(ctx, S, rng, 300, 0.09);
    return finishTex(canvas);
  },

  metalFloor() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('metalFloor2');
    noiseFill(ctx, S, rng, [47, 48, 51], 20, 8);
    // diamond plate
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ox = (x * 8 + (y % 2) * 4) % S, oy = y * 8;
      ctx.fillStyle = 'rgba(140,142,148,0.4)';
      ctx.fillRect(ox, oy + 2, 5, 1);
      ctx.fillStyle = 'rgba(15,15,17,0.4)';
      ctx.fillRect(ox, oy + 3, 5, 1);
    }
    // plate seams
    ctx.strokeStyle = 'rgba(12,12,14,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 126, 126);
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, S); ctx.stroke();
    // rust pools + scuffs
    ctx.fillStyle = 'rgba(84,46,24,0.4)';
    for (let i = 0; i < 40; i++) ctx.fillRect(rng.int(0, S), rng.int(0, S), rng.int(1, 5), rng.int(1, 3));
    ctx.fillStyle = 'rgba(180,182,190,0.10)';
    for (let i = 0; i < 12; i++) ctx.fillRect(rng.int(0, S), rng.int(0, S), rng.int(6, 18), 1);
    return finishTex(canvas);
  },

  metalCeil() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('metalCeil2');
    noiseFill(ctx, S, rng, [38, 39, 42], 16, 6);
    ctx.fillStyle = 'rgba(9,9,11,0.9)';
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 32, S, 4);
    ctx.fillStyle = 'rgba(115,117,124,0.3)';
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 32 + 5, S, 1);
    // corrugation
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = 0; x < S; x += 8) ctx.fillRect(x, 0, 2, S);
    mottle(ctx, S, rng, 240, 0.09);
    return finishTex(canvas);
  },

  // retro sci-fi: panels, conduit traces, vents, indicator clusters
  sciWall() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('sciWall2');
    noiseFill(ctx, S, rng, [41, 45, 53], 14, 6);
    ctx.strokeStyle = 'rgba(12,14,18,0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 126, 62);
    ctx.strokeRect(1, 65, 62, 62);
    ctx.strokeRect(65, 65, 62, 62);
    // conduit traces
    ctx.fillStyle = 'rgba(96,106,122,0.55)';
    ctx.fillRect(8, 22, 112, 2); ctx.fillRect(8, 27, 84, 1);
    ctx.fillRect(20, 80, 2, 38); ctx.fillRect(25, 80, 1, 26);
    ctx.fillRect(20, 80, 30, 1);
    // vent
    ctx.fillStyle = 'rgba(10,11,14,0.9)';
    ctx.fillRect(78, 78, 36, 22);
    ctx.fillStyle = 'rgba(120,128,142,0.4)';
    for (let i = 0; i < 5; i++) ctx.fillRect(80, 81 + i * 4, 32, 1);
    // indicator clusters
    for (let i = 0; i < 14; i++) {
      const lit = rng.chance(0.25);
      ctx.fillStyle = lit
        ? (rng.chance(0.5) ? 'rgba(212,162,70,0.95)' : 'rgba(110,196,172,0.95)')
        : 'rgba(18,20,24,0.9)';
      ctx.fillRect(rng.int(8, 56), rng.int(34, 58), 3, 3);
    }
    // glyph stencil
    ctx.fillStyle = 'rgba(150,160,176,0.28)';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(rng.pick(['PRY-9', 'CHOIR', 'ENG//', 'Σ-04']), rng.int(10, 60), rng.int(108, 122));
    // chipped paint
    mottle(ctx, S, rng, 220, 0.08);
    return finishTex(canvas);
  },

  sciFloor() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('sciFloor2');
    noiseFill(ctx, S, rng, [37, 40, 46], 13, 8);
    ctx.strokeStyle = 'rgba(11,13,17,0.95)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.strokeRect(i * 32 + 0.5, 0.5, 32, 127);
    }
    // worn hazard line
    ctx.fillStyle = 'rgba(158,146,92,0.3)';
    ctx.fillRect(0, 58, S, 4);
    ctx.fillStyle = 'rgba(20,20,22,0.5)';
    for (let x = 0; x < S; x += 12) ctx.fillRect(x, 58, 6, 4);
    // scuffs
    ctx.fillStyle = 'rgba(190,194,205,0.07)';
    for (let i = 0; i < 16; i++) ctx.fillRect(rng.int(0, S), rng.int(0, S), rng.int(5, 20), 1);
    mottle(ctx, S, rng, 240, 0.08);
    return finishTex(canvas);
  },

  sciCeil() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('sciCeil2');
    noiseFill(ctx, S, rng, [31, 34, 39], 11, 5);
    ctx.fillStyle = 'rgba(9,10,13,0.9)';
    for (let i = 0; i < 8; i++) ctx.fillRect(i * 16, 0, 2, S);
    ctx.fillStyle = 'rgba(96,104,118,0.25)';
    ctx.fillRect(0, 60, S, 3);
    return finishTex(canvas);
  },

  rust() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('rust2');
    noiseFill(ctx, S, rng, [90, 55, 33], 42, 5);
    // flaking layers
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(${rng.int(40, 70)},${rng.int(22, 38)},${rng.int(12, 22)},${rng.range(0.2, 0.5)})`;
      ctx.fillRect(rng.int(0, S), rng.int(0, S), rng.int(3, 12), rng.int(2, 6));
    }
    mottle(ctx, S, rng, 520, 0.15);
    return finishTex(canvas);
  },

  wood() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('wood2');
    noiseFill(ctx, S, rng, [63, 49, 36], 26, 4);
    // plank seams + grain
    ctx.fillStyle = 'rgba(18,12,8,0.7)';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 22 + rng.int(-1, 1), S, 2);
    ctx.fillStyle = 'rgba(24,16,10,0.45)';
    for (let i = 0; i < 50; i++) {
      const y = rng.int(0, S);
      ctx.fillRect(rng.int(0, S), y, rng.int(8, 30), 1);
    }
    // nail heads
    ctx.fillStyle = 'rgba(20,18,16,0.8)';
    for (let i = 0; i < 6; i++) ctx.fillRect(rng.int(4, 124), rng.int(4, 124), 2, 2);
    return finishTex(canvas);
  },

  // ------------------------------------------ forest set
  grass() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('grass1');
    noiseFill(ctx, S, rng, [44, 52, 38], 26, 7);
    // needle litter patches
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(${rng.int(60, 86)},${rng.int(44, 58)},${rng.int(26, 36)},${rng.range(0.25, 0.5)})`;
      const cx = rng.int(0, S), cy = rng.int(0, S);
      for (let k = 0; k < 9; k++) {
        ctx.fillRect(cx + rng.int(-7, 7), cy + rng.int(-4, 4), rng.int(2, 5), 1);
      }
    }
    // grass blades
    ctx.fillStyle = 'rgba(78,96,58,0.5)';
    for (let i = 0; i < 220; i++) ctx.fillRect(rng.int(0, S), rng.int(0, S), 1, rng.int(1, 3));
    // dark wet patches
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = 'rgba(14,18,12,0.3)';
      const cx = rng.int(0, S), cy = rng.int(0, S), r = rng.int(5, 14);
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    mottle(ctx, S, rng, 320, 0.09);
    return finishTex(canvas);
  },

  bark() {
    const S = 64, H = 128, { canvas, ctx } = makeCanvas(S, H);
    const rng = new RNG('bark1');
    noiseFill(ctx, S, rng, [52, 42, 34], 30, 4);
    // vertical ridges
    for (let x = 0; x < S; x += rng.int(4, 8)) {
      ctx.fillStyle = `rgba(0,0,0,${rng.range(0.2, 0.45)})`;
      ctx.fillRect(x, 0, rng.int(1, 2), H);
      ctx.fillStyle = 'rgba(120,100,80,0.14)';
      ctx.fillRect(x + 2, 0, 1, H);
    }
    // horizontal bark breaks
    ctx.fillStyle = 'rgba(10,8,6,0.5)';
    for (let i = 0; i < 14; i++) ctx.fillRect(rng.int(0, S), rng.int(0, H), rng.int(3, 9), 2);
    // resin glints
    ctx.fillStyle = 'rgba(190,150,80,0.25)';
    for (let i = 0; i < 6; i++) ctx.fillRect(rng.int(0, S), rng.int(0, H), 1, rng.int(2, 6));
    return finishTex(canvas);
  },

  // conifer silhouette on alpha, for cross-plane trees
  pine() {
    const W = 64, H = 128, { canvas, ctx } = makeCanvas(W, H);
    const rng = new RNG('pine1');
    ctx.clearRect(0, 0, W, H);
    // layered ragged triangles, dark desaturated green
    const layers = 9;
    for (let L = 0; L < layers; L++) {
      const y = 6 + (L / layers) * 100;
      const half = 4 + (L / layers) * 26;
      const shade = 30 + rng.int(-6, 8) + L * 1.5;
      ctx.fillStyle = `rgb(${shade * 0.8},${shade},${shade * 0.82})`;
      // ragged fringe of rectangles instead of a clean triangle — y2k alpha foliage
      for (let x = -half; x <= half; x += 2) {
        const droop = Math.abs(x) / half;
        const h = 10 + rng.int(0, 6) - droop * 4;
        if (rng.chance(0.88 - droop * 0.3)) {
          ctx.fillRect(32 + x, y + droop * 7, 2, h);
        }
      }
    }
    // trunk peek
    ctx.fillStyle = 'rgb(40,32,26)';
    ctx.fillRect(30, 96, 4, 32);
    const tex = finishTex(canvas, { clamp: true });
    return tex;
  },

  // the impassable treeline, used as the forest boundary wall
  treeline() {
    const S = 128, { canvas, ctx } = makeCanvas(S, S);
    const rng = new RNG('treeline1');
    // fog gradient behind
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgb(16,17,20)');
    g.addColorStop(1, 'rgb(24,26,28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    // ranks of trunks, nearer = darker
    for (let rank = 0; rank < 3; rank++) {
      const shade = 18 - rank * 5;
      ctx.fillStyle = `rgb(${shade},${shade + 1},${shade})`;
      for (let x = rng.int(0, 6); x < S; x += rng.int(7, 16)) {
        const w = 3 + rank * 2 + rng.int(0, 2);
        ctx.fillRect(x, 0, w, S);
        // branch stubs
        for (let b = 0; b < 4; b++) {
          const by = rng.int(10, 110);
          ctx.fillRect(x - 3, by, w + 6, 2);
        }
      }
    }
    mottle(ctx, S, rng, 200, 0.06);
    return finishTex(canvas);
  },

  banner() {
    const S = 64, H = 128, { canvas, ctx } = makeCanvas(S, H);
    const rng = new RNG('banner2');
    const img = ctx.createImageData(S, H);
    const n = makeNoiseFn(rng, 6);
    for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const nv = n(x / S * 6, y / H * 6) - 0.5;
      img.data[i] = 54 + nv * 30; img.data[i + 1] = 25 + nv * 16; img.data[i + 2] = 27 + nv * 16;
      const fray = y > H - 18 ? (rng.float() < (H - y) / 18 ? 255 : 0) : 255;
      img.data[i + 3] = fray;
    }
    ctx.putImageData(img, 0, 0);
    // fold shading
    for (let x = 0; x < S; x += 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, 0, 4, H);
    }
    // the counting sigil
    ctx.strokeStyle = 'rgba(192,178,142,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(32, 48, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(192,178,142,0.85)';
    ctx.fillRect(30, 28, 4, 40);
    return finishTex(canvas, { clamp: true });
  },

  // additive sprites (small is correct here)
  flame() {
    const S = 32, { canvas, ctx } = makeCanvas(S, S);
    const g = ctx.createRadialGradient(16, 18, 1, 16, 16, 14);
    g.addColorStop(0, 'rgba(255,225,150,1)');
    g.addColorStop(0.35, 'rgba(235,140,50,0.8)');
    g.addColorStop(0.8, 'rgba(120,40,10,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return finishTex(canvas, { clamp: true });
  },

  glow() {
    const S = 32, { canvas, ctx } = makeCanvas(S, S);
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(235,230,210,0.9)');
    g.addColorStop(0.4, 'rgba(200,196,170,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return finishTex(canvas, { clamp: true });
  },

  itemglow() {
    const S = 32, H = 64, { canvas, ctx } = makeCanvas(S, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(220,215,190,0)');
    g.addColorStop(0.5, 'rgba(220,215,190,0.55)');
    g.addColorStop(1, 'rgba(220,215,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(13, 0, 6, H);
    const g2 = ctx.createRadialGradient(16, 32, 1, 16, 32, 14);
    g2.addColorStop(0, 'rgba(235,230,200,0.7)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, S, H);
    return finishTex(canvas, { clamp: true });
  },

  shadowBlob() {
    const S = 64, { canvas, ctx } = makeCanvas(S, S);
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.74)');
    g.addColorStop(0.78, 'rgba(0,0,0,0.66)');
    g.addColorStop(0.93, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return finishTex(canvas, { clamp: true });
  },
};

// ---------------------------------------------------------------- animated

function makeFogWall() {
  const S = 64, { canvas, ctx } = makeCanvas(S, S);
  const rng = new RNG('fogwall');
  const n = makeNoiseFn(rng, 8);
  const tex = finishTex(canvas, { srgb: false });
  let t0 = 0;
  const draw = (t) => {
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const v = n((x / S * 8 + t * 0.25) % 8, (y / S * 8 + t * 0.1) % 8) * 0.6
        + n((x / S * 16 - t * 0.4) % 16, (y / S * 16) % 16) * 0.4;
      const a = Math.max(0, Math.min(1, (v - 0.32) * 2.2));
      img.data[i] = 225; img.data[i + 1] = 222; img.data[i + 2] = 210;
      img.data[i + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
    tex.needsUpdate = true;
  };
  draw(0);
  animated.push((t) => { if (t - t0 > 0.12) { t0 = t; draw(t); } });
  return tex;
}

function makeStatic() {
  const W = 48, H = 36, { canvas, ctx } = makeCanvas(W, H);
  const tex = finishTex(canvas, { clamp: true });
  let t0 = 0;
  const draw = () => {
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const v = Math.random() * 110 + 12;
      img.data[i * 4] = v * 0.85; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 0.9;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const y = Math.floor((performance.now() * 0.02) % H);
    ctx.fillStyle = 'rgba(200,210,200,0.18)';
    ctx.fillRect(0, y, W, 3);
    tex.needsUpdate = true;
  };
  draw();
  animated.push((t) => { if (t - t0 > 0.09) { t0 = t; draw(); } });
  return tex;
}

function makeTerminal() {
  const W = 48, H = 36, { canvas, ctx } = makeCanvas(W, H);
  const tex = finishTex(canvas, { clamp: true });
  const glyphs = '0123456789ABCDEF·:+';
  let t0 = 0, lines = [];
  const draw = () => {
    ctx.fillStyle = '#0a0805'; ctx.fillRect(0, 0, W, H);
    if (Math.random() < 0.4 || lines.length === 0) {
      let s = '';
      for (let i = 0; i < 9; i++) s += glyphs[Math.floor(Math.random() * glyphs.length)];
      lines.push(s);
      if (lines.length > 7) lines.shift();
    }
    ctx.fillStyle = 'rgba(196,140,52,0.95)';
    ctx.font = '5px monospace';
    lines.forEach((s, i) => ctx.fillText(s, 2, 6 + i * 5));
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
    tex.needsUpdate = true;
  };
  draw();
  animated.push((t) => { if (t - t0 > 0.5) { t0 = t; draw(); } });
  return tex;
}

export function getTex(name) {
  if (cache.has(name)) return cache.get(name);
  let tex;
  if (name === 'fogwall') tex = makeFogWall();
  else if (name === 'static') tex = makeStatic();
  else if (name === 'terminal') tex = makeTerminal();
  else if (MAKERS[name]) tex = MAKERS[name]();
  else throw new Error('unknown texture: ' + name);
  cache.set(name, tex);
  return tex;
}

export function tickTextures(t) {
  for (const fn of animated) fn(t);
}

// ---------------------------------------------------------------- icons

const iconCache = new Map();
export function getIcon(kind) {
  if (iconCache.has(kind)) return iconCache.get(kind);
  const { canvas, ctx } = makeCanvas(48, 48);
  ctx.strokeStyle = '#c8b68a'; ctx.fillStyle = '#c8b68a'; ctx.lineWidth = 2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (kind) {
    case 'sword':
      ctx.beginPath(); ctx.moveTo(10, 38); ctx.lineTo(34, 8); ctx.lineTo(38, 12); ctx.lineTo(14, 42); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, 30); ctx.lineTo(18, 40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 42); ctx.lineTo(12, 36); ctx.stroke();
      break;
    case 'lantern':
      ctx.strokeRect(16, 14, 16, 22);
      ctx.beginPath(); ctx.moveTo(20, 14); ctx.quadraticCurveTo(24, 4, 28, 14); ctx.stroke();
      ctx.fillStyle = 'rgba(230,190,110,0.8)';
      ctx.beginPath(); ctx.arc(24, 26, 4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'cranklamp':
      ctx.strokeRect(10, 16, 16, 18);
      ctx.beginPath(); ctx.moveTo(26, 20); ctx.lineTo(40, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(26, 26); ctx.lineTo(42, 26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(26, 32); ctx.lineTo(40, 38); ctx.stroke();
      ctx.beginPath(); ctx.arc(14, 40, 5, 0, Math.PI * 1.5); ctx.stroke();
      ctx.fillRect(17, 36, 3, 3);
      break;
    case 'radar':
      ctx.beginPath(); ctx.arc(24, 24, 17, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(24, 24, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(24, 24); ctx.lineTo(36, 12); ctx.stroke();
      ctx.fillRect(15, 28, 2, 2); ctx.fillRect(30, 31, 2, 2); ctx.fillRect(19, 15, 2, 2);
      break;
    case 'oil':
      ctx.beginPath(); ctx.moveTo(20, 10); ctx.lineTo(28, 10); ctx.lineTo(28, 16); ctx.lineTo(34, 24); ctx.lineTo(34, 40); ctx.lineTo(14, 40); ctx.lineTo(14, 24); ctx.lineTo(20, 16); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(176,141,62,0.55)'; ctx.fillRect(16, 28, 16, 10);
      break;
    case 'ampoule':
      ctx.beginPath(); ctx.moveTo(22, 8); ctx.lineTo(26, 8); ctx.lineTo(26, 18); ctx.quadraticCurveTo(34, 24, 32, 34); ctx.quadraticCurveTo(30, 42, 24, 42); ctx.quadraticCurveTo(18, 42, 16, 34); ctx.quadraticCurveTo(14, 24, 22, 18); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(216,210,196,0.5)';
      ctx.beginPath(); ctx.arc(24, 33, 6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'key':
      ctx.beginPath(); ctx.arc(16, 16, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(21, 21); ctx.lineTo(38, 38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(28, 36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(36, 36); ctx.lineTo(32, 40); ctx.stroke();
      break;
    case 'psalm':
      ctx.strokeRect(12, 10, 24, 30);
      ctx.beginPath(); ctx.moveTo(24, 10); ctx.lineTo(24, 40); ctx.stroke();
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(15, 16 + i * 6); ctx.lineTo(21, 16 + i * 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(27, 16 + i * 6); ctx.lineTo(33, 16 + i * 6); ctx.stroke();
      }
      break;
    case 'note':
      ctx.strokeRect(14, 8, 20, 32);
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(18, 14 + i * 6); ctx.lineTo(30, 14 + i * 6); ctx.stroke(); }
      break;
    case 'relic':
      ctx.beginPath(); ctx.moveTo(24, 8); ctx.lineTo(36, 22); ctx.lineTo(24, 42); ctx.lineTo(12, 22); ctx.closePath(); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(12, 22); ctx.lineTo(36, 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, 8); ctx.lineTo(24, 42); ctx.stroke();
      break;
    default:
      ctx.strokeRect(14, 14, 20, 20);
  }
  const url = canvas.toDataURL();
  iconCache.set(kind, url);
  return url;
}
