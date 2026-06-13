// The few who remain below. Neither is a shopkeeper in a tent.

import * as THREE from 'three';
import { matFor, flat, swordMesh, headlessSaint } from './props.js';
import { getTex, makeCanvas } from './textures.js';
import { RELICS } from './items.js';
import { pickLine } from './lines.js';

function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function cyl(rT, rB, h, seg, mat) { return new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg), mat); }

// ============================================================ THE PENITENT
// A kneeling suit of armor before a headless saint.
// It speaks only to your back.

export const PENITENT_LINES = [
  'Ah. Footsteps with a heart behind them. Rare, here. Don’t turn around — I have grown unaccustomed to faces.',
  'I was a winch-man, then a knight, then a number. Of the three, the number has lasted longest.',
  'You’ve heard it by now. The second set of steps. It is not following you — it is counting you. There is a difference, though I admit the difference stops mattering around the fifth floor down.',
  'Take the psalm from my hands. Don’t look. The words work better between strangers.',
  'Go on. The lift only goes down, and you were never going to stay.',
];

export class Penitent {
  constructor(x, z, rotY) {
    this.kind = 'penitent';
    const g = this.group = new THREE.Group();

    const steel = flat(0x3a3d44);
    const darkSteel = flat(0x26282e);
    const cloth = flat(0x3d2326);

    // kneeling: shins flat on ground, torso upright
    const shinL = box(0.16, 0.16, 0.5, darkSteel); shinL.position.set(-0.14, 0.09, -0.12); g.add(shinL);
    const shinR = box(0.16, 0.16, 0.5, darkSteel); shinR.position.set(0.14, 0.09, -0.12); g.add(shinR);
    const thighL = box(0.17, 0.42, 0.18, steel); thighL.position.set(-0.14, 0.38, 0.08); g.add(thighL);
    const thighR = box(0.17, 0.42, 0.18, steel); thighR.position.set(0.14, 0.38, 0.08); g.add(thighR);
    const skirt = cyl(0.3, 0.38, 0.3, 6, cloth); skirt.position.set(0, 0.62, 0.04); g.add(skirt);
    const torso = box(0.46, 0.55, 0.3, steel); torso.position.set(0, 0.98, 0.02); torso.rotation.x = 0.12; g.add(torso);
    const pauldL = box(0.2, 0.16, 0.26, darkSteel); pauldL.position.set(-0.3, 1.22, 0.02); g.add(pauldL);
    const pauldR = box(0.2, 0.16, 0.26, darkSteel); pauldR.position.set(0.3, 1.22, 0.02); g.add(pauldR);
    // head bowed
    const helm = box(0.2, 0.24, 0.22, steel); helm.position.set(0, 1.36, 0.1); helm.rotation.x = 0.55; g.add(helm);
    const crest = box(0.03, 0.18, 0.26, cloth); crest.position.set(0, 1.5, 0.1); crest.rotation.x = 0.55; g.add(crest);
    // arms resting on the pommel of a point-down greatsword
    const sword = swordMesh(1.25);
    sword.rotation.x = Math.PI; // point down
    sword.position.set(0, 1.62, 0.42);
    g.add(sword);
    const armL = box(0.1, 0.4, 0.1, steel); armL.position.set(-0.18, 1.06, 0.26); armL.rotation.x = -0.7; g.add(armL);
    const armR = box(0.1, 0.4, 0.1, steel); armR.position.set(0.18, 1.06, 0.26); armR.rotation.x = -0.7; g.add(armR);
    const hands = box(0.18, 0.1, 0.12, darkSteel); hands.position.set(0, 1.26, 0.42); g.add(hands);

    // the saint he kneels to
    const saint = headlessSaint();
    saint.group.position.set(0, 0, 1.7);
    saint.group.rotation.y = Math.PI;
    g.add(saint.group);

    g.position.set(x, 0, z);
    g.rotation.y = rotY;

    this.pos = new THREE.Vector3(x, 0, z);
    this.colliders = [
      { x, z, r: 0.55 },
      { x: x + Math.sin(rotY) * 1.7, z: z + Math.cos(rotY) * 1.7, r: 0.7 },
    ];
    this.primed = false;
    this.hinted = false;
    this.speakCooldown = 0;

    this.interactable = {
      x, z, r: 2.4, label: 'Speak',
      action: (game) => this.onInteract(game),
    };
  }

  onInteract(game) {
    if (!this.primed) {
      this.primed = true;
      game.msg(this.hinted
        ? 'It is waiting for you to look away.'
        : pickLine('penitentLook'));
      this.hinted = true;
    } else {
      game.msg(pickLine('penitentLook'));
    }
  }

  update(dt, t, player, game) {
    if (this.speakCooldown > 0) this.speakCooldown -= dt;
    if (!this.primed || this.speakCooldown > 0) return;

    const toNpc = new THREE.Vector3().subVectors(this.pos, player.pos);
    const dist = toNpc.length();
    if (dist > 7) return;
    toNpc.normalize();
    const facing = player.forward().dot(toNpc);
    if (facing < -0.25) {
      // the player's back is turned — he speaks
      const stage = game.flags.penitentStage || 0;
      const line = stage < PENITENT_LINES.length
        ? PENITENT_LINES[stage]
        : pickLine('penitentExtra');
      game.subtitle(line, 7);
      game.sound.whisperAt(this.pos.x, this.pos.z);
      if (stage === 3) {
        setTimeout(() => { if (!game.over) game.give('psalm', 1); }, 4200);
      }
      if (stage < PENITENT_LINES.length) {
        game.flags.penitentStage = stage + 1;
        game.saveFlags();
      }
      this.primed = false;
      this.speakCooldown = 6;
    }
  }
}

// ============================================================ THE ARCHIVE
// A wall of dead televisions grown into the stone. It keeps what the
// Engine counts. Feed it a remembered thing; it forgets it for you.

export class Archive {
  constructor(x, z, rotY) {
    this.kind = 'archive';
    const g = this.group = new THREE.Group();

    const shell = matFor('sciWall', { color: 0x9a9a9e });
    const stone = matFor('stoneWall');
    const staticTex = getTex('static');

    // stone plinth it has grown out of
    const plinth = box(4.4, 0.5, 1.4, stone); plinth.position.y = 0.25; g.add(plinth);

    // CRT stack 4 x 3
    this.eyes = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const cw = 0.95, ch = 0.78;
        const tv = box(cw, ch, 0.85, shell);
        const px = (col - 1.5) * 1.02 + (row % 2) * 0.06;
        const py = 0.92 + row * 0.84;
        tv.position.set(px, py, (row % 2) * -0.08);
        tv.rotation.y = (Math.sin(row * 3 + col * 5) * 0.05);
        g.add(tv);

        const isEye = (row === 1 && (col === 1 || col === 2));
        const isMouth = (row === 0 && col === 1);
        let mat;
        if (isEye || isMouth) {
          const { canvas, ctx } = makeCanvas(48, 36);
          const tex = new THREE.CanvasTexture(canvas);
          tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
          mat = new THREE.MeshBasicMaterial({ map: tex });
          this.eyes.push({ canvas, ctx, tex, kind: isMouth ? 'mouth' : 'eye', phase: Math.random() * 9 });
        } else {
          mat = new THREE.MeshBasicMaterial({ map: staticTex });
        }
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.78, ch * 0.7), mat);
        screen.position.set(px, py, tv.position.z + 0.43);
        g.add(screen);
      }
    }

    // cables rooting it into the floor and ceiling
    const cable = flat(0x17171a);
    for (let i = 0; i < 7; i++) {
      const c = cyl(0.05, 0.08, 1.6, 5, cable);
      c.position.set(-2 + i * 0.66, 0.4, -0.3 - (i % 3) * 0.15);
      c.rotation.x = 0.4 + (i % 3) * 0.25;
      g.add(c);
    }

    const li = new THREE.PointLight(0x9fb8ae, 4, 8, 1.8);
    li.position.set(0, 1.8, 1.4); g.add(li);
    this.lights = [{ light: li, base: 4, style: 'screen' }];

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.pos = new THREE.Vector3(x, 0, z);
    this.rotY = rotY;
    this.colliders = [{ x, z, r: 2.2 }];
    this._faceTimer = 0;
    this.greeted = false;

    this.interactable = {
      x: x + Math.sin(rotY) * 1.6, z: z + Math.cos(rotY) * 1.6,
      r: 2.6, label: 'Address the Archive',
      action: (game) => this.onInteract(game),
    };
  }

  findRelic(game) {
    for (const r of RELICS) if (game.hasItem(r.id)) return r;
    return null;
  }

  onInteract(game) {
    game.sound.whisperAt(this.pos.x, this.pos.z);
    if (!this.greeted && !game.flags.archiveMet) {
      this.greeted = true;
      game.flags.archiveMet = true;
      game.saveFlags();
      game.dialog('THE ARCHIVE', [
        'A wall of dead televisions wakes, one screen at a time. A face assembles itself from static. It is slightly too large.',
        'HELLO. YOU ARE NEW. I HAVE MET YOU FOUR TIMES.',
        'I AM THE ARCHIVE. I KEEP WHAT THE ENGINE COUNTS. DEPOSIT MEMORY. RECEIVE PASSAGE.',
      ]);
      return;
    }
    const relic = this.findRelic(game);
    if (relic) {
      game.dialog('THE ARCHIVE', [
        pickLine('archiveGreet'),
        `YOU CARRY A REMEMBERED THING. ${relic.name.toUpperCase()}. FEED IT TO ME AND I WILL FORGET IT FOR YOU.`,
      ], () => {
        game.takeItem(relic.id);
        const reward = game.keyNeeded() && !game.hasItem('winchkey')
          ? 'winchkey'
          : (Math.random() < 0.4 ? 'psalm' : (Math.random() < 0.5 ? 'oil' : 'ampoule'));
        game.give(reward, 1);
        game.sound.clangAt(this.pos.x, this.pos.z, 0.3);
        game.dialog('THE ARCHIVE', [
          pickLine('archiveTrade'),
          pickLine('archiveBye'),
        ]);
      });
    } else if (game.hasItem('twinlantern')) {
      game.dialog('THE ARCHIVE', [
        'YOU OFFER THE LANTERN. I DECLINE. I CANNOT FORGET THIS ONE.',
        'KEEP IT. ONE OF YOU WILL WANT IT BACK.',
      ]);
    } else {
      game.dialog('THE ARCHIVE', [
        pickLine('archiveGreet'),
        pickLine('archiveIdle'),
        pickLine('archiveBye'),
      ]);
    }
  }

  update(dt, t, player) {
    this._faceTimer -= dt;
    if (this._faceTimer > 0) return;
    this._faceTimer = 0.12;

    // pupil offset toward the player, in the archive's local frame
    const rel = new THREE.Vector3().subVectors(player.pos, this.pos);
    const ang = Math.atan2(rel.x, rel.z) - this.rotY;
    const dist = rel.length();
    const dx = Math.max(-1, Math.min(1, Math.sin(ang) * 1.6));
    const dy = Math.max(-0.6, Math.min(0.6, -(player.pos.y + 1.2) / Math.max(4, dist)));

    for (const e of this.eyes) {
      const { ctx, canvas } = e;
      const W = canvas.width, H = canvas.height;
      // static base
      ctx.fillStyle = '#0c0e0c'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 130; i++) {
        const v = Math.random() * 70 + 10;
        ctx.fillStyle = `rgb(${v * 0.85},${v},${v * 0.9})`;
        ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
      }
      if (e.kind === 'eye') {
        const blink = (t + e.phase) % 7 < 0.25;
        ctx.strokeStyle = 'rgba(190,205,190,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(W / 2, H / 2, 16, blink ? 1.5 : 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (!blink) {
          ctx.fillStyle = 'rgba(210,220,210,0.9)';
          ctx.beginPath();
          ctx.arc(W / 2 + dx * 8, H / 2 + dy * 5, 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // a mouth that is mostly a flat line, occasionally open
        const open = (t + e.phase) % 11 < 0.6;
        ctx.strokeStyle = 'rgba(190,205,190,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (open) ctx.ellipse(W / 2, H / 2, 10, 6, 0, 0, Math.PI * 2);
        else { ctx.moveTo(W / 2 - 12, H / 2); ctx.lineTo(W / 2 + 12, H / 2); }
        ctx.stroke();
      }
      e.tex.needsUpdate = true;
    }
  }
}
