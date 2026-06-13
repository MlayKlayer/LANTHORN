// Player-facing settings: persisted, applied live via onChange hooks.

const KEY = 'lanthorn.settings.v1';

export const SETTING_DEFS = [
  {
    id: 'filter', label: 'VISUAL FILTER',
    options: [
      { label: 'CRT', value: 'crt' },
      { label: 'VHS', value: 'vhs' },
      { label: 'CLEAN', value: 'clean' },
    ],
    hint: 'scanline phosphor · worn tape · bare signal',
  },
  {
    id: 'resolution', label: 'SIGNAL RESOLUTION',
    options: [
      { label: '240p', value: 240 },
      { label: '320p', value: 320 },
      { label: '432p', value: 432 },
    ],
    hint: 'internal render height, upscaled raw',
  },
  {
    id: 'brightness', label: 'GLOOM',
    options: [
      { label: 'PITCH', value: 0.7 },
      { label: 'STANDARD', value: 1.0 },
      { label: 'MERCIFUL', value: 1.5 },
    ],
    hint: 'how much the dark is allowed',
  },
  {
    id: 'look', label: 'LOOK SPEED',
    options: [
      { label: 'SLOW', value: 0.7 },
      { label: 'NORMAL', value: 1.0 },
      { label: 'FAST', value: 1.35 },
      { label: 'UNWISE', value: 1.8 },
    ],
    hint: 'mouse sensitivity',
  },
  {
    id: 'bob', label: 'HEAD BOB',
    options: [
      { label: 'FULL', value: 1.0 },
      { label: 'REDUCED', value: 0.45 },
      { label: 'OFF', value: 0.0 },
    ],
    hint: 'camera sway while walking',
  },
  {
    id: 'volume', label: 'VOLUME',
    options: [
      { label: 'MUTE', value: 0.0 },
      { label: 'LOW', value: 0.4 },
      { label: 'STANDARD', value: 0.8 },
      { label: 'LOUD', value: 1.0 },
    ],
    hint: 'master gain — headphones recommended',
  },
  {
    id: 'grain', label: 'FILM GRAIN',
    options: [
      { label: 'ON', value: 1 },
      { label: 'OFF', value: 0 },
    ],
    hint: 'the dust on the lens',
  },
  {
    id: 'fullscreen', label: 'FULLSCREEN',
    options: [
      { label: 'OFF', value: 0 },
      { label: 'ON', value: 1 },
    ],
    hint: 'fill the whole screen with the dark',
  },
];

const DEFAULTS = { filter: 'crt', resolution: 240, brightness: 1.0, look: 1.0, bob: 1.0, volume: 0.8, grain: 1, fullscreen: 0 };

export const Settings = {
  data: { ...DEFAULTS },
  _listeners: [],

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw) {
        for (const k in DEFAULTS) {
          if (raw[k] !== undefined) this.data[k] = raw[k];
        }
      }
    } catch (e) { /* fine */ }
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
  },

  get(id) { return this.data[id]; },

  set(id, value) {
    this.data[id] = value;
    this.save();
    for (const fn of this._listeners) fn(id, value);
  },

  cycle(id, dir = 1) {
    const def = SETTING_DEFS.find(d => d.id === id);
    if (!def) return;
    const i = def.options.findIndex(o => o.value === this.data[id]);
    const next = def.options[(i + dir + def.options.length) % def.options.length];
    this.set(id, next.value);
  },

  optionLabel(id) {
    const def = SETTING_DEFS.find(d => d.id === id);
    const o = def && def.options.find(o => o.value === this.data[id]);
    return o ? o.label : String(this.data[id]);
  },

  onChange(fn) { this._listeners.push(fn); },
};
