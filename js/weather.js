// Periodic rain for the open floors. A volume of streaks that follows the
// player; intensity ramps in and out and drives fog density + storm audio.
// Nothing here stings — the thunder rolls, it never cracks.

import * as THREE from 'three';

export class Rain {
  constructor(scene) {
    this.scene = scene;
    this.intensity = 0;     // 0..1 current
    this.target = 0;        // 0..1 desired
    this.box = { w: 34, h: 22, d: 34 };
    const N = 1400;
    this.N = N;
    const pos = new Float32Array(N * 2 * 3);
    this.vel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * this.box.w;
      const y = Math.random() * this.box.h;
      const z = (Math.random() - 0.5) * this.box.d;
      const len = 0.9 + Math.random() * 1.0;
      pos[i * 6 + 0] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + 0.05; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z;
      this.vel[i] = 26 + Math.random() * 16;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo = geo;
    const mat = new THREE.LineBasicMaterial({
      color: 0x596067, transparent: true, opacity: 0,
      depthWrite: false, fog: true,
    });
    this.mat = mat;
    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this._splashT = 0;
  }

  setTarget(v) { this.target = Math.max(0, Math.min(1, v)); }

  // 0 quiet → 1 downpour
  update(dt, playerPos) {
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.4);
    if (this.intensity < 0.01 && this.target === 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mat.opacity = 0.72 * this.intensity;
    this.mesh.position.set(playerPos.x, 0, playerPos.z);

    const pos = this.geo.attributes.position.array;
    const slant = 1.5 * this.intensity;
    const fall = dt;
    for (let i = 0; i < this.N; i++) {
      const b = i * 6;
      const dy = this.vel[i] * fall;
      pos[b + 1] -= dy; pos[b + 4] -= dy;
      pos[b + 0] += slant * fall; pos[b + 3] += slant * fall;
      if (pos[b + 1] < -2) {
        const x = (Math.random() - 0.5) * this.box.w;
        const z = (Math.random() - 0.5) * this.box.d;
        const len = 0.5 + Math.random() * 0.6;
        pos[b + 0] = x; pos[b + 1] = this.box.h; pos[b + 2] = z;
        pos[b + 3] = x + 0.04; pos[b + 4] = this.box.h - len; pos[b + 5] = z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
