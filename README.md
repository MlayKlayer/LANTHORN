# LANTHORN
*the lift only goes down*

A first-person horror exploration game for the browser. Early Dark Souls
atmosphere on PS2-era rendering: 240p internal resolution, nearest-neighbour
upscale, low-poly props, 64px procedural textures, fog, film grain.

You descend through a cathedral-factory built around a dying machine god —
the Engine — whose keepers digitized their prayers before the surface closed.
Something in the dark counts the living. It is not hostile. It is thorough.

There are no jump scares. The horror is the second set of footsteps.

## Run it

Everything is local — no build step, no CDN, no assets to download
(three.js is vendored in `libs/`, all textures and audio are generated
procedurally at runtime).

```bash
python3 serve.py
# then open http://localhost:8741
```

Any static file server pointed at this folder works too
(`npx http-server`, `php -S`, etc.). It must be served over HTTP —
ES modules don't load from `file://`.

## Controls

| Input | Action |
|---|---|
| WASD | move |
| Mouse | look (click to capture the pointer) |
| Shift | run (stamina) |
| E / Enter | interact · advance dialogue |
| Tab / I | inventory (arrows to navigate, E to use) |
| LMB | swing the sword, if you've found and equipped it |
| Esc | pause |

## What's down there

- **Seven floors**, procedurally generated each run — gothic naves, crypts,
  flooded foundries, and retro-tech archive halls, connected by corridors.
  Deeper floors are darker, the fog closer, the events worse.
- **The ember beacon** — rest to heal, refill your lantern, and quiet the
  count. You respawn here.
- **The chain lift** — the only way onward. From floor II it wants a
  winch-key hidden somewhere on the floor.
- **Your lantern** burns oil. Keep it fed. The dark grows attentive around
  an empty lamp.
- **The Penitent** — a kneeling suit of armor that speaks only to your back.
- **The Archive** — a wall of dead televisions that trades passage for
  memories. It would like to forget your keepsakes for you.
- **The Stranger** — far down some hallway, a figure holding a lantern
  exactly the way you do.
- **The count** — when the dread is high enough, you will hear a second set
  of footsteps. They do not go around walls. Reach light, or read the psalm,
  or keep walking. It walks at a walking pace.

Progress (floor, inventory, story flags) is saved in `localStorage` whenever
you rest or descend.

## Code map

| File | What it does |
|---|---|
| `js/main.js` | game states, floor transitions, interaction, death/ending |
| `js/dungeon.js` | seeded room+corridor generator, themes, finale chamber |
| `js/builder.js` | merged level geometry, prop/light/item/NPC placement |
| `js/props.js` | low-poly prop library (braziers, coffins, terminals, lift…) |
| `js/textures.js` | all textures, drawn to 64px canvases at load |
| `js/presence.js` | the horror director: dread, watcher, stranger, stalker |
| `js/npcs.js` | the Penitent and the Archive |
| `js/player.js` | first-person controller, collision, viewmodels |
| `js/audio.js` | fully synthesized WebAudio: drones, bells, whispers, steps |
| `js/ui.js` | HUD, dialogue, inventory, title cards |
| `js/items.js` | item definitions and lore text |
