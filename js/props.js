// Low-poly prop builders, revision 2: more facets, same y2k soul.
// Every prop returns { group, r } where r is a collision radius (0 = walkthrough).

import * as THREE from 'three';
import { getTex } from './textures.js';

const matCache = new Map();
export function matFor(texName, opts = {}) {
  const key = texName + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({
    map: texName ? getTex(texName) : null,
    color: opts.color !== undefined ? opts.color : 0xffffff,
    side: THREE.DoubleSide,
    ...(opts.emissive !== undefined ? { emissive: opts.emissive, emissiveIntensity: opts.emissiveIntensity ?? 1 } : {}),
    ...(opts.transparent ? { transparent: true, opacity: opts.opacity ?? 1 } : {}),
  });
  if (opts.alphaTest) { m.alphaTest = opts.alphaTest; m.transparent = true; }
  matCache.set(key, m);
  return m;
}

export function flat(color, opts = {}) {
  return matFor(null, { color, ...opts });
}

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}
function cyl(rTop, rBot, h, seg, mat) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
}

export function flameSprite(scale = 0.5, color = 0xffc878) {
  const mat = new THREE.SpriteMaterial({
    map: getTex('flame'), color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale * 1.4, 1);
  return s;
}

export function glowSprite(scale = 1, color = 0xfff2cc, opacity = 0.5) {
  const mat = new THREE.SpriteMaterial({
    map: getTex('glow'), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale, 1);
  return s;
}

// ---------------------------------------------------------------- gothic

export function brazier(lit = true) {
  const g = new THREE.Group();
  const iron = flat(0x2e2a26);
  const bowl = cyl(0.34, 0.18, 0.26, 10, iron); bowl.position.y = 1.05; g.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 5, 10), iron);
  rim.rotation.x = Math.PI / 2; rim.position.y = 1.18; g.add(rim);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const leg = box(0.05, 1.14, 0.05, iron);
    leg.position.set(Math.cos(a) * 0.22, 0.55, Math.sin(a) * 0.22);
    leg.rotation.z = Math.cos(a) * 0.14;
    leg.rotation.x = -Math.sin(a) * 0.14;
    g.add(leg);
    const foot = box(0.1, 0.04, 0.1, iron);
    foot.position.set(Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3);
    g.add(foot);
  }
  const lights = [];
  if (lit) {
    const fl = flameSprite(0.65); fl.position.y = 1.35; g.add(fl);
    const li = new THREE.PointLight(0xffa050, 9, 13, 1.8);
    li.position.y = 1.5; g.add(li);
    lights.push({ light: li, base: 9, style: 'fire', flame: fl });
  }
  return { group: g, r: 0.42, lights };
}

export function candles(rng) {
  const g = new THREE.Group();
  const wax = flat(0xb9ad94);
  const n = rng.int(3, 7);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.1, 0.4);
    const c = cyl(0.04, 0.05, h, 6, wax);
    c.position.set(rng.range(-0.3, 0.3), h / 2, rng.range(-0.3, 0.3));
    g.add(c);
    // wax drips
    if (rng.chance(0.5)) {
      const drip = cyl(0.012, 0.02, h * 0.5, 4, wax);
      drip.position.set(c.position.x + 0.04, h * 0.7, c.position.z);
      g.add(drip);
    }
    const fl = flameSprite(0.14);
    fl.position.set(c.position.x, h + 0.07, c.position.z);
    g.add(fl);
  }
  return { group: g, r: 0, lights: [] };
}

export function pillar(theme, height) {
  const g = new THREE.Group();
  if (theme === 'industrial' || theme === 'scifi') {
    const m = matFor('metalWall');
    const p = box(0.5, height, 0.5, m); p.position.y = height / 2; g.add(p);
    // flange rings
    for (const y of [0.15, height - 0.15, height / 2]) {
      const fl = box(0.62, 0.12, 0.62, flat(0x35322e));
      fl.position.y = y; g.add(fl);
    }
    // rivets line
    const riv = flat(0x6a6c72);
    for (let i = 1; i < 4; i++) {
      const r = box(0.04, 0.04, 0.54, riv);
      r.position.y = (height / 4) * i; g.add(r);
    }
  } else {
    const m = matFor('stoneWall');
    const p = cyl(0.4, 0.48, height, 10, m); p.position.y = height / 2; g.add(p);
    const base = box(1.0, 0.3, 1.0, m); base.position.y = 0.15; g.add(base);
    const base2 = box(0.84, 0.18, 0.84, m); base2.position.y = 0.38; g.add(base2);
    const cap = box(0.8, 0.2, 0.8, m); cap.position.y = height - 0.32; g.add(cap);
    const cap2 = box(0.98, 0.18, 0.98, m); cap2.position.y = height - 0.12; g.add(cap2);
  }
  return { group: g, r: 0.6, lights: [] };
}

export function statue() {
  // hooded mourner: bowed head, praying hands
  const g = new THREE.Group();
  const stone = matFor('cryptWall', { color: 0xbdb8b0 });
  const base = box(0.8, 0.25, 0.8, stone); base.position.y = 0.12; g.add(base);
  const robe = cyl(0.17, 0.42, 1.5, 9, stone); robe.position.y = 1.0; g.add(robe);
  const shoulders = box(0.55, 0.22, 0.3, stone); shoulders.position.y = 1.68; g.add(shoulders);
  const armL = box(0.1, 0.42, 0.12, stone);
  armL.position.set(-0.2, 1.42, 0.14); armL.rotation.x = -0.55; armL.rotation.z = 0.25; g.add(armL);
  const armR = box(0.1, 0.42, 0.12, stone);
  armR.position.set(0.2, 1.42, 0.14); armR.rotation.x = -0.55; armR.rotation.z = -0.25; g.add(armR);
  const hands = box(0.1, 0.2, 0.1, stone);
  hands.position.set(0, 1.42, 0.3); g.add(hands);
  const hood = cyl(0.09, 0.2, 0.36, 7, stone);
  hood.position.set(0, 1.86, 0.06); hood.rotation.x = 0.5; g.add(hood);
  const cowlBack = box(0.3, 0.4, 0.16, stone);
  cowlBack.position.set(0, 1.74, -0.1); g.add(cowlBack);
  return { group: g, r: 0.5, lights: [] };
}

export function headlessSaint() {
  const g = new THREE.Group();
  const stone = matFor('cryptWall', { color: 0xb5b0a6 });
  const base = box(1.1, 0.4, 1.1, stone); base.position.y = 0.2; g.add(base);
  const plinth = box(0.9, 0.2, 0.9, stone); plinth.position.y = 0.5; g.add(plinth);
  const robe = cyl(0.25, 0.5, 1.9, 9, stone); robe.position.y = 1.5; g.add(robe);
  const shoulders = box(0.72, 0.26, 0.36, stone); shoulders.position.y = 2.5; g.add(shoulders);
  const stump = cyl(0.09, 0.11, 0.12, 7, flat(0x8d887e)); stump.position.y = 2.69; g.add(stump);
  const handL = box(0.14, 0.1, 0.34, stone); handL.position.set(-0.3, 1.6, 0.42); handL.rotation.x = -0.15; g.add(handL);
  const handR = box(0.14, 0.1, 0.34, stone); handR.position.set(0.3, 1.6, 0.42); handR.rotation.x = -0.15; g.add(handR);
  // folds
  for (let i = 0; i < 4; i++) {
    const fold = box(0.06, 1.5, 0.06, stone);
    const a = (i / 4) * Math.PI - Math.PI / 2;
    fold.position.set(Math.sin(a) * 0.42, 1.25, Math.cos(a) * 0.42 * 0.5 + 0.2);
    g.add(fold);
  }
  return { group: g, r: 0.7, lights: [] };
}

export function coffin() {
  const g = new THREE.Group();
  const m = matFor('wood');
  const body = box(0.7, 0.42, 2.0, m); body.position.y = 0.25; g.add(body);
  const taper = box(0.5, 0.42, 0.4, m); taper.position.set(0, 0.25, 1.1); g.add(taper);
  const lid = box(0.74, 0.07, 2.04, m); lid.position.y = 0.5;
  lid.rotation.y = (Math.random() - 0.5) * 0.12;
  g.add(lid);
  const trim = box(0.78, 0.05, 0.1, flat(0x2c2823));
  trim.position.set(0, 0.48, -0.6); g.add(trim);
  const trim2 = trim.clone(); trim2.position.z = 0.5; g.add(trim2);
  return { group: g, r: 0.85, lights: [] };
}

export function bonePile(rng) {
  const g = new THREE.Group();
  const bone = flat(0xb6ac92);
  const n = rng.int(4, 8);
  for (let i = 0; i < n; i++) {
    const b = cyl(0.025, 0.035, rng.range(0.25, 0.5), 5, bone);
    b.position.set(rng.range(-0.3, 0.3), 0.05, rng.range(-0.3, 0.3));
    b.rotation.set(Math.PI / 2 + rng.range(-0.3, 0.3), 0, rng.range(0, Math.PI));
    g.add(b);
  }
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), bone);
  skull.scale.set(1, 0.85, 1.1);
  skull.position.set(rng.range(-0.2, 0.2), 0.09, rng.range(-0.2, 0.2));
  g.add(skull);
  const jaw = box(0.1, 0.04, 0.08, bone);
  jaw.position.copy(skull.position); jaw.position.y = 0.03; jaw.position.z += 0.04;
  g.add(jaw);
  return { group: g, r: 0, lights: [] };
}

export function bannerHang(height) {
  const g = new THREE.Group();
  const m = matFor('banner', { alphaTest: 0.4 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9, 1, 4), m);
  // a gentle billow
  const pos = plane.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, Math.sin((pos.getY(i) + 0.95) / 1.9 * Math.PI) * 0.12);
  }
  pos.needsUpdate = true;
  plane.geometry.computeVertexNormals();
  plane.position.y = height - 1.4;
  g.add(plane);
  const rod = cyl(0.03, 0.03, 1.1, 6, flat(0x2c2823));
  rod.rotation.z = Math.PI / 2; rod.position.y = height - 0.42;
  g.add(rod);
  return { group: g, r: 0, lights: [] };
}

// ---------------------------------------------------------------- industrial

export function crate(rng) {
  const s = rng.range(0.6, 0.95);
  const g = new THREE.Group();
  const m = matFor('wood');
  const c = box(s, s, s, m);
  c.position.y = s / 2; c.rotation.y = rng.range(0, Math.PI);
  g.add(c);
  // edge battens
  const batten = flat(0x453526);
  for (const dy of [s * 0.08, s * 0.92]) {
    const b = box(s + 0.03, 0.05, s + 0.03, batten);
    b.position.y = dy; b.rotation.y = c.rotation.y;
    g.add(b);
  }
  return { group: g, r: s * 0.72, lights: [] };
}

export function barrel(rng) {
  const g = new THREE.Group();
  const b = cyl(0.3, 0.34, 0.9, 10, matFor('rust'));
  b.position.y = 0.45;
  const hoop = flat(0x232120);
  for (const y of [0.2, 0.7]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.018, 4, 10), hoop);
    h.rotation.x = Math.PI / 2; h.position.y = y;
    g.add(h);
  }
  if (rng.chance(0.25)) { g.rotation.z = Math.PI / 2; g.position.y = 0.34; }
  g.add(b);
  return { group: g, r: 0.45, lights: [] };
}

export function pipeRun(length, height) {
  const g = new THREE.Group();
  const m = matFor('rust');
  const m2 = matFor('metalWall');
  const p1 = cyl(0.09, 0.09, length, 8, m);
  p1.rotation.z = Math.PI / 2; p1.position.set(0, height, 0.12); g.add(p1);
  const p2 = cyl(0.06, 0.06, length, 7, m2);
  p2.rotation.z = Math.PI / 2; p2.position.set(0, height - 0.22, 0.1); g.add(p2);
  // elbow + valve wheel on the big pipe
  const elbow = cyl(0.1, 0.1, 0.3, 8, m);
  elbow.position.set(length * 0.3, height - 0.15, 0.12); g.add(elbow);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 4, 9), flat(0x5a3a22));
  wheel.position.set(length * 0.3, height - 0.34, 0.12);
  wheel.rotation.x = Math.PI / 2;
  g.add(wheel);
  for (let x = -length / 2 + 0.5; x < length / 2; x += 1.4) {
    const bracket = box(0.06, 0.4, 0.06, m2);
    bracket.position.set(x, height - 0.12, 0.08); g.add(bracket);
  }
  return { group: g, r: 0, lights: [] };
}

export function chainHang(ceilH, rng) {
  const g = new THREE.Group();
  const m = flat(0x35322c);
  const len = rng.range(ceilH * 0.3, ceilH * 0.8);
  const links = Math.floor(len / 0.22);
  for (let i = 0; i < links; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 4, 6), m);
    link.position.y = ceilH - i * 0.2 - 0.1;
    link.rotation.y = (i % 2) * Math.PI / 2;
    g.add(link);
  }
  if (rng.chance(0.3)) {
    const hook = box(0.16, 0.22, 0.06, m);
    hook.position.y = ceilH - len;
    g.add(hook);
  }
  return { group: g, r: 0, lights: [] };
}

export function cagedLamp(ceilH, lit) {
  const g = new THREE.Group();
  const m = flat(0x2c2a26);
  const wire = cyl(0.015, 0.015, 0.8, 4, m);
  wire.position.y = ceilH - 0.4; g.add(wire);
  const cage = cyl(0.13, 0.16, 0.3, 8, matFor('metalWall', { transparent: true, opacity: 0.9 }));
  cage.position.y = ceilH - 0.9; g.add(cage);
  // cage ribs
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const rib = box(0.015, 0.3, 0.015, m);
    rib.position.set(Math.cos(a) * 0.145, ceilH - 0.9, Math.sin(a) * 0.145);
    g.add(rib);
  }
  const lights = [];
  if (lit) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
      flat(0xffe6a8, { emissive: 0xffd890, emissiveIntensity: 1.6 }));
    bulb.position.y = ceilH - 0.92; g.add(bulb);
    const li = new THREE.PointLight(0xcfe0c8, 7, 11, 1.8);
    li.position.y = ceilH - 1.0; g.add(li);
    const gl = glowSprite(0.8, 0xd8e8cc, 0.35); gl.position.y = ceilH - 0.92; g.add(gl);
    lights.push({ light: li, base: 7, style: 'electric', glow: gl });
  }
  return { group: g, r: 0, lights };
}

// ---------------------------------------------------------------- retro sci-fi

export function terminal(rng) {
  const g = new THREE.Group();
  const body = matFor('sciWall');
  const ped = box(0.6, 0.85, 0.5, body); ped.position.y = 0.42; g.add(ped);
  const head = box(0.7, 0.5, 0.45, body); head.position.y = 1.1; head.rotation.x = -0.18; g.add(head);
  // cooling fins on the back
  for (let i = 0; i < 4; i++) {
    const fin = box(0.6, 0.04, 0.08, flat(0x2a2e36));
    fin.position.set(0, 0.95 + i * 0.1, -0.26);
    g.add(fin);
  }
  const screenMat = new THREE.MeshBasicMaterial({ map: getTex(rng.chance(0.5) ? 'terminal' : 'static') });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.36), screenMat);
  screen.position.set(0, 1.12, 0.24); screen.rotation.x = -0.18; g.add(screen);
  // keys ledge
  const ledge = box(0.55, 0.05, 0.2, flat(0x23262c));
  ledge.position.set(0, 0.86, 0.3); g.add(ledge);
  const lights = [];
  const li = new THREE.PointLight(0xc88a3c, 2.2, 4.5, 2);
  li.position.set(0, 1.2, 0.5); g.add(li);
  lights.push({ light: li, base: 2.2, style: 'screen' });
  return { group: g, r: 0.55, lights };
}

export function serverRack(rng) {
  const g = new THREE.Group();
  const m = matFor('sciWall');
  const h = rng.range(1.8, 2.3);
  const rack = box(0.8, h, 0.6, m); rack.position.y = h / 2; g.add(rack);
  // unit slots
  const slot = flat(0x191c22);
  for (let i = 0; i < Math.floor(h / 0.28); i++) {
    const s = box(0.7, 0.04, 0.02, slot);
    s.position.set(0, 0.2 + i * 0.28, 0.31);
    g.add(s);
  }
  for (let i = 0; i < 6; i++) {
    if (!rng.chance(0.3)) continue;
    const c = rng.chance(0.5) ? 0xc8883c : 0x6ec0aa;
    const led = box(0.04, 0.04, 0.02, flat(c, { emissive: c, emissiveIntensity: 2 }));
    led.position.set(rng.range(-0.3, 0.3), rng.range(0.3, h - 0.3), 0.315);
    g.add(led);
  }
  return { group: g, r: 0.65, lights: [] };
}

export function cableMass(rng) {
  const g = new THREE.Group();
  const m = flat(0x191917);
  for (let i = 0; i < rng.int(4, 7); i++) {
    const c = box(rng.range(0.08, 0.16), 0.06, rng.range(1, 2.4), m);
    c.position.set(rng.range(-0.5, 0.5), 0.03, rng.range(-0.5, 0.5));
    c.rotation.y = rng.range(0, Math.PI);
    g.add(c);
  }
  // a junction box
  if (rng.chance(0.5)) {
    const j = box(0.3, 0.18, 0.22, matFor('sciWall'));
    j.position.set(rng.range(-0.4, 0.4), 0.09, rng.range(-0.4, 0.4));
    g.add(j);
  }
  return { group: g, r: 0, lights: [] };
}

// ---------------------------------------------------------------- forest

export function pineTree(rng) {
  const g = new THREE.Group();
  const h = rng.range(5, 8.5);
  const trunk = cyl(0.1, 0.22, h * 0.55, 7, matFor('bark'));
  trunk.position.y = h * 0.27;
  g.add(trunk);
  // cross-plane canopy
  const m = matFor('pine', { alphaTest: 0.5 });
  const cw = rng.range(2.0, 2.9), ch = h * 0.85;
  for (let i = 0; i < 2; i++) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), m);
    plane.position.y = h * 0.52;
    plane.rotation.y = i * Math.PI / 2 + rng.range(-0.2, 0.2);
    g.add(plane);
  }
  g.rotation.y = rng.range(0, Math.PI * 2);
  g.rotation.z = rng.range(-0.03, 0.03);
  return { group: g, r: 0.3, lights: [] };
}

export function mushroomCluster(rng) {
  const g = new THREE.Group();
  const stemM = flat(0xb9b3a4);
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.08, 0.28);
    const stem = cyl(0.02, 0.03, h, 5, stemM);
    const x = rng.range(-0.35, 0.35), z = rng.range(-0.35, 0.35);
    stem.position.set(x, h / 2, z);
    g.add(stem);
    const glow = rng.chance(0.7);
    const capColor = glow ? 0x7fd8c8 : 0x8a6a52;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rng.range(0.05, 0.11), h * 0.5, 7),
      glow ? flat(capColor, { emissive: capColor, emissiveIntensity: 0.7 }) : flat(capColor));
    cap.position.set(x, h + h * 0.2, z);
    g.add(cap);
  }
  const gl = glowSprite(0.7, 0x86e0cc, 0.18);
  gl.position.y = 0.25;
  g.add(gl);
  return { group: g, r: 0, lights: [] };
}

export function watchtower(rng) {
  const g = new THREE.Group();
  const m = matFor('wood');
  const iron = matFor('rust');
  const H = 9;
  // four splayed legs
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box(0.18, H, 0.18, m);
    leg.position.set(sx * 1.0, H / 2, sz * 1.0);
    leg.rotation.z = -sx * 0.06;
    leg.rotation.x = sz * 0.06;
    g.add(leg);
  }
  // cross-bracing
  for (let lvl = 0; lvl < 3; lvl++) {
    const y = 1.6 + lvl * 2.4;
    for (const rot of [0, Math.PI / 2]) {
      const brace = box(2.3 - lvl * 0.2, 0.08, 0.08, m);
      brace.position.y = y;
      brace.rotation.y = rot;
      g.add(brace);
    }
  }
  // platform + cabin
  const plat = box(2.6, 0.14, 2.6, m); plat.position.y = H * 0.78; g.add(plat);
  const cabin = box(1.9, 1.5, 1.9, m); cabin.position.y = H * 0.78 + 0.82; g.add(cabin);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.9, 4), iron);
  roof.position.y = H * 0.78 + 1.6 + 0.45;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  // dark windows
  const win = flat(0x0c0e10);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const w = box(0.7, 0.4, 0.05, win);
    w.position.set(Math.sin(a) * 0.96, H * 0.78 + 1.0, Math.cos(a) * 0.96);
    w.rotation.y = a;
    g.add(w);
  }
  // siren horn
  const horn = cyl(0.16, 0.05, 0.5, 8, iron);
  horn.rotation.z = Math.PI / 2.3;
  horn.position.set(0.8, H * 0.78 + 1.7, 0);
  g.add(horn);
  // slow red beacon
  const li = new THREE.PointLight(0x9c2418, 4, 16, 1.6);
  li.position.y = H * 0.78 + 2.3;
  g.add(li);
  const gl = glowSprite(0.9, 0xc03224, 0.5);
  gl.position.y = H * 0.78 + 2.3;
  g.add(gl);
  // ladder
  const lm = flat(0x2c2620);
  for (let i = 0; i < 12; i++) {
    const rung = box(0.4, 0.04, 0.04, lm);
    rung.position.set(0, 0.5 + i * 0.55, 1.05);
    g.add(rung);
  }
  const lights = [{ light: li, base: 4, style: 'blink', glow: gl }];
  return { group: g, r: 1.5, lights };
}

// ---------------------------------------------------------------- swords

export function swordMesh(scale = 1) {
  const g = new THREE.Group();
  const steel = flat(0x8e939c);
  const brightSteel = flat(0xb9bec8);
  const darkSteel = flat(0x4a4d54);
  const grip = flat(0x2e2620);
  // blade: core + two bevel faces for a catch-the-light edge
  const blade = box(0.08, 1.15, 0.028, steel); blade.position.y = 0.85; g.add(blade);
  const edgeL = box(0.018, 1.12, 0.012, brightSteel); edgeL.position.set(-0.048, 0.84, 0); g.add(edgeL);
  const edgeR = box(0.018, 1.12, 0.012, brightSteel); edgeR.position.set(0.048, 0.84, 0); g.add(edgeR);
  const tip = box(0.045, 0.18, 0.022, steel); tip.position.y = 1.5; g.add(tip);
  const fuller = box(0.022, 1.0, 0.032, darkSteel); fuller.position.y = 0.82; g.add(fuller);
  const guard = box(0.36, 0.05, 0.07, darkSteel); guard.position.y = 0.28; g.add(guard);
  const guardTipL = box(0.05, 0.07, 0.08, darkSteel); guardTipL.position.set(-0.2, 0.28, 0); g.add(guardTipL);
  const guardTipR = box(0.05, 0.07, 0.08, darkSteel); guardTipR.position.set(0.2, 0.28, 0); g.add(guardTipR);
  const handle = cyl(0.025, 0.03, 0.24, 7, grip); handle.position.y = 0.14; g.add(handle);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), darkSteel);
  pommel.position.y = 0.01; g.add(pommel);
  g.scale.setScalar(scale);
  return g;
}

export function swordGrave(rng) {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.3, 8), matFor('cryptFloor'));
  mound.position.y = 0.15; g.add(mound);
  const sw = swordMesh(1);
  sw.position.y = 0.18;
  sw.rotation.z = rng.range(-0.16, 0.16);
  sw.rotation.x = rng.range(-0.1, 0.1);
  g.add(sw);
  return { group: g, r: 0.4, lights: [] };
}

// ---------------------------------------------------------------- checkpoint / lift

export function emberBeacon() {
  const g = new THREE.Group();
  const iron = flat(0x2a2622);
  const base = cyl(0.55, 0.7, 0.22, 10, matFor('stoneFloor')); base.position.y = 0.11; g.add(base);
  const bowl = cyl(0.4, 0.24, 0.3, 10, iron); bowl.position.y = 0.42; g.add(bowl);
  // coals
  const coal = flat(0x402018, { emissive: 0x8a3a18, emissiveIntensity: 0.5 });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const c = box(0.1, 0.07, 0.1, coal);
    c.position.set(Math.cos(a) * 0.16, 0.56, Math.sin(a) * 0.16);
    c.rotation.y = a;
    g.add(c);
  }
  const sw = swordMesh(1.1); sw.position.y = 0.45; sw.rotation.x = 0.06; g.add(sw);
  const fl = flameSprite(0.8, 0xffb464); fl.position.y = 0.72; g.add(fl);
  const gl = glowSprite(2.2, 0xff9a4a, 0.3); gl.position.y = 0.8; g.add(gl);
  const li = new THREE.PointLight(0xff9650, 11, 15, 1.7);
  li.position.y = 1.0; g.add(li);
  return { group: g, r: 0.6, lights: [{ light: li, base: 11, style: 'fire', flame: fl }] };
}

export function liftGate(ceilH) {
  const g = new THREE.Group();
  const m = matFor('metalWall');
  const rustM = matFor('rust');
  const plat = box(2.6, 0.16, 2.6, matFor('metalFloor')); plat.position.y = 0.08; g.add(plat);
  // corner posts + chains
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    const post = box(0.1, 1.0, 0.1, m);
    post.position.set(x, 0.55, z); g.add(post);
    const ch = cyl(0.03, 0.03, ceilH, 5, rustM);
    ch.position.set(x, ceilH / 2, z); g.add(ch);
  }
  // winch console
  const winch = box(0.5, 1.0, 0.4, m); winch.position.set(1.7, 0.5, 0); g.add(winch);
  const lever = box(0.05, 0.5, 0.05, flat(0x6e5520));
  lever.position.set(1.7, 1.2, 0); lever.rotation.z = -0.5; g.add(lever);
  const drum = cyl(0.2, 0.2, 0.4, 9, rustM);
  drum.rotation.x = Math.PI / 2; drum.position.set(1.7, 1.45, 0); g.add(drum);
  const gear = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 4, 8), flat(0x3a3530));
  gear.position.set(1.48, 1.45, 0); g.add(gear);
  return { group: g, r: 0, lights: [] };
}

export function fogWallMesh(width, height) {
  const mat = new THREE.MeshBasicMaterial({
    map: getTex('fogwall'), transparent: true, opacity: 0.55,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  m.position.y = height / 2;
  return m;
}

// ---------------------------------------------------------------- figures

export function figureMesh(height = 2.0, shade = 0x0d0d10) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: shade, transparent: true, opacity: 1 });
  const legs = box(0.3, height * 0.48, 0.22, m); legs.position.y = height * 0.24; g.add(legs);
  const hips = box(0.36, height * 0.08, 0.24, m); hips.position.y = height * 0.5; g.add(hips);
  const torso = box(0.42, height * 0.34, 0.26, m); torso.position.y = height * 0.7; g.add(torso);
  const neck = box(0.1, height * 0.05, 0.1, m); neck.position.y = height * 0.885; g.add(neck);
  const head = box(0.2, height * 0.15, 0.2, m); head.position.y = height * 0.97; g.add(head);
  const armL = box(0.09, height * 0.42, 0.09, m); armL.position.set(-0.28, height * 0.64, 0); g.add(armL);
  const armR = box(0.09, height * 0.42, 0.09, m); armR.position.set(0.28, height * 0.64, 0); g.add(armR);
  g.userData.mats = [m];
  return g;
}

export function strangerMesh() {
  const g = figureMesh(1.85, 0x111114);
  const lampG = new THREE.Group();
  const cage = cyl(0.07, 0.09, 0.18, 6, flat(0x2c2a26));
  lampG.add(cage);
  const core = glowSprite(0.5, 0xffd9a0, 0.8);
  lampG.add(core);
  const li = new THREE.PointLight(0xffb868, 4, 7, 1.8);
  lampG.add(li);
  lampG.position.set(0.36, 1.0, 0.1);
  g.add(lampG);
  g.userData.lamp = li;
  return g;
}

// ---------------------------------------------------------------- the Engine

export function engineHeart() {
  const g = new THREE.Group();
  const dark = matFor('metalWall', { color: 0x8a8a90, emissive: 0x200705, emissiveIntensity: 1 });
  const rustM = matFor('rust');
  const core = cyl(3.2, 4.0, 15.5, 14, dark); core.position.y = 7.75; g.add(core);
  const collar = cyl(4.6, 4.6, 1.2, 14, rustM); collar.position.y = 2.2; g.add(collar);
  // greeble ribs up the column
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const rib = box(0.5, 13, 0.5, rustM);
    rib.position.set(Math.cos(a) * 3.4, 8, Math.sin(a) * 3.4);
    rib.rotation.y = -a;
    g.add(rib);
  }
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5 + i * 1.4, 0.3, 6, 18), i === 1 ? rustM : dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4.5 + i * 3.6;
    g.add(ring); rings.push(ring);
  }
  const heartLi = new THREE.PointLight(0x9c2414, 70, 70, 1.3);
  heartLi.position.y = 6; g.add(heartLi);
  const gl = glowSprite(9, 0xa03020, 0.3); gl.position.y = 6;
  gl.material.fog = false;
  g.add(gl);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const pipe = cyl(0.22, 0.22, 9, 8, rustM);
    pipe.rotation.z = Math.PI / 2;
    pipe.rotation.y = a;
    pipe.position.set(Math.cos(a) * 8, 0.3, Math.sin(a) * 8);
    g.add(pipe);
  }
  g.userData = { rings, heartLi, glow: gl };
  return { group: g, r: 4.8, lights: [] };
}

// ---------------------------------------------------------------- hands

// a blocky gloved hand, wrist at origin, fingers reaching toward -z.
// `side` flips the thumb; `curl` 0 (open) .. 1 (fist).
export function gloveHand(side = 'right', curl = 1) {
  const g = new THREE.Group();
  const glove = flat(0x5b4e3f);
  const knuck = flat(0x6a5c49);
  const cuff = flat(0x3a332a);
  const s = side === 'left' ? -1 : 1;
  const cuffM = box(0.085, 0.075, 0.11, cuff); cuffM.position.set(0, 0, 0.075); g.add(cuffM);
  const palm = box(0.092, 0.05, 0.11, glove); palm.position.set(0, 0, -0.02); g.add(palm);
  for (let i = 0; i < 4; i++) {
    const knuckle = box(0.02, 0.028, 0.04, knuck);
    knuckle.position.set(-0.034 + i * 0.023, 0.004, -0.085);
    g.add(knuckle);
    const f = box(0.018, 0.026, 0.05, glove);
    const cz = -0.1 - Math.cos(curl) * 0.0;
    f.position.set(-0.034 + i * 0.023, -0.018 - curl * 0.018, -0.092);
    f.rotation.x = curl * 1.15;
    g.add(f);
  }
  const thumb = box(0.024, 0.026, 0.052, knuck);
  thumb.position.set(s * 0.052, -0.004, -0.05);
  thumb.rotation.z = -s * 0.7;
  thumb.rotation.x = curl * 0.45;
  g.add(thumb);
  return g;
}

// ---------------------------------------------------------------- viewmodels

function lanternModel() {
  const g = new THREE.Group();
  const iron = flat(0x2c2a26);
  const cage = cyl(0.045, 0.06, 0.13, 7, iron); g.add(cage);
  const top = cyl(0.02, 0.05, 0.04, 7, iron); top.position.y = 0.085; g.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 9), iron);
  ring.position.y = 0.125; g.add(ring);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const rib = box(0.008, 0.13, 0.008, iron);
    rib.position.set(Math.cos(a) * 0.052, 0, Math.sin(a) * 0.052);
    g.add(rib);
  }
  const core = glowSprite(0.13, 0xffd9a0, 0.55); g.add(core);
  g.userData.core = core;
  return g;
}

// LEFT hand: fist closed over the lantern's bail, lantern swinging beneath.
export function lanternViewmodel() {
  const g = new THREE.Group();
  const hand = gloveHand('left', 1);
  hand.rotation.set(-1.5, 0, 0); // knuckles up, fingers hooking down over the ring
  hand.position.set(0, 0.12, 0.02);
  g.add(hand);
  const lantern = lanternModel();
  lantern.position.set(0, 0.0, 0);
  g.add(lantern);
  g.userData.core = lantern.userData.core;
  return g;
}

// RIGHT hand: fist around the grip, blade swept up and across.
export function swordViewmodel() {
  const g = new THREE.Group();
  const sword = swordMesh(0.5);
  sword.position.set(0, -0.06, 0.02);
  g.add(sword);
  const hand = gloveHand('right', 1);
  hand.rotation.set(-1.15, 0.2, 0);
  hand.position.set(0, 0.04, 0.0);
  g.add(hand);
  g.rotation.set(-0.22, 0.3, -0.5);
  return g;
}

// RIGHT hand: gripping the crank-lantern body, beam out the front.
export function crankViewmodel() {
  const g = new THREE.Group();
  const dev = new THREE.Group();
  const body = box(0.08, 0.11, 0.14, matFor('rust'));
  dev.add(body);
  const lens = cyl(0.04, 0.05, 0.035, 10, flat(0xffe2b0, { emissive: 0xffd9a0, emissiveIntensity: 0.9 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.012, -0.085);
  dev.add(lens);
  const hood = cyl(0.055, 0.05, 0.03, 10, flat(0x2a251f));
  hood.rotation.x = Math.PI / 2; hood.position.set(0, 0.012, -0.07);
  dev.add(hood);
  const crank = new THREE.Group();
  const arm = box(0.016, 0.055, 0.016, flat(0x46403a)); arm.position.y = -0.028; crank.add(arm);
  const knob = box(0.024, 0.024, 0.024, flat(0x2a251f)); knob.position.y = -0.06; crank.add(knob);
  crank.position.set(0.06, 0, 0.03); crank.rotation.z = Math.PI / 2;
  dev.add(crank);
  g.add(dev);
  const hand = gloveHand('right', 1);
  hand.rotation.set(-0.2, 0, 0);
  hand.position.set(0.0, -0.085, 0.05);
  g.add(hand);
  g.userData.crank = crank;
  g.userData.lens = lens;
  return g;
}

// RIGHT hand: holding the verger's wave-drum, the dish spinning when awake.
export function radarViewmodel() {
  const g = new THREE.Group();
  const dev = new THREE.Group();
  const brass = matFor('rust', { color: 0xb89a5c });
  const drum = cyl(0.06, 0.065, 0.1, 12, brass);
  drum.rotation.z = Math.PI / 2; drum.position.set(0, 0.02, -0.04);
  dev.add(drum);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.01, 4, 12), flat(0x3a3026));
  rim.position.set(0.05, 0.02, -0.04); rim.rotation.y = Math.PI / 2;
  dev.add(rim);
  const spinner = new THREE.Group();
  const fin = box(0.012, 0.012, 0.11, flat(0xd8c890, { emissive: 0x6a5a30, emissiveIntensity: 0.6 }));
  fin.position.set(0, 0, 0); spinner.add(fin);
  spinner.position.set(0, 0.085, -0.04);
  dev.add(spinner);
  g.add(dev);
  const hand = gloveHand('right', 1);
  hand.rotation.set(-0.35, 0, 0);
  hand.position.set(0.0, -0.06, 0.05);
  g.add(hand);
  g.userData.spinner = spinner;
  return g;
}

// RIGHT hand: empty, hanging relaxed.
export function emptyHandViewmodel() {
  const g = new THREE.Group();
  const hand = gloveHand('right', 0.5);
  hand.rotation.set(-0.5, 0, 0);
  g.add(hand);
  return g;
}

export function shadowBlobMesh() {
  const mat = new THREE.MeshBasicMaterial({
    map: getTex('shadowBlob'), transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
