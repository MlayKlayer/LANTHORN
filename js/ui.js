// DOM HUD: bars, prompts, subtitles, banners, dialogue, inventory,
// settings menu, visual filters, radar frame.

import { getIcon } from './textures.js';
import { itemDef } from './items.js';
import { Settings, SETTING_DEFS } from './settings.js';

const $ = (id) => document.getElementById(id);

export const UI = {
  init() {
    this.el = {
      hud: $('hud'),
      hp: $('hpfill'), st: $('stfill'), oil: $('oilfill'),
      chargeRow: $('chargerow'), charge: $('chargefill'),
      prompt: $('prompt'),
      subtitle: $('subtitle'),
      message: $('message'),
      banner: $('banner'), bannerName: $('banner-name'), bannerSub: $('banner-sub'),
      titlecard: $('titlecard'), tcNum: $('titlecard-num'), tcName: $('titlecard-name'),
      dialog: $('dialog'), dlgName: $('dialog-name'), dlgText: $('dialog-text'),
      inventory: $('inventory'), invGrid: $('inv-grid'),
      invName: $('inv-name'), invDesc: $('inv-desc'), invUse: $('inv-use'),
      bigtext: $('bigtext'), btMain: $('bigtext-main'), btSub: $('bigtext-sub'),
      fade: $('fade'),
      caught: $('caught'),
      pause: $('pause'),
      title: $('title-screen'),
      settings: $('settings'), settingsList: $('settings-list'),
      radar: $('radar'),
      vhs: $('vhs'), vhsStamp: $('vhs-stamp'),
      grain: $('grain'), scanlines: $('scanlines'),
    };
    this._subToken = 0;
    this._msgToken = 0;
    this._bannerToken = 0;
    this.dialogState = null;
    this.settingsSel = 0;
    this._vhsTimer = null;
    this._vhsT0 = Date.now() - Math.floor(Math.random() * 5e7);
  },

  showHud(on) { this.el.hud.classList.toggle('hidden', !on); },

  bars(hp, maxHp, st, oil, charge = null) {
    this.el.hp.style.width = `${Math.max(0, hp / maxHp * 100)}%`;
    this.el.st.style.width = `${Math.max(0, st)}%`;
    this.el.oil.style.width = `${Math.max(0, oil)}%`;
    if (charge === null) {
      this.el.chargeRow.classList.add('hidden');
    } else {
      this.el.chargeRow.classList.remove('hidden');
      this.el.charge.style.width = `${Math.max(0, charge)}%`;
    }
  },

  prompt(label) {
    if (!label) { this.el.prompt.style.opacity = 0; this.el.prompt.innerHTML = ''; return; }
    this.el.prompt.innerHTML = `<span class="key">E</span>${label}`;
    this.el.prompt.style.opacity = 1;
  },

  subtitle(text, dur = 5) {
    if (!text) return;
    const tok = ++this._subToken;
    this.el.subtitle.textContent = text;
    this.el.subtitle.style.opacity = 1;
    setTimeout(() => { if (tok === this._subToken) this.el.subtitle.style.opacity = 0; }, dur * 1000);
  },

  msg(text, dur = 4) {
    const tok = ++this._msgToken;
    this.el.message.textContent = text;
    this.el.message.style.opacity = 1;
    setTimeout(() => { if (tok === this._msgToken) this.el.message.style.opacity = 0; }, dur * 1000);
  },

  banner(name, sub = 'ITEM ACQUIRED') {
    const tok = ++this._bannerToken;
    this.el.bannerName.textContent = name;
    this.el.bannerSub.textContent = sub;
    this.el.banner.style.opacity = 1;
    setTimeout(() => { if (tok === this._bannerToken) this.el.banner.style.opacity = 0; }, 3400);
  },

  titlecard(num, name) {
    this.el.tcNum.textContent = num;
    this.el.tcName.textContent = name;
    this.el.titlecard.style.opacity = 1;
    setTimeout(() => { this.el.titlecard.style.opacity = 0; }, 4800);
  },

  // ------------------------------------------------------------ dialogue

  showDialog(name, lines, onDone) {
    const clean = (lines || []).filter(Boolean);
    if (!clean.length) { if (onDone) onDone(); return; }
    this.dialogState = { name, lines: clean, idx: 0, shown: 0, done: false, onDone };
    this.el.dlgName.textContent = name;
    this.el.dlgText.textContent = '';
    this.el.dialog.style.opacity = 1;
  },

  tickDialog(dt) {
    const d = this.dialogState;
    if (!d || d.done) return;
    const line = d.lines[d.idx];
    if (d.shown < line.length) {
      d.shown = Math.min(line.length, d.shown + dt * 42);
      this.el.dlgText.textContent = line.slice(0, Math.floor(d.shown));
    }
  },

  advanceDialog() {
    const d = this.dialogState;
    if (!d) return false;
    const line = d.lines[d.idx];
    if (d.shown < line.length) {
      d.shown = line.length;
      this.el.dlgText.textContent = line;
      return true;
    }
    d.idx++;
    if (d.idx >= d.lines.length) {
      this.el.dialog.style.opacity = 0;
      const cb = d.onDone;
      this.dialogState = null;
      if (cb) cb();
      return false;
    }
    d.shown = 0;
    this.el.dlgText.textContent = '';
    return true;
  },

  get dialogOpen() { return !!this.dialogState; },

  closeDialog() {
    this.dialogState = null;
    this.el.dialog.style.opacity = 0;
  },

  // ------------------------------------------------------------ inventory

  renderInventory(inv, sel, swordEquipped, beamOn) {
    const grid = this.el.invGrid;
    grid.innerHTML = '';
    const slots = Math.max(15, Math.ceil((inv.length + 1) / 5) * 5);
    for (let i = 0; i < slots; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot' + (i === sel ? ' sel' : '');
      const it = inv[i];
      if (it) {
        const def = itemDef(it.id);
        const img = document.createElement('img');
        img.src = getIcon(def.icon);
        slot.appendChild(img);
        if (it.qty > 1) {
          const q = document.createElement('div');
          q.className = 'qty'; q.textContent = it.qty;
          slot.appendChild(q);
        }
        if ((it.id === 'sword' && swordEquipped) || (it.id === 'cranklamp' && beamOn)) {
          const e = document.createElement('div');
          e.className = 'eq'; e.textContent = 'EQ';
          slot.appendChild(e);
        }
      }
      grid.appendChild(slot);
    }
    const it = inv[sel];
    if (it) {
      const def = itemDef(it.id);
      this.el.invName.textContent = def.name;
      this.el.invDesc.textContent = def.desc;
      this.el.invUse.textContent = def.useLabel
        ? `E — ${it.id === 'sword' && swordEquipped ? 'sheathe' : def.useLabel}`
        : (def.type === 'note' ? 'E — read' : '');
    } else {
      this.el.invName.textContent = '';
      this.el.invDesc.textContent = '';
      this.el.invUse.textContent = '';
    }
  },

  showInventory(on) { this.el.inventory.classList.toggle('hidden', !on); },

  // ------------------------------------------------------------ settings

  showSettings(on) {
    this.el.settings.classList.toggle('hidden', !on);
    if (on) this.renderSettings();
  },

  renderSettings() {
    const list = this.el.settingsList;
    list.innerHTML = '';
    SETTING_DEFS.forEach((def, i) => {
      const row = document.createElement('div');
      row.className = 'set-row' + (i === this.settingsSel ? ' sel' : '');
      const lab = document.createElement('div');
      lab.className = 'set-label';
      lab.textContent = def.label;
      const val = document.createElement('div');
      val.className = 'set-value';
      val.textContent = `‹ ${Settings.optionLabel(def.id)} ›`;
      row.appendChild(lab); row.appendChild(val);
      if (i === this.settingsSel) {
        const hint = document.createElement('div');
        hint.className = 'set-hint';
        hint.textContent = def.hint || '';
        row.appendChild(hint);
      }
      row.addEventListener('click', () => {
        this.settingsSel = i;
        Settings.cycle(def.id, 1);
        this.renderSettings();
      });
      list.appendChild(row);
    });
  },

  // ------------------------------------------------------------ filters

  applyFilter() {
    const f = Settings.get('filter');
    const grain = Settings.get('grain');
    document.body.classList.toggle('filter-crt', f === 'crt');
    document.body.classList.toggle('filter-vhs', f === 'vhs');
    document.body.classList.toggle('filter-clean', f === 'clean');
    this.el.grain.style.display = grain ? '' : 'none';

    if (this._vhsTimer) { clearInterval(this._vhsTimer); this._vhsTimer = null; }
    if (f === 'vhs') {
      const stamp = () => {
        const t = new Date(this._vhsT0 + (Date.now() - this._vhsT0));
        const pad = (n) => String(n).padStart(2, '0');
        this.el.vhsStamp.textContent =
          `PLAY ▸  ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
        // occasional tracking stumble
        if (Math.random() < 0.07) {
          document.body.classList.add('vhs-jitter');
          setTimeout(() => document.body.classList.remove('vhs-jitter'), 90 + Math.random() * 130);
        }
      };
      stamp();
      this._vhsTimer = setInterval(stamp, 1000);
    }
  },

  // ------------------------------------------------------------ radar

  showRadar(on) { this.el.radar.classList.toggle('hidden', !on); },

  // ------------------------------------------------------------ big text / fade

  bigtext(main, sub, pale = false) {
    this.el.bigtext.classList.remove('hidden');
    this.el.btMain.classList.toggle('pale', pale);
    this.el.btMain.textContent = main;
    this.el.btSub.textContent = sub || '';
    requestAnimationFrame(() => {
      this.el.btMain.style.opacity = 1;
      this.el.btSub.style.opacity = 1;
    });
  },

  hideBigtext() {
    this.el.btMain.style.opacity = 0;
    this.el.btSub.style.opacity = 0;
    setTimeout(() => this.el.bigtext.classList.add('hidden'), 2300);
  },

  fade(toBlack, instant = false) {
    if (instant) {
      this.el.fade.style.transition = 'none';
      this.el.fade.style.opacity = toBlack ? 1 : 0;
      void this.el.fade.offsetHeight;
      this.el.fade.style.transition = '';
    } else {
      this.el.fade.style.opacity = toBlack ? 1 : 0;
    }
  },

  caughtOverlay(frac) {
    this.el.caught.style.opacity = frac;
  },

  showPause(on) { this.el.pause.classList.toggle('hidden', !on); },
  showTitle(on) { this.el.title.classList.toggle('hidden', !on); },
};
