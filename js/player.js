// First-person controller, revision 3: crouch, jump, gravity over arbitrary
// ground (for pocket dimensions), a noise model the dark can hear, gloved
// hands — lamp in the LEFT, one item at a time in the RIGHT — and a shadow
// that is, look down sometime, a perfect circle.

import * as THREE from 'three';
import { CELL } from './dungeon.js';
import {
  lanternViewmodel, swordViewmodel, crankViewmodel, radarViewmodel,
  emptyHandViewmodel, shadowBlobMesh,
} from './props.js';
import { Settings } from './settings.js';

const EYE = 1.62, EYE_CROUCH = 0.96;
const RADIUS = 0.38;
const WALK = 3.1, RUN = 5.2, CROUCH_SPD = 1.7;
const GRAV = -13.5, JUMP_V = 4.6;
const STEP = 1.6;   // how far feet snap to follow ground (stairs)

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    this.pos = new THREE.Vector3(5, 0, 5);
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100;
    this.stamina = 100;
    this.oil = 100;

    // posture & air
    this.crouched = false;
    this.crouchFrac = 0;
    this.feetY = 0; this.vy = 0;
    this.grounded = true;
    this.airTime = 0;
    this.airOffset = 0;        // feet height above the ground beneath (for bob/shadow)

    // pluggable ground for pocket dimensions: (x,z) -> world Y, or null = void
    this.sampleGround = null;
    this.voidBottom = -9999;
    this.onVoid = null;

    // how loud you are being, 0..1 — the dark keeps its own copy
    this.noise = 0;

    this.keys = {};
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.stepAccum = 0;
    this.onStep = null;
    this.onJump = null;
    this.onLand = null;
    this.swing = 0;
    this.moving = false;
    this.running = false;
    this.lanternDimmer = 1;

    // ember lantern light — your base light, lives in the LEFT hand
    this.lanternLight = new THREE.PointLight(0xffb868, 13, 13, 1.6);
    camera.add(this.lanternLight);
    this.lanternLight.position.set(-0.22, -0.16, -0.3);

    this.lampVM = lanternViewmodel();
    this.lampBase = new THREE.Vector3(-0.32, -0.34, -0.6);
    this.lampVM.position.copy(this.lampBase);
    camera.add(this.lampVM);

    // RIGHT hand holds exactly one item at a time
    this.rightItem = null;     // null | 'sword' | 'crank' | 'radar'
    this.rightBase = new THREE.Vector3(0.34, -0.4, -0.62);

    this.swordVM = swordViewmodel();
    this.crankVM = crankViewmodel();
    this.radarVM = radarViewmodel();
    this.emptyVM = emptyHandViewmodel();
    for (const vm of [this.swordVM, this.crankVM, this.radarVM, this.emptyVM]) {
      vm.position.copy(this.rightBase);
      vm.visible = false;
      camera.add(vm);
    }
    this.emptyVM.visible = true;

    // crank-lantern beam (only lit while the crank-lamp is the held right item)
    this.hasBeam = false;
    this.beamOn = false;
    this.beamCharge = 100;
    this.crankSpin = 0;
    this.beam = new THREE.SpotLight(0xffc88a, 0, 26, 0.45, 0.55, 1.4);
    this.beam.position.set(0.2, -0.12, 0);
    camera.add(this.beam);
    this.beamTarget = new THREE.Object3D();
    this.beamTarget.position.set(0, -0.6, -12);
    camera.add(this.beamTarget);
    this.beam.target = this.beamTarget;

    // the shadow. it is round. you have not noticed yet.
    this.shadow = shadowBlobMesh();
    scene.add(this.shadow);

    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  get swordEquipped() { return this.rightItem === 'sword'; }

  // one item per right hand; equipping one puts the others away
  equipRight(item) {
    this.rightItem = item;
    this.swordVM.visible = item === 'sword';
    this.crankVM.visible = item === 'crank';
    this.radarVM.visible = item === 'radar';
    this.emptyVM.visible = !item;
    if (item !== 'crank') this.beamOn = false;
    else this.beamOn = this.beamCharge > 1;
    return this.rightItem;
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  applyLook(dx, dy) {
    const k = 0.0026 * (Settings.get('look') || 1);
    this.yaw -= dx * k;
    this.pitch -= dy * k;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  spawnAt(x, z, yaw = 0, groundY = 0) {
    this.pos.set(x, 0, z);
    this.yaw = yaw; this.pitch = 0;
    this.feetY = groundY; this.vy = 0; this.grounded = true; this.airOffset = 0;
  }

  toggleCrouch() { this.crouched = !this.crouched; }

  jump() {
    if (this.crouched) { this.crouched = false; return false; }
    if (!this.grounded || this.stamina < 8) return false;
    this.vy = JUMP_V;
    this.grounded = false;
    this.stamina = Math.max(0, this.stamina - 10);
    if (this.onJump) this.onJump();
    return true;
  }

  crank() {
    if (!this.hasBeam) return 0;
    const before = this.beamCharge;
    this.beamCharge = Math.min(100, this.beamCharge + 1.7);
    this.crankSpin = 1;
    if (this.rightItem === 'crank' && !this.beamOn && this.beamCharge > 1) this.beamOn = true;
    return this.beamCharge - before;
  }

  update(dt, dng, colliders, inputEnabled) {
    if (inputEnabled) {
      const lookSpd = 2.1 * (Settings.get('look') || 1) * dt;
      if (this.keys['ArrowLeft']) this.yaw += lookSpd;
      if (this.keys['ArrowRight']) this.yaw -= lookSpd;
      if (this.keys['ArrowUp']) this.pitch = Math.min(1.5, this.pitch + lookSpd);
      if (this.keys['ArrowDown']) this.pitch = Math.max(-1.5, this.pitch - lookSpd);
    }

    let mx = 0, mz = 0;
    if (inputEnabled) {
      if (this.keys['KeyW']) mz += 1;
      if (this.keys['KeyS']) mz -= 1;
      if (this.keys['KeyA']) mx -= 1;
      if (this.keys['KeyD']) mx += 1;
    }
    const wantRun = inputEnabled && (this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    this.moving = (mx !== 0 || mz !== 0);
    this.running = this.moving && wantRun && !this.crouched && this.stamina > 1;

    const speed = this.crouched ? CROUCH_SPD : (this.running ? RUN : WALK);
    if (this.running) this.stamina = Math.max(0, this.stamina - 26 * dt);
    else this.stamina = Math.min(100, this.stamina + (this.moving ? 9 : 16) * dt);

    if (this.moving) {
      const f = this.forward();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const dir = new THREE.Vector3()
        .addScaledVector(f, mz)
        .addScaledVector(r, mx)
        .normalize();
      this.pos.x += dir.x * speed * dt;
      this.pos.z += dir.z * speed * dt;
    }

    if (dng) this.collide(dng, colliders);
    else this.collideProps(colliders);

    // ---- vertical: gravity over arbitrary ground (flat 0, or a dimension)
    const ground = this.sampleGround ? this.sampleGround(this.pos.x, this.pos.z) : 0;
    if (ground === null || ground === undefined) {
      // void — fall, then evaporate
      this.vy += GRAV * dt;
      this.feetY += this.vy * dt;
      this.grounded = false;
      this.airTime += dt;
      this.airOffset = 4;
      if (this.feetY < this.voidBottom && this.onVoid) { this.onVoid(); }
    } else {
      if (this.grounded && this.vy <= 0) {
        if (Math.abs(this.feetY - ground) < STEP) { this.feetY = ground; this.vy = 0; }
        else this.grounded = false;
      }
      if (!this.grounded) {
        const prevVy = this.vy;
        this.vy += GRAV * dt;
        this.feetY += this.vy * dt;
        this.airTime += dt;
        if (this.feetY <= ground && prevVy <= 0) {
          this.feetY = ground; this.vy = 0;
          if (this.onLand) this.onLand(prevVy < -6, this.airTime);
          this.grounded = true; this.airTime = 0;
        }
      }
      this.airOffset = Math.max(0, this.feetY - ground);
    }

    // crouch transition
    const targetCrouch = this.crouched ? 1 : 0;
    this.crouchFrac += (targetCrouch - this.crouchFrac) * Math.min(1, dt * 8);

    // noise: what the dark hears of you
    let noise = 0.06;
    if (this.moving) noise = this.crouched ? 0.18 : 0.5;
    if (this.running) noise = 1.0;
    if (!this.grounded) noise = Math.max(noise, 0.4);
    this.noise += (noise - this.noise) * Math.min(1, dt * 3);

    // head bob + footsteps
    const bobScale = Settings.get('bob') ?? 1;
    if (this.moving && this.grounded) {
      const rate = this.crouched ? 4.6 : (this.running ? 9.4 : 6.4);
      this.bobPhase += dt * rate;
      this.bobAmp = Math.min(1, this.bobAmp + dt * 6);
      this.stepAccum += dt * rate;
      if (this.stepAccum > Math.PI * 2) {
        this.stepAccum -= Math.PI * 2;
        if (this.onStep) this.onStep(this.running, this.crouched);
      }
    } else {
      this.bobAmp = Math.max(0, this.bobAmp - dt * 5);
      this.stepAccum = 0;
    }

    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 2.4);

    // compose camera
    const eyeH = this.feetY + EYE + (EYE_CROUCH - EYE) * this.crouchFrac;
    const bobY = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmp * bobScale;
    const bobX = Math.cos(this.bobPhase) * 0.025 * this.bobAmp * bobScale;
    this.camera.position.set(
      this.pos.x + bobX * Math.cos(this.yaw),
      eyeH + bobY,
      this.pos.z + bobX * Math.sin(this.yaw));
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = Math.sin(this.bobPhase) * 0.004 * this.bobAmp * bobScale;

    // viewmodel sway
    const sway = Math.sin(this.bobPhase) * 0.012 * this.bobAmp;
    const swayY = Math.abs(Math.cos(this.bobPhase)) * 0.012 * this.bobAmp;

    // LEFT hand — lamp, always present
    this.lampVM.position.set(this.lampBase.x + sway, this.lampBase.y - swayY, this.lampBase.z);
    this.lampVM.rotation.z = 0.1 + sway * 2.4;

    // RIGHT hand — whichever item, with item-specific bob
    const rb = this.rightBase;
    this.emptyVM.position.set(rb.x - sway, rb.y - swayY, rb.z);
    if (this.rightItem === 'sword') {
      const sw = Math.sin(this.swing * Math.PI);
      this.swordVM.position.set(rb.x - sway, rb.y - swayY + sw * 0.16, rb.z + sw * 0.05);
      this.swordVM.rotation.set(-0.22 + sw * -0.8, 0.3, -0.5 + sw * 0.45);
    } else if (this.rightItem === 'radar') {
      this.radarVM.position.set(rb.x - sway, rb.y - swayY, rb.z);
      if (this.radarVM.userData.spinner) this.radarVM.userData.spinner.rotation.y += dt * 6.5;
    } else if (this.rightItem === 'crank') {
      this.crankVM.position.set(rb.x - sway, rb.y - swayY, rb.z);
    }

    // ember lantern flicker tied to oil
    const oilFrac = Math.max(0.16, this.oil / 100);
    const flick = 0.92 + 0.08 * Math.sin(performance.now() * 0.013) * Math.sin(performance.now() * 0.007);
    this.lanternLight.intensity = 13 * oilFrac * flick * (this.lanternDimmer ?? 1);
    if (this.lampVM.userData.core) {
      this.lampVM.userData.core.material.opacity = 0.5 + 0.45 * oilFrac;
    }

    // crank beam — fire on a leash: jittering aim, breathing brightness
    if (this.rightItem === 'crank' && this.beamOn && this.beamCharge > 0) {
      this.beamCharge = Math.max(0, this.beamCharge - dt * (100 / 340));
      const tNow = performance.now() / 1000;
      const low = this.beamCharge < 18;
      const fire = 0.78 + 0.13 * Math.sin(tNow * 9.1) + 0.07 * Math.sin(tNow * 23.7 + 1.7) + 0.06 * Math.sin(tNow * 5.3 + 4.1);
      const gutter = low ? (0.4 + 0.6 * Math.abs(Math.sin(tNow * 13))) : 1;
      this.beam.intensity += ((44 * fire * gutter) - this.beam.intensity) * Math.min(1, dt * 14);
      this.beamTarget.position.x = Math.sin(tNow * 6.7) * 0.32 + Math.sin(tNow * 2.3) * 0.2 + sway * 6;
      this.beamTarget.position.y = -0.6 + Math.sin(tNow * 7.9 + 2) * 0.26 + swayY * 5;
      if (this.beamCharge <= 0) this.beamOn = false;
    } else {
      this.beam.intensity += (0 - this.beam.intensity) * Math.min(1, dt * 8);
    }
    if (this.rightItem === 'crank') {
      const lens = this.crankVM.userData.lens;
      if (lens) lens.material.emissiveIntensity = this.beamOn ? 0.9 : 0.12;
      if (this.crankSpin > 0) {
        this.crankSpin = Math.max(0, this.crankSpin - dt * 2.2);
        this.crankVM.userData.crank.rotation.x += dt * 22;
      }
    }

    // the shadow: dynamic, attentive, and perfectly, perfectly round
    const shGround = (ground === null || ground === undefined) ? this.feetY : ground;
    this.shadow.position.set(this.pos.x, shGround + 0.04, this.pos.z);
    const breathe = 1 + Math.sin(this.bobPhase * 2) * 0.03 * this.bobAmp + this.airOffset * 0.12;
    this.shadow.scale.setScalar(breathe);
    this.shadow.material.opacity = Math.max(0.3, 0.78 - this.airOffset * 0.25);
  }

  collideProps(colliders) {
    const p = this.pos;
    for (const c of colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const rr = RADIUS + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (rr - d);
        p.z += (dz / d) * (rr - d);
      }
    }
  }

  collide(dng, colliders) {
    const p = this.pos;
    for (let pass = 0; pass < 3; pass++) {
      const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (!dng.isSolid(i, j)) continue;
        const x0 = i * CELL, x1 = x0 + CELL, z0 = j * CELL, z1 = z0 + CELL;
        const nx = Math.max(x0, Math.min(p.x, x1));
        const nz = Math.max(z0, Math.min(p.z, z1));
        let dx = p.x - nx, dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (RADIUS - d);
          p.z += (dz / d) * (RADIUS - d);
        } else {
          const pushL = p.x - (x0 - RADIUS), pushR = (x1 + RADIUS) - p.x;
          const pushU = p.z - (z0 - RADIUS), pushD = (z1 + RADIUS) - p.z;
          const m = Math.min(pushL, pushR, pushU, pushD);
          if (m === pushL) p.x = x0 - RADIUS;
          else if (m === pushR) p.x = x1 + RADIUS;
          else if (m === pushU) p.z = z0 - RADIUS;
          else p.z = z1 + RADIUS;
        }
      }
    }
    this.collideProps(colliders);
  }
}
