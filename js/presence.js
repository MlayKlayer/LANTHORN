// The presence director, revision 2. Nothing here ever jumps at you.
// It walks at a walking pace, it hears how loudly you live,
// and it has considerably more to say.

import * as THREE from 'three';
import { CELL } from './dungeon.js';
import { figureMesh, strangerMesh, glowSprite, flat } from './props.js';
import { pickLine } from './lines.js';

function relAngle(player, x, z) {
  const f = player.forward();
  const dx = x - player.pos.x, dz = z - player.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const dot = (dx * f.x + dz * f.z) / len;
  const side = (dx * -f.z + dz * f.x) / len;
  return Math.atan2(side, dot);
}

export class Presence {
  constructor({ scene, dng, FS, player, sound, ui, floorNum, flags }) {
    this.scene = scene; this.dng = dng; this.FS = FS;
    this.player = player; this.sound = sound; this.ui = ui;
    this.floor = floorNum; this.flags = flags;

    this.dread = Math.min(0.5, 0.1 + floorNum * 0.04);
    this.caught = false;
    this.caughtLineT = 0;

    this.eventTimer = this.nextEventDelay();
    this.narrTimer = 35 + Math.random() * 45;
    this.walkTime = 0;
    this.contWalk = 0;
    this.idleTime = 0;
    this.wasMoving = false;
    this.dimT = 0;
    this.flickT = 0;
    this.oilWarnT = 0;
    this.hpWarnT = 0;

    // sirens (forest floors)
    this.sirenTimer = FS.sirens && FS.sirens.length ? 18 + Math.random() * 30 : -1;
    this.sirenFirst = true;
    this.towerLineT = 30;

    // cache world positions of lit lights (for "safety" checks)
    this.lightSpots = [];
    const v = new THREE.Vector3();
    for (const L of FS.lights) {
      if (L.style === 'blink') continue; // tower beacons are not shelter
      L.light.getWorldPosition(v);
      this.lightSpots.push({ x: v.x, z: v.z });
    }

    this.watcher = null;
    this.stranger = null;
    this.strangerDone = false;
    this.stalker = null;
    this.stalkCooldown = 20;
  }

  themeHere() {
    if (this.FS.outdoor) return 'forest';
    const i = Math.floor(this.player.pos.x / CELL), j = Math.floor(this.player.pos.z / CELL);
    const rid = this.dng.roomAt(i, j);
    if (rid >= 0) {
      const t = this.dng.rooms[rid].theme;
      if (t === 'gothic' || t === 'crypt' || t === 'industrial' || t === 'scifi') return t;
    }
    return 'generic';
  }

  nextEventDelay() {
    const pace = 1 + this.floor * 0.18 + this.dread * 1.4;
    return (16 + Math.random() * 26) / pace;
  }

  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 0.4);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (this.dng.isSolid(Math.floor(x / CELL), Math.floor(z / CELL))) return false;
    }
    return true;
  }

  findSpot(minD, maxD, viewBias, needLOS) {
    const p = this.player.pos;
    for (let tries = 0; tries < 40; tries++) {
      const d = minD + Math.random() * (maxD - minD);
      let x, z;
      if (viewBias) {
        const ang = this.player.yaw + (Math.random() - 0.5) * 0.9;
        x = p.x - Math.sin(ang) * d;
        z = p.z - Math.cos(ang) * d;
      } else {
        const ang = Math.random() * Math.PI * 2;
        x = p.x + Math.cos(ang) * d;
        z = p.z + Math.sin(ang) * d;
      }
      const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
      if (this.dng.isSolid(i, j)) continue;
      if (needLOS && !this.los(p.x, p.z, x, z)) continue;
      return { x: (i + 0.5) * CELL, z: (j + 0.5) * CELL };
    }
    return null;
  }

  nearSafety(dist = 4) {
    const p = this.player.pos;
    const b = this.FS.beacon;
    if (b && Math.hypot(p.x - b.x, p.z - b.z) < dist + 2) return true;
    for (const s of this.lightSpots) {
      if (Math.hypot(p.x - s.x, p.z - s.z) < dist) return true;
    }
    return false;
  }

  calm() {
    this.dread = 0;
    if (this.stalker) this.endStalk(true);
  }

  notifyRest() {
    this.dread = 0;
    if (this.stalker) this.endStalk(true);
  }

  // ------------------------------------------------------------ events

  fireAmbientEvent() {
    const p = this.player.pos;
    const theme = this.themeHere();
    const roll = Math.random();
    const rndPt = (minD, maxD) => {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      return { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d };
    };
    if (roll < 0.26) {
      const q = rndPt(14, 30);
      this.sound.clangAt(q.x, q.z, 0.4);
    } else if (roll < 0.42) {
      const q = rndPt(5, 11);
      this.sound.whisperAt(q.x, q.z);
      this.dread = Math.min(1, this.dread + 0.04);
    } else if (roll < 0.52 && (theme === 'industrial' || theme === 'scifi')) {
      const q = rndPt(8, 20);
      this.sound.groanAt(q.x, q.z);
    } else if (roll < 0.55 && theme === 'forest') {
      const q = rndPt(10, 24);
      this.sound.crowAt(q.x, q.z);
    } else if (roll < 0.62 && this.floor >= 2 && !this.FS.outdoor) {
      const q = rndPt(24, 40);
      this.sound.bellAt(q.x, q.z);
    } else if (roll < 0.78) {
      this.flickT = 1.6 + Math.random() * 1.5;
    } else if (roll < 0.88) {
      this.dimT = 2.2 + Math.random() * 2;
      this.dread = Math.min(1, this.dread + 0.05);
    } else if (this.floor >= 2 && !this.watcher) {
      this.spawnWatcher();
    }
  }

  spawnWatcher() {
    const spot = this.findSpot(11, 16, true, true);
    if (!spot) return;
    const fig = figureMesh(2.55, 0x0a0a0e);
    fig.position.set(spot.x, 0, spot.z);
    fig.lookAt(this.player.pos.x, 0, this.player.pos.z);
    for (const m of fig.userData.mats) {
      m.opacity = 0;
      m.emissive = new THREE.Color(0x16161e);
      m.fog = false;
    }
    this.FS.root.add(fig);
    this.watcher = { fig, age: 0, hold: 2.5 + Math.random() * 3, fading: false };
    this.sound.swellAt(spot.x, spot.z);
    this.dread = Math.min(1, this.dread + 0.12);
  }

  updateWatcher(dt) {
    const w = this.watcher;
    if (!w) return;
    w.age += dt;
    const distToPlayer = w.fig.position.distanceTo(this.player.pos);
    if (distToPlayer < 7.5) w.fading = true;
    if (w.age > w.hold + 1.5) w.fading = true;
    const target = w.fading ? 0 : 0.85;
    const speed = w.fading ? (distToPlayer < 7.5 ? 1.2 : 0.35) : 0.55;
    let done = w.fading;
    for (const m of w.fig.userData.mats) {
      m.opacity += (target - m.opacity) * Math.min(1, dt * speed * 3);
      if (m.opacity > 0.02) done = false;
    }
    if (w.fading && done) {
      this.FS.root.remove(w.fig);
      this.watcher = null;
      if (Math.random() < 0.6) this.ui.subtitle(pickLine('watcherGone'), 4.5);
    }
  }

  maybeSpawnStranger() {
    if (this.stranger || this.strangerDone || this.floor < 2) return;
    const chance = this.FS.outdoor ? 0.0045 : 0.0022;
    if (Math.random() > chance) return;
    const spot = this.findSpot(13, 18, true, true);
    if (!spot) return;
    const fig = strangerMesh();
    fig.position.set(spot.x, 0, spot.z);
    fig.lookAt(this.player.pos.x, 0, this.player.pos.z);
    this.FS.root.add(fig);
    this.stranger = { fig, state: 'standing', seen: false, walkT: 0 };
  }

  updateStranger(dt) {
    const s = this.stranger;
    if (!s) return;
    const p = this.player.pos;
    const dist = s.fig.position.distanceTo(p);

    if (!s.seen) {
      const a = Math.abs(relAngle(this.player, s.fig.position.x, s.fig.position.z));
      if (a < 0.35 && dist < 20) {
        s.seen = true;
        this.ui.subtitle(pickLine('strangerSeen'), 6);
        this.dread = Math.min(1, this.dread + 0.1);
      }
    }

    if (s.state === 'standing' && dist < 9) {
      s.state = 'leaving';
      s.fig.lookAt(2 * s.fig.position.x - p.x, 0, 2 * s.fig.position.z - p.z);
    }

    if (s.state === 'leaving') {
      s.walkT += dt;
      const away = new THREE.Vector3().subVectors(s.fig.position, p).setY(0).normalize();
      const nx = s.fig.position.x + away.x * 3.2 * dt;
      const nz = s.fig.position.z + away.z * 3.2 * dt;
      if (!this.dng.isSolid(Math.floor(nx / CELL), Math.floor(nz / CELL))) {
        s.fig.position.x = nx; s.fig.position.z = nz;
      }
      s.fig.position.y = Math.abs(Math.sin(s.walkT * 8)) * 0.04;
      if (s.walkT > 0.4 && Math.floor(s.walkT * 2.4) !== Math.floor((s.walkT - dt) * 2.4)) {
        this.sound.stepAt(this.FS.outdoor ? 'soil' : 'stone', s.fig.position.x, s.fig.position.z, 0.22);
      }
      if (s.walkT > 2.6) {
        const fx = s.fig.position.x, fz = s.fig.position.z;
        this.FS.root.remove(s.fig);
        this.stranger = null;
        this.strangerDone = true;
        this.ui.subtitle(pickLine('strangerGone'), 5);
        if (this.floor >= 5 && !this.flags.strangerGift) {
          this.flags.strangerGift = true;
          this.dropGift(fx, fz);
        }
      }
    }
  }

  dropGift(x, z) {
    const node = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16),
      flat(0xc8a84a, { emissive: 0xc8a84a, emissiveIntensity: 0.3 }));
    core.position.y = 0.25; node.add(core);
    const gl = glowSprite(1.1, 0xffd9a0, 0.5); gl.position.y = 0.5; node.add(gl);
    node.position.set(x, 0, z);
    this.FS.root.add(node);
    this.FS.interactables.push({
      x, z, r: 1.7, label: 'Take what it left behind', node,
      action: (game) => { game.give('twinlantern', 1); return 'remove'; },
    });
  }

  // ------------------------------------------------------------ the stalker

  startStalk() {
    const p = this.player.pos;
    const f = this.player.forward();
    let x = p.x - f.x * 12, z = p.z - f.z * 12;
    if (this.dng.isSolid(Math.floor(x / CELL), Math.floor(z / CELL))) {
      const spot = this.findSpot(9, 14, false, false);
      if (!spot) return;
      x = spot.x; z = spot.z;
    }
    this.stalker = { x, z, age: 0, stepT: 0 };
    this.ui.subtitle(pickLine('stalkStart'), 5);
  }

  endStalk(calmly) {
    this.stalker = null;
    this.caught = false;
    this.dread = calmly ? 0.1 : 0.25;
    this.stalkCooldown = 50 + Math.random() * 40;
    this.ui.subtitle(pickLine('stalkEnd'), 5);
  }

  updateStalker(dt) {
    const s = this.stalker;
    if (!s) return;
    s.age += dt;
    const p = this.player.pos;
    const dx = p.x - s.x, dz = p.z - s.z;
    const dist = Math.hypot(dx, dz);

    // it walks at a walking pace, and walls are not its concern
    const speed = this.caught ? 3.0 : 2.65;
    if (dist > 0.5) {
      s.x += (dx / dist) * speed * dt;
      s.z += (dz / dist) * speed * dt;
    }

    s.stepT -= dt;
    if (s.stepT <= 0) {
      s.stepT = this.caught ? 0.42 : 0.55;
      const vol = Math.min(0.5, 0.1 + 6 / Math.max(3, dist));
      this.sound.stepAt(this.FS.outdoor ? 'soil' : 'stone', s.x, s.z, vol);
    }

    this.caught = dist < 2.6;
    if (this.caught) {
      this.caughtLineT -= dt;
      if (this.caughtLineT <= 0) {
        this.caughtLineT = 7 + Math.random() * 4;
        this.ui.subtitle(pickLine('caughtLines'), 4);
      }
    }

    if (s.age > 26 || this.nearSafety(3.5)) this.endStalk(false);
  }

  // ------------------------------------------------------------ sirens

  updateSirens(dt) {
    if (this.sirenTimer < 0 || !this.FS.sirens.length) return;
    this.sirenTimer -= dt;
    this.towerLineT -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = 55 + Math.random() * 75;
      const t = this.FS.sirens[Math.floor(Math.random() * this.FS.sirens.length)];
      this.sound.sirenAt(t.x, t.z, 9 + Math.random() * 3);
      this.dread = Math.min(1, this.dread + 0.13);
      if (this.sirenFirst || Math.random() < 0.5) {
        setTimeout(() => this.ui.subtitle(pickLine('siren'), 6), 1500);
        this.sirenFirst = false;
      }
    }
    // standing near a tower, sometimes, a thought
    if (this.towerLineT <= 0) {
      this.towerLineT = 40 + Math.random() * 40;
      const p = this.player.pos;
      for (const t of this.FS.sirens) {
        if (Math.hypot(p.x - t.x, p.z - t.z) < 9) {
          this.ui.subtitle(pickLine('towers'), 5.5);
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ main update

  update(dt, t) {
    const player = this.player;

    // dread economy — the dark hears how loudly you live
    let growth = 0.005 * (1 + this.floor * 0.16);
    if (player.oil < 25) growth += 0.012;
    growth *= 0.55 + 0.9 * player.noise;
    if (player.swordEquipped) growth *= 0.76;
    this.dread = Math.min(1, this.dread + growth * dt);
    if (this.nearSafety(5)) this.dread = Math.max(0, this.dread - 0.09 * dt);

    // ambient events
    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      this.eventTimer = this.nextEventDelay();
      this.fireAmbientEvent();
    }

    // narration: themed, dread-weighted, never repeating until the well is dry
    this.narrTimer -= dt;
    if (this.narrTimer <= 0) {
      this.narrTimer = 45 + Math.random() * 55;
      let cat;
      if (this.dread > 0.72) cat = 'dread_high';
      else if (this.dread > 0.45) cat = Math.random() < 0.5 ? 'dread_mid' : 'narration_' + this.themeHere();
      else if (this.dread < 0.18 && Math.random() < 0.3) cat = 'dread_low';
      else cat = Math.random() < 0.65 ? 'narration_' + this.themeHere() : 'narration_generic';
      if (cat === 'narration_generic' || !pickableCategory(cat)) cat = 'narration_generic';
      this.ui.subtitle(pickLine(cat), 5.5);
    }

    // state murmurs
    if (player.oil < 22) {
      this.oilWarnT -= dt;
      if (this.oilWarnT <= 0) {
        this.oilWarnT = 55 + Math.random() * 30;
        this.ui.subtitle(pickLine('lowOil'), 5);
      }
    } else this.oilWarnT = Math.min(this.oilWarnT, 8);
    if (player.hp < 32) {
      this.hpWarnT -= dt;
      if (this.hpWarnT <= 0) {
        this.hpWarnT = 50 + Math.random() * 30;
        this.ui.subtitle(pickLine('lowHp'), 5);
      }
    }

    // idle / long-walk murmurs
    if (player.moving) {
      this.idleTime = 0;
      this.contWalk += dt;
      this.walkTime += dt;
      if (this.contWalk > 75) {
        this.contWalk = 0;
        if (Math.random() < 0.6) this.ui.subtitle(pickLine('walking'), 5);
      }
    } else {
      this.idleTime += dt;
      this.contWalk = Math.max(0, this.contWalk - dt * 2);
      if (this.idleTime > 40) {
        this.idleTime = 0;
        if (Math.random() < 0.6) this.ui.subtitle(pickLine('idle'), 5);
      }
    }

    // footsteps behind, after you stop
    if (this.wasMoving && !player.moving && this.walkTime > 5 && Math.random() < 0.3 && !this.stalker) {
      const f = player.forward();
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const d = 5 + i * 0.7;
          this.sound.stepAt('stone', player.pos.x + f.x * -d, player.pos.z + f.z * -d, 0.2 - i * 0.03);
        }, 320 + i * 360);
      }
      this.walkTime = 0;
      this.dread = Math.min(1, this.dread + 0.06);
    }
    this.wasMoving = player.moving;

    // lantern dim event
    if (this.dimT > 0) { this.dimT -= dt; player.lanternDimmer = 0.45; }
    else player.lanternDimmer = 1;

    // light stutter event
    if (this.flickT > 0) {
      this.flickT -= dt;
      const j = Math.random() < 0.4 ? 0.15 : 0.7;
      for (const L of this.FS.lights) L.dimmer = j;
      if (this.flickT <= 0) for (const L of this.FS.lights) L.dimmer = 1;
    }

    // figures
    this.updateWatcher(dt);
    if (player.moving) this.maybeSpawnStranger();
    this.updateStranger(dt);
    this.updateSirens(dt);

    // the stalker
    this.stalkCooldown -= dt;
    if (!this.stalker && this.floor >= 3 && !this.FS.engine && this.dread > 0.75 && this.stalkCooldown <= 0) {
      if (Math.random() < dt * (0.1 + 0.12 * player.noise)) this.startStalk();
    }
    this.updateStalker(dt);

    if (this.caught) {
      player.hp = Math.max(0, player.hp - 4.2 * dt);
    }
  }
}

import { LINES } from './lines.js';
function pickableCategory(cat) {
  return !!LINES[cat];
}
