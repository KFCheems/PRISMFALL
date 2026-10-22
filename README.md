# PRISMFALL

**Bend light. Mix color. Survive the fall.**

A neon-geometric roguelite *survival shooter* ("bullet heaven") for Windows and Steam Deck.
Your weapons fire on their own — you move, dash through danger, pick upgrades, and detonate a
screen-wide **Prism Burst**.

## Play

```bash
npm install
npm run dev        # http://localhost:5173 — hot reload
npm run desktop    # build + run inside Electron (with Steam achievements if available)
npm run dist       # portable Windows build into release/
```

Keyboard & mouse, or a controller (left stick move, right stick aim, **A/RB/RT** dash,
**Y/LB/LT** Prism Burst, Start pause). All menus work on the D-pad.

## The hook

Every weapon and passive belongs to a hue — **Crimson** (raw force), **Verdant** (life & reach),
**Azure** (tempo). Max out two weapons of *different* hues and they **fuse**:

| Fusion | Recipe | Effect |
|---|---|---|
| **Solar** | Crimson + Verdant | hits burn; 22% chance to chain lightning to 3 foes |
| **Glacial** | Verdant + Azure | hits slow; 12% freeze; frozen foes take +25% and shatter |
| **Void** | Crimson + Azure | projectiles home; kills may open a singularity; hits may heal |

Holding all three at once triggers **Prismatic Resonance** (+20% might, white Prism Burst, all effects).

## Layout

```
src/
  main.ts                 bootstrap & frame loop
  core/                   gl.ts (WebGL2 SDF renderer + HDR bloom), input, audio (all WebAudio synthesis),
                          save, i18n (EN + 简体中文), math
  game/                   types.ts (every interface), world.ts (simulation), player, spawner, upgrades,
                          meta (save/achievements/forge), registry (auto-collects content), spatial, game
  content/
    weapons/*.ts          15 weapons — one file each, `export default` a WeaponDef
    enemies/*.ts          4 stage rosters, `export default` EnemyDef[]
    bosses/*.ts           4 bosses
    stages/*.ts           4 stage timelines
    characters.ts passives.ts achievements.ts shop.ts ascension.ts
  ui/                     ui.ts (screen/nav framework), hud.ts, kit.ts, style.css, hud.css, screens.css
    screens/              title, menu, chars, stages, forge, codex, achievements, settings, credits,
                          levelup, chest, pause, results, confirm
docs/
  ARCHITECTURE.md         the design & content contract (ids are binding)
  STEAM_ACHIEVEMENTS.md   the 40 achievements, Steamworks setup notes
steam/
  store_page.md           store copy (EN + 简体中文), system requirements, Deck notes
  assets/                 store capsules & library art (Steam's required sizes)
  screenshots/            store screenshots captured from the real build
build/                    icon + store-art pipeline (sharp), Steam asset generation
electron/                 desktop shell, Steam achievement bridge
```

Content is auto-registered: `game/registry.ts` globs `content/weapons|enemies|bosses|stages/*.ts`, so
adding a file whose `default` export is a def (or an array of defs) is enough.

## Scripts

| script | what it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc --noEmit` + production bundle |
| `npm run typecheck` | strict TypeScript check only |
| `npm run desktop` | build and launch in Electron |
| `npm run dist` | portable Windows build |
| `npm run assets` | regenerate the icon and Steam capsule art |
| `npm test` | the full Playwright suite (96 tests) |
| `npm run test:fast` | everything except the real-play gate (quick loop) |
| `npm run test:play` | the skilled-play gate on its own |
| `npm run test:balance` | diagnostic survival report per stage |
| `npm run typecheck:test` | typecheck the test sources |

## Tests

`tests/` drives the real build in Chromium with real keyboard and gamepad input — no state is injected to
skip an interaction being tested. `window.__pf` is exposed for assertions and for the balance tooling.

| file | covers |
|---|---|
| `01-navigation` | title, all seven menu entries, focus, every screen opens and escapes, content non-empty |
| `02-gameplay` | a real click path into a run, movement, dash i-frames, spawns and kills, pause, all six starters |
| `03-content` | 15 weapons x 7 levels, 15 passives, 21 enemies + 4 bosses, 4 stages, 6 lights, 40 achievements, Forge and ascension tables |
| `04-progression` | XP and level-ups, cards, rerolls, skips, all three fusions, Prismatic resonance, overdrive, chests, save persistence, Forge refunds, stage unlocks |
| `05-stages` | each stage from wave 1 through its boss to a clear, ascension scaling, endless respawn, death and run records |
| `06-ui-audio-perf` | EN/zh, four resolutions without overflow, render scale and bloom, all 57 SFX and 9 tracks, dense-frame budget, 10-minute memory |
| `07-real-play` | a minute of honest keyboard play, natural level-ups, death when idle, dash i-frames, every non-boss enemy killable |
| `08-playability` | a danger-aware gate proving each of the four stages survives a skilled first minute |
| `09-gamepad` | a virtual standard-mapping pad: detection, action mapping, d-pad focus, sticks driving move/aim, RB dash, Y burst |
| `10-packaged` | the real `release/` portable exe boots over CDP, creates its canvas and reaches the menu |
| `11-robustness` | corrupt/legacy/partial saves, hard quit, hidden tab, mid-run resize, pause spam, 15-minute run, two tabs |
| `12-ascension-endless` | ascension caps at 10 and scales, endless runs past the boss, all six lights select correctly |

The suite found and drove fixes for a dozen real defects — hover stealing menu selection, character and
Forge tiles committing on a single preview click, stage cards auto-starting, `.screen.locked` blocking
clicks, a `bloom_turret` null dereference, stale-distance pickup collection, XP starvation while kiting,
partial saves leaving containers undefined, double-stacked pause screens, and gamepad users being unable
to reach the Select or Forge buttons at all.

## Save data

Progress (Lumens, Forge levels, unlocks, achievements, history) is stored in `localStorage`
and survives across runs. The Prism Forge is fully refundable.
