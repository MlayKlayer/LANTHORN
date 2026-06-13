// LANTHORN — the lift only goes down. (revision 2)

import * as THREE from 'three';
import { RNG } from './rng.js';
import { generate, CELL, FOREST_FLOOR } from './dungeon.js';
import { buildFloor } from './builder.js';
import { Player } from './player.js';
import { Presence } from './presence.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { tickTextures } from './textures.js';
import { itemDef, FLOOR_NAMES, ROMAN, FINAL_FLOOR } from './items.js';
import { Settings, SETTING_DEFS } from './settings.js';
import { pickLine, LINES, lineCount } from './lines.js';

const SAVE_KEY = 'lanthorn.save.v1';

// ---------------------------------------------------------------- renderer

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(71, 16 / 9, 0.08, 90);
scene.add(camera);

const ambient = new THREE.AmbientLight(0x3c4250, 0.5);
scene.add(ambient);
let ambientBase = 0.5;

Settings.load();

function resize() {
  const RES_H = Settings.get('resolution') || 240;
  const aspect = window.innerWidth / window.innerHeight;
  const w = Math.max(2, Math.round(RES_H * aspect / 2) * 2);
  renderer.setSize(w, RES_H, false);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// film grain overlay
const grainCanvas = document.getElementById('grain');
const grainCtx = grainCanvas.getContext('2d');
grainCanvas.width = 160; grainCanvas.height = 90;
let grainT = 0;
function updateGrain(t) {
  if (t - grainT < 0.08) return;
  grainT = t;
  const img = grainCtx.createImageData(160, 90);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  grainCtx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- game state

const player = new Player(camera, scene);

let mode = 'title';        // title | play | inventory | settings | dead | descend | end | pause
let settingsReturn = 'title';
let runSeed = '';
let floorNum = 1;
let flags = {};
let inventory = [];
let dng = null, FS = null, presence = null;
let invSel = 0;
let noPointerLock = false;
let endT = -1;
let engineLineT = 8;

UI.init();
UI.applyFilter();
UI.fade(true, true);
setTimeout(() => UI.fade(false), 300);

// settings → live systems
Settings.onChange((id) => {
  if (id === 'volume') Sound.setVolume(Settings.get('volume'));
  else if (id === 'filter' || id === 'grain') UI.applyFilter();
  else if (id === 'resolution') resize();
  else if (id === 'brightness') ambient.intensity = ambientBase * Settings.get('brightness');
});
Sound.setVolume(Settings.get('volume'));

// ---------------------------------------------------------------- inventory

function invFind(id) { return inventory.find(s => s.id === id); }
function invAdd(id, qty = 1) {
  const s = invFind(id);
  if (s) s.qty += qty;
  else inventory.push({ id, qty });
}
function invRemove(id, qty = 1) {
  const s = invFind(id);
  if (!s) return false;
  s.qty -= qty;
  if (s.qty <= 0) inventory.splice(inventory.indexOf(s), 1);
  return true;
}

// ---------------------------------------------------------------- save

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      seed: runSeed, floor: floorNum, flags, inv: inventory,
      hp: player.hp, oil: player.oil, sword: player.swordEquipped,
      charge: player.beamCharge,
    }));
  } catch (e) {}
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

// ---------------------------------------------------------------- game facade

const game = {
  sound: Sound,
  get flags() { return flags; },
  over: false,
  give(id, qty = 1) {
    invAdd(id, qty);
    const def = itemDef(id);
    UI.banner(def.name, def.type === 'note' ? 'A SCRAP RECOVERED' : 'ITEM ACQUIRED');
    Sound.pickup();
    if (id === 'radar') {
      flags.gotRadar = true;
      setTimeout(() => UI.msg('R — wake the drum.'), 1200);
    } else if (id === 'cranklamp') {
      flags.gotCrank = true;
      player.hasBeam = true;
      player.beamCharge = 80;
      setTimeout(() => UI.msg('F — shoulder the beam. V — crank the spring.'), 1200);
    } else if (Math.random() < 0.25) {
      setTimeout(() => UI.subtitle(pickLine('pickupFlavor'), 4.5), 900);
    }
    saveGame();
  },
  hasItem(id) { return !!invFind(id); },
  takeItem(id) { return invRemove(id, 1); },
  keyNeeded() { return FS ? FS.keyNeeded : false; },
  msg(text, dur) { UI.msg(text, dur); },
  subtitle(text, dur) { UI.subtitle(text, dur); },
  dialog(name, lines, onDone) { UI.showDialog(name, lines, onDone); },
  saveFlags() { saveGame(); },
  rest() {
    Sound.rest();
    UI.fade(true);
    setTimeout(() => {
      player.hp = player.maxHp;
      player.oil = 100;
      if (presence) presence.notifyRest();
      UI.fade(false);
      UI.msg(pickLine('rest'), 5);
      saveGame();
    }, 1500);
  },
  unlockLift() {
    if (mode !== 'play') return;
    mode = 'descend';
    radarOn = false; UI.showRadar(false);
    setTimeout(() => {
      UI.fade(true);
      Sound.liftLoop(3.4);
      UI.subtitle(pickLine('descend'), 5);
    }, 900);
    setTimeout(() => {
      floorNum += 1;
      saveGame();
      loadFloor(floorNum);
    }, 4600);
  },
};

// ---------------------------------------------------------------- floors

function floorName(n) {
  if (n === 1) return 'THE SUNKEN NAVE';
  if (n === FOREST_FLOOR) return 'THE BLACK PINES';
  if (n >= FINAL_FLOOR) return 'THE ENGINE';
  return new RNG(runSeed + ':name:' + n).pick(FLOOR_NAMES);
}

function loadFloor(n) {
  if (FS) { FS.dispose(); FS = null; }
  presence = null;
  UI.closeDialog();
  UI.prompt(null);
  UI.caughtOverlay(0);

  dng = generate(runSeed, n);
  const rng = new RNG(runSeed + ':build:' + n);
  FS = buildFloor(scene, dng, rng, n, flags);

  const isEngine = !!FS.engine;
  const isForest = !!FS.outdoor;
  let fogCol, far;
  if (isEngine) { fogCol = new THREE.Color(0x0a0507); far = 52; ambientBase = 0.34; }
  else if (isForest) { fogCol = new THREE.Color(0x1c2022); far = 15; ambientBase = 0.62; }
  else { fogCol = new THREE.Color(0x07070b); far = Math.max(15, 28 - n * 1.9); ambientBase = Math.max(0.18, 0.5 - n * 0.045); }
  scene.fog = new THREE.Fog(fogCol, 2, far);
  scene.background = fogCol;
  ambient.intensity = ambientBase * (Settings.get('brightness') || 1);
  ambient.color.setHex(isEngine ? 0x553636 : (isForest ? 0x46505a : 0x3c4250));

  const b = FS.beacon;
  player.spawnAt(b.x + 1.4, b.z + 1.4, Math.PI * 0.75);
  player.hp = Math.max(player.hp, 60);

  presence = new Presence({ scene, dng, FS, player, sound: Sound, ui: UI, floorNum: n, flags });

  Sound.startAmbience(n, { forest: isForest });
  UI.fade(false);
  UI.titlecard(ROMAN[Math.min(n, FINAL_FLOOR) - 1], floorName(n));
  if (n === 1) {
    setTimeout(() => UI.subtitle('The lift that brought you down has already gone back up. It will not do that again.', 7), 5500);
  }
  if (isForest) {
    setTimeout(() => UI.subtitle(pickLine('forestEnter'), 6.5), 6000);
  }
  endT = -1;
  engineLineT = 8;
  mode = 'play';
}

function beginRun(fromSave) {
  Sound.init(); Sound.resume();
  const sv = fromSave ? loadSave() : null;
  if (sv) {
    runSeed = sv.seed; floorNum = sv.floor; flags = sv.flags || {};
    inventory = sv.inv || [{ id: 'lantern', qty: 1 }];
    player.hp = sv.hp ?? 100; player.oil = sv.oil ?? 100;
    player.swordEquipped = !!sv.sword;
    player.swordVM.visible = player.swordEquipped;
    player.hasBeam = !!invFind('cranklamp');
    player.beamCharge = sv.charge ?? 80;
  } else {
    runSeed = 'descent-' + Math.floor(Math.random() * 1e9).toString(36);
    floorNum = 1; flags = {};
    inventory = [{ id: 'lantern', qty: 1 }];
    player.hp = 100; player.oil = 100;
    player.swordEquipped = false;
    player.swordVM.visible = false;
    player.hasBeam = false;
    player.beamOn = false;
    saveGame();
  }
  UI.showTitle(false);
  UI.showHud(true);
  UI.fade(true, true);
  lockPointer();
  setTimeout(() => loadFloor(floorNum), 400);
}

// ---------------------------------------------------------------- pointer lock

function lockPointer() {
  if (noPointerLock) return;
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { canvas.requestPointerLock(); });
  } catch (e) {
    try { canvas.requestPointerLock(); } catch (e2) { noPointerLock = true; }
  }
}
const isLocked = () => document.pointerLockElement === canvas;

document.addEventListener('pointerlockchange', () => {
  if (!isLocked() && mode === 'play') {
    mode = 'pause';
    UI.showPause(true);
  }
});
document.addEventListener('pointerlockerror', () => { noPointerLock = true; });

document.getElementById('pause').addEventListener('click', () => {
  UI.showPause(false);
  mode = 'play';
  lockPointer();
  Sound.resume();
});

let dragLook = false;
document.addEventListener('mousemove', (e) => {
  if (mode !== 'play' && mode !== 'end') return;
  if (isLocked()) player.applyLook(e.movementX, e.movementY);
  else if (dragLook) player.applyLook(e.movementX * 1.4, e.movementY * 1.4);
});

canvas.addEventListener('mousedown', () => {
  if (mode === 'play') {
    if (!isLocked()) {
      if (noPointerLock) dragLook = true;
      else lockPointer();
    } else if (player.swordEquipped && player.swing <= 0) {
      player.swing = 1;
      const f = player.forward();
      const tx = player.pos.x + f.x * 1.2, tz = player.pos.z + f.z * 1.2;
      if (dng && dng.isSolid(Math.floor(tx / CELL), Math.floor(tz / CELL))) {
        setTimeout(() => {
          Sound.clangAt(tx, tz, 0.2);
          if (Math.random() < 0.25) UI.subtitle(pickLine('swordWall'), 4);
        }, 160);
      } else {
        Sound.step('sci', 0.1);
      }
    }
  }
});
window.addEventListener('mouseup', () => { dragLook = false; });

// ---------------------------------------------------------------- title menu

const btnBegin = document.getElementById('btn-begin');
const btnContinue = document.getElementById('btn-continue');
const btnSettings = document.getElementById('btn-settings');
if (loadSave()) btnContinue.classList.remove('hidden');
btnBegin.addEventListener('click', () => beginRun(false));
btnContinue.addEventListener('click', () => beginRun(true));
btnSettings.addEventListener('click', () => openSettings('title'));

function openSettings(from) {
  settingsReturn = from;
  mode = 'settings';
  UI.showPause(false);
  UI.showSettings(true);
}
function closeSettings() {
  UI.showSettings(false);
  if (settingsReturn === 'title') { mode = 'title'; }
  else if (settingsReturn === 'pause') { mode = 'pause'; UI.showPause(true); }
  else {
    mode = 'play';
    if (!isLocked()) { /* click will re-lock */ }
  }
}

// ---------------------------------------------------------------- interaction

let candidate = null;

function scanInteractables() {
  candidate = null;
  if (!FS) return;
  let best = 1e9;
  for (const it of FS.interactables) {
    const dx = it.x - player.pos.x, dz = it.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > it.r) continue;
    if (d > 0.9) {
      const f = player.forward();
      const dot = (dx * f.x + dz * f.z) / (d || 1);
      if (dot < 0.45) continue;
    }
    if (d < best) { best = d; candidate = it; }
  }
  UI.prompt(mode === 'play' && !UI.dialogOpen && candidate ? candidate.label : null);
}

function doInteract() {
  if (UI.dialogOpen) { UI.advanceDialog(); return; }
  if (!candidate) return;
  const it = candidate;
  const result = it.action(game);
  if (result === 'remove' || result === 'done') {
    const idx = FS.interactables.indexOf(it);
    if (idx >= 0) FS.interactables.splice(idx, 1);
    if (result === 'remove' && it.node) {
      FS.root.remove(it.node);
      const pi = FS.pickups.findIndex(p => p.node === it.node);
      if (pi >= 0) FS.pickups.splice(pi, 1);
    }
    candidate = null;
    UI.prompt(null);
  }
}

// ---------------------------------------------------------------- radar

const radarCanvas = document.getElementById('radar');
const radarCtx = radarCanvas.getContext('2d');
let radarOn = false;
let sweepA = 0;
let radarPoints = [];
let radarEntityHeard = false;

function toggleRadar() {
  if (!invFind('radar')) return;
  radarOn = !radarOn;
  UI.showRadar(radarOn);
  if (radarOn) {
    Sound.radarPing();
    if (!flags.radarUsed) {
      flags.radarUsed = true;
      UI.subtitle(pickLine('radar'), 5);
      saveGame();
    }
  }
}

function bearingOf(dx, dz) { return Math.atan2(dx, dz); }
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function updateRadar(dt, t) {
  if (!radarOn || !FS) return;
  const RANGE = 20;
  const px = player.pos.x, pz = player.pos.z;
  const prevA = sweepA;
  sweepA += dt * (Math.PI * 2 / 1.8);
  const sweptFrom = prevA, sweptTo = sweepA;

  // walls: march rays across the swept slice
  for (let a = sweptFrom; a < sweptTo; a += 0.022) {
    const dx = Math.sin(a), dz = Math.cos(a);
    for (let d = 0.6; d < RANGE; d += 0.32) {
      const i = Math.floor((px + dx * d) / CELL), j = Math.floor((pz + dz * d) / CELL);
      if (dng.isSolid(i, j)) {
        radarPoints.push({ x: px + dx * d, z: pz + dz * d, life: 1, kind: 'wall' });
        break;
      }
    }
  }

  // props and trees: dot when the sweep passes their bearing
  for (const c of FS.colliders) {
    const dx = c.x - px, dz = c.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > RANGE || d < 0.7) continue;
    const b = bearingOf(dx, dz);
    if (crossed(b, sweptFrom, sweptTo)) {
      radarPoints.push({ x: c.x, z: c.z, life: 0.9, kind: 'prop' });
    }
  }

  // things that move and should not be there
  const entities = [];
  if (presence) {
    if (presence.stalker) entities.push({ x: presence.stalker.x, z: presence.stalker.z });
    if (presence.stranger) entities.push({ x: presence.stranger.fig.position.x, z: presence.stranger.fig.position.z });
    if (presence.watcher) entities.push({ x: presence.watcher.fig.position.x, z: presence.watcher.fig.position.z });
  }
  for (const e of entities) {
    const dx = e.x - px, dz = e.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > RANGE) continue;
    const b = bearingOf(dx, dz);
    if (crossed(b, sweptFrom, sweptTo)) {
      radarPoints.push({ x: e.x, z: e.z, life: 1.4, kind: 'entity' });
      Sound.radarBlip();
      if (!radarEntityHeard) {
        radarEntityHeard = true;
        UI.subtitle('A dot on the glass that is not a wall. It moves the way you move.', 5.5);
      }
    }
  }

  if (sweepA > Math.PI * 2) {
    sweepA -= Math.PI * 2;
    Sound.radarPing();
  }

  for (const p of radarPoints) p.life -= dt / 2.0;
  radarPoints = radarPoints.filter(p => p.life > 0);
  if (radarPoints.length > 2600) radarPoints.splice(0, radarPoints.length - 2600);

  drawRadar(px, pz);
}

function crossed(bearing, a0, a1) {
  // did the sweep pass this bearing (accounting for wrap)?
  let b = bearing;
  while (b < a0 - Math.PI) b += Math.PI * 2;
  while (b > a0 + Math.PI) b -= Math.PI * 2;
  return b >= a0 && b < a1;
}

function drawRadar(px, pz) {
  const c = radarCtx, W = 180, R = 86, SCALE = R / 20;
  c.clearRect(0, 0, W, W);
  c.save();
  c.translate(90, 90);
  // bezel + glass
  c.fillStyle = 'rgba(6,8,6,0.78)';
  c.beginPath(); c.arc(0, 0, R + 2, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(140,126,94,0.8)';
  c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, R + 2, 0, Math.PI * 2); c.stroke();
  // range rings
  c.strokeStyle = 'rgba(150,170,140,0.14)';
  c.lineWidth = 1;
  for (let r = 5; r <= 20; r += 5) {
    c.beginPath(); c.arc(0, 0, r * SCALE, 0, Math.PI * 2); c.stroke();
  }
  // rotate so the player's facing is up
  const yaw = player.yaw;
  const rot = (dx, dz) => ({
    x: dx * Math.cos(yaw) - dz * Math.sin(yaw),
    y: dx * Math.sin(yaw) + dz * Math.cos(yaw),
  });
  // points
  for (const p of radarPoints) {
    const s = rot(p.x - px, p.z - pz);
    const a = Math.max(0, Math.min(1, p.life));
    if (p.kind === 'entity') {
      c.fillStyle = `rgba(196,74,52,${a})`;
      c.fillRect(s.x * SCALE - 2, s.y * SCALE - 2, 4, 4);
    } else if (p.kind === 'prop') {
      c.fillStyle = `rgba(168,190,150,${a * 0.55})`;
      c.fillRect(s.x * SCALE - 1, s.y * SCALE - 1, 2, 2);
    } else {
      c.fillStyle = `rgba(178,200,160,${a * 0.8})`;
      c.fillRect(s.x * SCALE - 1, s.y * SCALE - 1, 2, 2);
    }
  }
  // sweep arm
  const sw = rot(Math.sin(sweepA), Math.cos(sweepA));
  const grad = c.createLinearGradient(0, 0, sw.x * R, sw.y * R);
  grad.addColorStop(0, 'rgba(190,210,170,0.05)');
  grad.addColorStop(1, 'rgba(190,210,170,0.6)');
  c.strokeStyle = grad;
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(sw.x * R, sw.y * R); c.stroke();
  // you, the moving warmth
  c.fillStyle = 'rgba(216,206,180,0.95)';
  c.fillRect(-1.5, -1.5, 3, 3);
  c.restore();
}

// ---------------------------------------------------------------- the shadow knows

let stareT = 0;
let stareArmed = true;
let shadowAgainCD = 0;

function updateShadowStare(dt) {
  shadowAgainCD = Math.max(0, shadowAgainCD - dt);
  if (player.pitch < -1.05 && mode === 'play') {
    stareT += dt;
    if (stareT > 5 && stareArmed) {
      stareArmed = false;
      if (!flags.sphereKnown) {
        flags.sphereKnown = true;
        saveGame();
        const seq = LINES.shadowSequence;
        UI.subtitle(seq[0], 5);
        setTimeout(() => { if (mode === 'play') UI.subtitle(seq[1], 6); }, 5400);
        setTimeout(() => { if (mode === 'play') UI.subtitle(seq[2], 9); }, 11800);
        Sound.heart(0.6);
      } else if (shadowAgainCD <= 0) {
        shadowAgainCD = 140;
        UI.subtitle(pickLine('shadowAgain'), 6);
      }
    }
  } else if (player.pitch > -0.9) {
    stareT = 0;
    stareArmed = true;
  }
}

// ---------------------------------------------------------------- item use

function useSelectedItem() {
  const slot = inventory[invSel];
  if (!slot) return;
  const def = itemDef(slot.id);
  if (slot.id === 'oil') {
    if (player.oil > 92) { UI.msg('The lantern is full. It burns a little proudly.'); return; }
    player.oil = Math.min(100, player.oil + 55);
    invRemove('oil'); Sound.useItem();
    UI.msg(pickLine('useOil'), 5);
  } else if (slot.id === 'ampoule') {
    if (player.hp > player.maxHp - 5) { UI.msg('Your body holds no room for more light.'); return; }
    player.hp = Math.min(player.maxHp, player.hp + 60);
    invRemove('ampoule'); Sound.useItem();
    UI.msg(pickLine('useAmpoule'), 5);
  } else if (slot.id === 'psalm') {
    invRemove('psalm'); Sound.psalm();
    if (presence) presence.calm();
    UI.subtitle(pickLine('usePsalm'), 6);
  } else if (slot.id === 'sword') {
    player.swordEquipped = !player.swordEquipped;
    player.swordVM.visible = player.swordEquipped;
    Sound.swordEquip();
    UI.msg(player.swordEquipped ? 'The weight is absurd. The comfort is not.' : 'You sheathe the nameless blade.');
  } else if (slot.id === 'cranklamp') {
    closeInventory();
    toggleBeam();
    return;
  } else if (slot.id === 'radar') {
    closeInventory();
    toggleRadar();
    return;
  } else if (def.type === 'note') {
    closeInventory();
    Sound.paper();
    UI.showDialog(def.name.toUpperCase(), [def.text || def.desc]);
    return;
  } else {
    UI.msg('It does not want to be used. It wants to be carried.');
    return;
  }
  if (invSel >= inventory.length) invSel = Math.max(0, inventory.length - 1);
  UI.renderInventory(inventory, invSel, player.swordEquipped, player.beamOn);
}

function toggleBeam() {
  if (!player.hasBeam) return;
  if (!player.beamOn && player.beamCharge <= 1) {
    Sound.thunk();
    UI.msg('The spring is slack. Crank it. (V)');
    return;
  }
  player.beamOn = !player.beamOn;
  Sound.useItem();
}

function openInventory() {
  mode = 'inventory';
  invSel = Math.min(invSel, Math.max(0, inventory.length - 1));
  UI.renderInventory(inventory, invSel, player.swordEquipped, player.beamOn);
  UI.showInventory(true);
  UI.prompt(null);
}
function closeInventory() {
  UI.showInventory(false);
  if (mode === 'inventory') mode = 'play';
}

// ---------------------------------------------------------------- keys

let crankLineCD = 0;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (e.code === 'Space') e.preventDefault();

  if (mode === 'play') {
    if (e.code === 'KeyE' || e.code === 'Enter') doInteract();
    else if ((e.code === 'Tab' || e.code === 'KeyI') && !UI.dialogOpen) openInventory();
    else if (e.code === 'KeyO' && !UI.dialogOpen) openSettings('play');
    else if (e.code === 'Space' && !e.repeat && !UI.dialogOpen) {
      if (player.jump()) {
        Sound.jump();
        if (Math.random() < 0.06) UI.subtitle(pickLine('jump'), 3.5);
      }
    }
    else if (e.code === 'KeyC' && !e.repeat && !UI.dialogOpen) {
      player.toggleCrouch();
      Sound.step('stone', 0.06);
      if (player.crouched && Math.random() < 0.1) UI.subtitle(pickLine('crouch'), 4);
    }
    else if (e.code === 'KeyF' && !e.repeat && !UI.dialogOpen) toggleBeam();
    else if (e.code === 'KeyR' && !e.repeat && !UI.dialogOpen) toggleRadar();
    else if (e.code === 'KeyV' && !e.repeat && !UI.dialogOpen) {
      if (player.hasBeam) {
        const gained = player.crank();
        if (gained > 0) {
          Sound.ratchet();
          if (crankLineCD <= 0 && Math.random() < 0.12) {
            crankLineCD = 60;
            UI.subtitle(pickLine('crank'), 4);
          }
        }
      }
    }
  } else if (mode === 'inventory') {
    const cols = 5;
    if (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'Escape') closeInventory();
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') invSel = Math.min(Math.max(0, inventory.length - 1), invSel + 1);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') invSel = Math.max(0, invSel - 1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') invSel = Math.min(Math.max(0, inventory.length - 1), invSel + cols);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') invSel = Math.max(0, invSel - cols);
    else if (e.code === 'KeyE' || e.code === 'Enter') { useSelectedItem(); return; }
    if (mode === 'inventory') UI.renderInventory(inventory, invSel, player.swordEquipped, player.beamOn);
  } else if (mode === 'settings') {
    if (e.code === 'Escape' || e.code === 'KeyO' || e.code === 'Tab') closeSettings();
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { UI.settingsSel = Math.min(SETTING_DEFS.length - 1, UI.settingsSel + 1); UI.renderSettings(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { UI.settingsSel = Math.max(0, UI.settingsSel - 1); UI.renderSettings(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Enter' || e.code === 'KeyE') {
      Settings.cycle(SETTING_DEFS[UI.settingsSel].id, 1); UI.renderSettings();
    }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      Settings.cycle(SETTING_DEFS[UI.settingsSel].id, -1); UI.renderSettings();
    }
  } else if (mode === 'pause') {
    if (e.code === 'KeyO') openSettings('pause');
  }
});

// ---------------------------------------------------------------- death & ending

function die() {
  mode = 'dead';
  game.over = true;
  radarOn = false; UI.showRadar(false);
  UI.bigtext('YOU ARE COUNTED', pickLine('death'));
  Sound.heart(1);
  setTimeout(() => UI.fade(true), 2600);
  setTimeout(() => {
    UI.hideBigtext();
    player.hp = 70;
    player.oil = Math.max(player.oil, 40);
    const b = FS.beacon;
    player.spawnAt(b.x + 1.4, b.z + 1.4, Math.PI * 0.75);
    if (presence) presence.notifyRest();
    UI.caughtOverlay(0);
    game.over = false;
    UI.fade(false);
    mode = 'play';
  }, 4600);
}

const END_LINES = [
  [0, 'The Engine is vast and mostly silent. One cylinder still turns, slow as a sleeping pulse.'],
  [6, 'It counts you. You feel the number arrive, somewhere behind the sternum.'],
  [12, 'It is not a large number. It is exactly one.'],
];

function updateEnding(dt) {
  if (endT < 0) return;
  const prev = endT;
  endT += dt;
  for (const [at, line] of END_LINES) {
    if (prev <= at && endT > at) UI.subtitle(line, 5.5);
  }
  if (prev < 17 && endT >= 17) {
    Sound.endTone();
    UI.bigtext('YOU ARE REMEMBERED', 'the lift behind you begins, very quietly, to rise', true);
  }
  if (prev < 24 && endT >= 24) UI.fade(true);
  if (prev < 27 && endT >= 27) {
    clearSave();
    UI.hideBigtext();
    UI.showHud(false);
    Sound.stopAmbience();
    if (FS) { FS.dispose(); FS = null; }
    presence = null;
    document.exitPointerLock?.();
    btnContinue.classList.add('hidden');
    btnBegin.textContent = 'BEGIN AGAIN';
    UI.showTitle(true);
    UI.fade(false);
    mode = 'title';
    endT = -1;
  }
}

// ---------------------------------------------------------------- main loop

let lastT = performance.now();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const t = now / 1000;

  tickTextures(t);
  updateGrain(t);
  UI.tickDialog(dt);
  crankLineCD = Math.max(0, crankLineCD - dt);

  if (FS) FS.tick(t, dt);

  if (mode === 'play' || mode === 'inventory' || mode === 'descend' || mode === 'end' || mode === 'dead') {
    const inputEnabled = mode === 'play' && !UI.dialogOpen;
    player.update(dt, dng, FS ? FS.colliders : [], inputEnabled);
    Sound.updateListener(player.pos, player.yaw);
    if (radarOn) player.noise = Math.max(player.noise, 0.4);

    if (mode === 'play') {
      player.oil = Math.max(0, player.oil - dt * (100 / 520));

      if (presence && !UI.dialogOpen) {
        presence.update(dt, t);
        if (FS.engine) {
          const d = Math.hypot(player.pos.x - FS.engine.x, player.pos.z - FS.engine.z);
          presence.dread = Math.max(presence.dread, Math.min(0.95, 1 - d / 50));
          if (d < 30) {
            engineLineT -= dt;
            if (engineLineT <= 0) {
              engineLineT = 16 + Math.random() * 10;
              UI.subtitle(pickLine('engineNear'), 5.5);
            }
          }
          if (d < 6.5 && endT < 0) { mode = 'end'; endT = 0; }
        }
      }
      for (const npc of (FS ? FS.npcs : [])) npc.update(dt, t, player, game);

      scanInteractables();
      updateRadar(dt, t);
      updateShadowStare(dt);

      const dread = presence ? presence.dread : 0;
      const caught = presence ? presence.caught : false;
      UI.caughtOverlay(caught ? 0.92 : Math.max(0, (dread - 0.82) * 2.5));
      Sound.tick(dt, { dread, caught });

      if (player.hp <= 0) die();
    } else if (mode === 'end') {
      updateEnding(dt);
      Sound.tick(dt, { dread: 0.3, caught: false });
    }

    UI.bars(player.hp, player.maxHp, player.stamina, player.oil,
      player.hasBeam ? player.beamCharge : null);
  }

  renderer.render(scene, camera);
}

player.onStep = (running, crouched) => {
  if (FS && mode === 'play') {
    const kind = FS.matAt(player.pos.x, player.pos.z);
    Sound.step(kind, crouched ? 0.06 : (running ? 0.24 : 0.15));
  }
};
player.onJump = () => {};
player.onLand = (hard) => {
  if (FS && mode === 'play') {
    Sound.land(FS.matAt(player.pos.x, player.pos.z), hard);
  }
};

// console debug handle
window.__lanthorn = {
  player,
  get FS() { return FS; },
  get dng() { return dng; },
  get presence() { return presence; },
  get mode() { return mode; },
  game, loadFloor,
  lineCount,
  Settings,
};

frame();
