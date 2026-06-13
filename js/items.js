// Item registry, lore notes, memory-relics, floor names.

export const ITEMS = {
  lantern: {
    id: 'lantern', name: 'Rusted Lantern', icon: 'lantern', type: 'tool',
    desc: 'Your lantern. The flame is small and loyal. It has been lit longer than you remember carrying it.',
  },
  oil: {
    id: 'oil', name: 'Drip-Oil', icon: 'oil', type: 'consumable',
    desc: 'Thick oil pressed from machine sediment. The lantern prefers it to anything cleaner.',
    useLabel: 'feed the lantern',
  },
  ampoule: {
    id: 'ampoule', name: 'Pale Ampoule', icon: 'ampoule', type: 'consumable',
    desc: 'A glass ampoule of pale light. Crush it, and the body remembers being whole. The light has to come from somewhere. Do not ask from whom.',
    useLabel: 'crush the ampoule',
  },
  winchkey: {
    id: 'winchkey', name: 'Winch-Key', icon: 'key', type: 'key',
    desc: 'A tarnished key for the lift winch, toothed the way a psalm is metered. The lift only goes down.',
  },
  psalm: {
    id: 'psalm', name: 'Worn Psalm', icon: 'psalm', type: 'consumable',
    desc: 'A psalm of counting, worn smooth by a kneeling man’s thumbs. Read aloud, it convinces the dark that you have already been counted.',
    useLabel: 'read aloud',
  },
  sword: {
    id: 'sword', name: 'Nameless Greatsword', icon: 'sword', type: 'weapon',
    desc: 'A knight’s sword pulled from grave-soil. Far too heavy to swing in fear, which is perhaps the point. Holding it steadies the hand.',
    useLabel: 'equip',
  },
  twinlantern: {
    id: 'twinlantern', name: 'A Lantern, Exactly Like Yours', icon: 'lantern', type: 'memory',
    desc: 'You already carry this. You have always carried this. The Archive insists that both are real, and that one of you is the copy.',
  },
  radar: {
    id: 'radar', name: 'Verger’s Wave-Drum', icon: 'radar', type: 'tool',
    desc: 'A brass drum that sings waves into the dark and listens for what declines to move. The vergers used it to count pillars. Toward the end, they used it to count other things. Spins while it listens.',
    useLabel: 'wake the drum (R)',
  },
  cranklamp: {
    id: 'cranklamp', name: 'Winch-Wright’s Crank-Lantern', icon: 'cranklamp', type: 'tool',
    desc: 'A hand-cranked lamp that throws a long warm beam, restless as held firelight. The spring runs down; the handle winds it back. The winch-wrights swore by it, and at it. (F to shine, V to crank.)',
    useLabel: 'shoulder it (F)',
  },
};

// Memory-relics: tradable to the Archive.
export const RELICS = [
  {
    id: 'relic_whistle', name: 'Tin Whistle', icon: 'relic', type: 'memory',
    desc: 'A child’s whistle, kept polished. Somebody below still remembers the tune, and wishes they did not.',
  },
  {
    id: 'relic_ring', name: 'Wedding Band, Fused', icon: 'relic', type: 'memory',
    desc: 'A ring fused to a machine bolt by old heat. Two vows. One of them was kept.',
  },
  {
    id: 'relic_bone', name: 'Saint’s Knucklebone', icon: 'relic', type: 'memory',
    desc: 'A knucklebone in a reliquary of brass and glass. The saint’s name has been filed off. The Archive will know it anyway.',
  },
  {
    id: 'relic_tube', name: 'Cracked Vacuum Tube', icon: 'relic', type: 'memory',
    desc: 'It still glows faintly when held near the heart. Not your heart. The other one.',
  },
  {
    id: 'relic_doll', name: 'Choir Doll', icon: 'relic', type: 'memory',
    desc: 'A doll in choir vestments, sewn from boiler-suit cloth. Its mouth is open. The stitching there is recent.',
  },
];

// Notes: readable lore scraps.
export const NOTES = [
  {
    id: 'note_tally', name: 'Tally of the Ninth Vigil', icon: 'note', type: 'note',
    desc: 'A vellum tally, water-stained.',
    text: '“Forty-one souls descended with the relief crew. The Engine counted forty-two. The abbot says the count is never wrong. We have begun to watch each other at supper.”',
  },
  {
    id: 'note_punchcard', name: 'Punch-Card, Hand-Annotated', icon: 'note', type: 'note',
    desc: 'A machine card, holes like missing teeth.',
    text: '“PRAYER THROUGHPUT FALLING. BOILERS COLD ON LEVELS SIX THROUGH NINE. THE CHOIR NOW SINGS TO THE TURBINES.” — beneath, in pencil: “it sings back.”',
  },
  {
    id: 'note_hinges', name: 'Maintenance Order, Unsigned', icon: 'note', type: 'note',
    desc: 'A work order, the signature scratched out.',
    text: '“Seal the nave doors at dusk. Oil the hinges first. It does not like the sound of iron, and we do not like to hear what it does instead of opening them.”',
  },
  {
    id: 'note_psalter', name: 'Page Torn from a Psalter', icon: 'note', type: 'note',
    desc: 'Illuminated vellum, the gilt long flaked.',
    text: '“...and the Engine shall know the number of its flock, and not one shall go unremembered — neither the living, nor the lately living...”',
  },
  {
    id: 'note_letter', name: 'Foreman’s Letter, Never Sent', icon: 'note', type: 'note',
    desc: 'Folded eight times, soft as cloth.',
    text: '“Mara — the lift only goes down now. The winch-men swear the cables are intact. I think the surface has simply closed, the way water closes. Do not come looking.”',
  },
  {
    id: 'note_census', name: 'Census Fragment', icon: 'note', type: 'note',
    desc: 'Columns of figures in a careful hand.',
    text: '“Day 300: the count exceeds the living by one. Day 301: by one. Day 302: by one. It is patient, and the arithmetic never changes. Whatever it is counting, it walks at a walking pace.”',
  },
];

export const FLOOR_NAMES = [
  'THE DROWNED FOUNDRY',
  'THE STILL CHOIR',
  'THE IRON RELIQUARY',
  'THE PALE CONSERVATORY',
  'THE COLD REFECTORY',
  'THE UNNUMBERED STAIR',
  'THE SALT CHAPEL',
  'THE FURNACE CLOISTER',
  'THE QUIET TURBINE HALL',
  'THE SEVERED SCRIPTORIUM',
];

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export const FINAL_FLOOR = 7;

export function itemDef(id) {
  if (ITEMS[id]) return ITEMS[id];
  const r = RELICS.find(x => x.id === id); if (r) return r;
  const n = NOTES.find(x => x.id === id); if (n) return n;
  return { id, name: id, desc: '', icon: 'relic', type: 'memory' };
}
