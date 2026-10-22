# PRISMFALL — Game Design & Architecture Contract

> Shared contract for everyone building PRISMFALL. Read fully before writing code.

## 1. The game

**PRISMFALL** is a neon-geometric roguelite *survival shooter* ("bullet heaven") for Steam (Windows, Steam Deck).
A fragment of living light falls through four layers of a dying spectrum. Weapons fire automatically; the player
moves, dashes (i-frames), picks upgrades, and unleashes a screen-wide **Prism Burst** (Overdrive). Runs last ~10 min
per stage, ending with a boss. Meta-progression via **Lumens** (currency) spent in the **Prism Forge**.

Tagline: *Bend light. Mix color. Survive the fall.*

### Signature systems
1. **Spectrum hues** — every weapon & passive is **Crimson (R)**, **Verdant (G)** or **Azure (B)**.
   - R = raw force (damage, crit, armor, pierce). G = life & reach (HP, regen, area, duration). B = tempo (cooldown, speed, projectiles).
2. **Spectral Fusion** — when two *different-hue* weapons are both max level (Lv 7), a FUSION card appears.
   The dominant weapon (more damage dealt) absorbs the other, freeing a slot, gaining +40% dmg, +1 amount, +15% area, -10% cd,
   and a secondary-hue property (implemented generically in `World.damage/kill/shot`):
   - **Solar (Y = R+G)**: hits burn + 22% chance chain lightning to 3 foes.
   - **Glacial (C = G+B)**: hits slow; 12% freeze; frozen foes take +25% and shatter into shards on death.
   - **Void (M = R+B)**: projectiles home; kills may spawn a singularity; hits may heal.
   Owning Y, C and M fused weapons simultaneously = **Prismatic Resonance** (+20% might, white Prism Burst with all effects).
3. **Resonance** — item count per hue (fused weapons count for both hues). 3 items: R +15% might; G +1 regen & +10% area; B -10% cd & +15% proj speed.
   6 items: R kills 18% explode; G heal-pulse every 12s; B +1 projectile.
4. **Overdrive / Prism Burst** — kills charge a meter; Q/E or gamepad Y/LB/LT unleashes a screen-wide wave colored by the dominant hue
   (R: +60% dmg, G: heals 30%, B: freezes everything).
5. **Dash** — Space/Shift or gamepad A/RB/RT; i-frames; cooldown ring around the player.

### Run structure
- Stage timeline (`StageDef.waves` + `events`) for `duration` seconds (600 = 10:00), then a boss spawns inside a hex **arena** ring.
  Killing the boss = stage clear. **Endless** mode: waves continue forever, a boss every 5 min.
- Enemy HP scales `stage.hp × ascension × curse × (1 + minutes × 0.28)`. Elites: ×14 HP, ×1.6 size, drop a **Prism Cache** (chest).
- XP photons (diamonds; blue < green < yellow < magenta by value) → level-up → choose 1 of 3 cards (reroll / skip available).
- Slots: 6 weapons (max Lv 7) and 6 passives (max Lv 5).

### Content roster (ids are binding — other modules reference them)

**Characters** (`src/content/characters.ts`): vex (pulse_bolt), ember (flame_arc), moss (spore_field, 400◎), quill (prism_lance, 900◎),
halo (blade_ring, achievement `clear_shallows`), null (arc_drone, achievement `clear_singularity`).

**Weapons** (`src/content/weapons/<id>.ts`, one file each, `export default` a `WeaponDef`):
| hue | id | name | concept |
|---|---|---|---|
| R | `flame_arc` | Flame Arc | crescent slash sweeping in the aim direction, alternating sides; short range, high dmg |
| R | `ember_mortar` | Ember Mortar | lobbed shells land on random on-screen enemies → AoE explosion (telegraphed landing ring) |
| R | `blade_ring` | Blade Ring | blades orbiting the player (persistent, `tick`), rotate faster/more blades per level |
| R | `nova_pulse` | Nova Pulse | periodic expanding shockwave ring around the player, big knockback |
| R | `sunfall` | Sunfall | (unlock `clear_crimson`) pillars of light strike random enemies after a brief target glyph |
| G | `spore_field` | Spore Field | damaging aura around the player (tick, hitCd), slows slightly |
| G | `thorn_seeds` | Thorn Seeds | drops seeds behind the player that sprout into thorn bursts when enemies near |
| G | `vine_lash` | Vine Lash | whip lashing left/right (alternating) horizontally through crowds |
| G | `bloom_turret` | Bloom Sentinel | places stationary flower turrets that fire at nearby enemies for `duration` |
| G | `wisp_swarm` | Wisp Swarm | (unlock `kills_10k`) wisps circle the player then dive at enemies and return |
| B | `pulse_bolt` | Pulse Bolt | (exists) bolts toward the aim direction |
| B | `prism_lance` | Prism Lance | charged piercing laser beam in the aim direction (instant line damage, thick glow) |
| B | `frost_fan` | Frost Fan | shotgun fan of ice shards, short range, slows |
| B | `arc_drone` | Arc Drone | drones orbit and zap nearest enemies with lightning |
| B | `refractor` | Refractor | (unlock `first_fusion`) boomerang prism that splits into side beams when it returns |

**Passives** (`src/content/passives.ts`, done): 15, 5 per hue.

**Enemies** (`src/content/enemies/<stage>.ts`, export default `EnemyDef[]`):
| stage | ids |
|---|---|
| 1 Nebula Shallows (blue/cyan) | `mote` (fodder), `drifter` (basic), `dart` (fast triangle, lunges), `block` (tank box), `splitter` (hex → 2 `shardling` on death), `shardling` |
| 2 Crimson Expanse (red/orange) | `cinder` (erratic chaser), `lancer` (telegraphed dash), `spitter` (keeps range, fires bullets), `bomber` (approaches & self-destructs with hazard telegraph), `brute` (huge, slow, knockback-immune) |
| 3 Verdant Lattice (green) | `sporeling` (leaves a lingering spore hazard on death), `weaver` (orbits, fires ring bursts), `mender` (heals nearby allies), `hive` (stationary, spawns `mote`s), `leaper` (hops with landing telegraph) |
| 4 The Singularity (violet/white) | `phantom` (blinks next to the player after a flicker), `sentry` (stationary, spiral bullets), `void_eye` (fires a telegraphed laser line), `swarmer` (tiny fast packs), `colossus` (huge octagon, spawns `mote`s when damaged) |

**Bosses** (`src/content/bosses/<id>.ts`): `warden` (Hexwarden, stage 1), `pyre` (Pyre Serpent, stage 2), `matriarch` (Bloom Matriarch, stage 3), `null_prism` (Null Prism, stage 4, final, multi-phase).

**Stages** (`src/content/stages/<n>_<id>.ts`): `shallows` (order 1), `crimson` (2, unlockAfter shallows), `verdant` (3, after crimson), `singularity` (4, after verdant).

**Achievement ids referenced elsewhere** (must exist in `src/content/achievements.ts`): `clear_shallows`, `clear_crimson`, `clear_verdant`, `clear_singularity`, `kills_10k`, `first_fusion`, `prismatic`.

## 2. Tech stack
TypeScript (strict) + Vite 8, no frameworks. Custom WebGL2 renderer (SDF instanced shapes + HDR bloom), WebAudio synthesis
(no audio files), DOM/CSS UI. Packaged with Electron for Steam. Code style: **lean, clean, minimal defensive code**, 2-space indent,
no semicolons, single quotes, ~150 char lines. Comment density like the existing files (short doc comments on exported API).

```
src/
  main.ts                 bootstrap & frame loop
  core/  gl.ts (renderer)  input.ts  audio.ts  save.ts  i18n.ts  math.ts
  game/  types.ts (ALL interfaces)  world.ts (simulation)  player.ts  spawner.ts  upgrades.ts  meta.ts  registry.ts  game.ts  spatial.ts
  content/ weapons/*.ts  enemies/*.ts  bosses/*.ts  stages/*.ts  passives.ts characters.ts shop.ts achievements.ts ascension.ts
  ui/    ui.ts (Screen + nav framework)  hud.ts  style.css  screens/*.ts
```
Content is auto-registered: `registry.ts` uses `import.meta.glob` over `content/weapons|enemies|bosses|stages/*.ts` —
just add a file whose `default` export is a def or an array of defs.

## 3. World API (for content authors) — `src/game/world.ts`
World units ≈ pixels at 1080p (view height = 720 units). y grows downward. Angles in radians, 0 = +x.
- `w.p` Player: `x y vx vy r hp stats level aim{x,y} (unit aim dir) face{x,y} weapons passives iframes moving`
- `w.time` run seconds (scaled), `w.real` real seconds. `w.mods` enemy multipliers. `w.viewR` radius enclosing the screen.
- `w.enemies / shots / bullets / hazards / pickups / parts`
- **Player shots**: `w.shot(partial: Partial<Shot>, wi)` → Shot. Defaults: r 6, dmg 10, pierce 1, life 2, hitCd ∞ (once per enemy), kb 60,
  color = weapon color, shape circle, glow 1. Provide `update(s,w,dt)` for custom motion (else linear + auto rotation), `onHit`, `onExpire`, `draw`.
  `noCollide: true` → you handle hits yourself (use `w.canHit(s,e)` then `w.hitWith(s,e)`, or call `w.damage` directly).
  Persistent area shots: `pierce: Infinity, hitCd: 0.4` (re-hit same enemy every 0.4 s).
- **Damage**: `w.damage(e, amount, wi, {kb, dirx, diry, fuse, noCrit, noText})` handles crit, numbers, knockback, fusion procs, death.
  `w.explode(x,y,r,dmg,wi,color,fuse)`, `w.chain(e,dmg,wi,n,color)`, `w.kill(e, wi)`.
- **Queries**: `w.nearest(x,y,maxR, skip?)`, `w.inRadius(x,y,r,cb)`, `w.inLine(x1,y1,x2,y2,halfW,cb)`, `w.randomEnemy(onScreen)`. (`w.grid.query` is low-level.)
- **Weapon stats**: `fire(wi,w,s)` / `tick(wi,w,dt,s)` receive `s` = final stats (`dmg` already × might etc.; `amount` includes bonus;
  `area` multiplier; `speed`, `duration`, `pierce`, `cd`). `w.weaponStats(wi)` recomputes; `w.color(wi)` gives the hue/fused color.
  Use `s.area` to scale sizes/radii, `s.duration` for lifetimes. Per-weapon state lives in `wi.state` (object).
  `wi.fuse` is 'Y'|'C'|'M'|null — color & generic properties are automatic; you MAY add a small fused flourish.
- **Enemies**: `w.spawnEnemy(idOrDef, x, y, {elite, hpMul})`, `w.chase(e, dt, mult)` (steer toward player, sets e.rot),
  `w.angleToPlayer(e)`, `w.spawnPoint()` (off-screen ring point). In `ai(e,w,dt)` set `e.vx/e.vy` (the world integrates position)
  — or move `e.x/e.y` yourself and zero velocity. Scratch fields: `e.state e.timer e.data e.t (age)`. `e.invuln` blocks damage.
  Elites exist for every def automatically. Bosses: `boss: true`, `mass ≥ 40`, `title`, optional `music: 'boss'|'finalBoss'`.
  The boss is clamped inside `w.arena` (radius 620 around the spawn point). Boss HP bar is automatic.
- **Enemy attacks**: `w.enemyShot(x,y,angle,speed,{r,dmg,color,shape,life,update})` → Bullet (speed × mods.bulletSpeed);
  `w.ringShot(x,y,n,speed,offset,opts)`. **Telegraphs**: `w.hazard({kind:'circle'|'line', x,y,r, x2,y2, delay, active, dmg, color, onBoom})`
  — shows a warning for `delay` s then damages the player while active. ALWAYS telegraph big attacks; fairness matters.
  Contact damage uses `def.dmg` automatically. `w.hurt(dmg)` damages the player directly (respects i-frames, armor, mods.dmg).
- **FX**: `w.part({...Particle})`, `w.burst(x,y,{n,color,speed,life,size,shape,spin,stretch})`, `w.ringFx(x,y,r,color)`, `w.zap(x1,y1,x2,y2,color,w)`,
  `w.shake(0..1)`, `w.hitstop(sec)`, `w.flash(color,a)`, `R.ripple(x,y,str,life,speed)` (screen distortion), `w.text(x,y,str,color,size)`,
  `w.sfx(name, {vol,pitch,pan,x}, gate)` — `gate` = min seconds between plays (use 0.03–0.1 for rapid-fire sounds).
- **Drops**: `w.dropXp(x,y,v)`, `w.drop(kind,x,y,value)` kinds: xp heal magnet bomb chest lumen freeze.
- **Hooks**: `w.hooks.banner(title, sub, color)` big center text.

### Renderer — `src/core/gl.ts` (`import { renderer as R, Shape } from '../../core/gl'`)
`R.draw(shape, x, y, w, h, rot, color, alpha=1, glow=0, outline=0, add=1, glowR=0)`
- `add=1` additive light (default), `add=0` solid alpha-blended (use dark fills `scale(color,0.16)` under neon outlines).
- `outline > 0` draws only an outline of that thickness. `glow` 0..2 halo strength (HDR → bloom).
- Shapes: Circle, Tri (points +x), Box, Diamond, Hex, Star, Cross, Capsule (w=half length, h=radius), Glow (soft light), Pent, Oct,
  Arc (w=radius, h=half thickness, outline param = half-aperture radians, opens toward +x), Heart, Ring (outline = thickness).
- `R.line(x1,y1,x2,y2,thick,color,alpha,glow)`; colors are `RGB` tuples 0..1 (`hex('#ff00aa')`). `COLOR.R/G/B/Y/C/M/W` in types.ts.
- Visual language: **dark-filled shapes with glowing outlines** for enemies; **bright additive** for player attacks; **enemy bullets are
  drawn on top with a white core** (keep them readable: magenta/orange/red-pink, never the player's blue/green).

### Audio — `src/core/audio.ts`
`audio.sfx(name: Sfx, {vol, pitch, pan})`, `audio.music(track | null)`, `audio.intensity(0..1)`, `audio.muffle(bool)`, `audio.beat()`.
The `Sfx` and `Music` unions in audio.ts are the full list — use only those names (from gameplay prefer `w.sfx`).

### Localization — `src/core/i18n.ts`
All player-facing text is `L = {en, zh}` (Simplified Chinese). Build with `l('English', '中文')`; resolve with `loc(L, vars?)`.
Write natural, punchy game copy in both languages (not machine-literal Chinese).

### Balance anchors
Player: 100 HP, 200 move speed, magnet 80. Contact dmg: fodder 5–8, mid 10–14, heavy 18–25 (× stage.dmg). Enemy bullet dmg 8–15.
Level-1 weapon ≈ 10–15 DPS single-target equivalent; Lv 7 ≈ 6–8× that (plus area). A good build at 10:00 deals several thousand DPS.
Enemy base HP: fodder 6–10, mid 15–40, heavy 80–200 (time scaling adds ×3.8 by 10:00). Bosses 6k–30k base HP (scaled by stage.hp).
Stage multipliers: shallows hp 1/dmg 1; crimson 1.6/1.25; verdant 2.4/1.5; singularity 3.4/1.8.

## 4. Build status

All content below is implemented and verified in a real browser (Chrome + SwiftShader WebGL2).

| area | files | state |
|---|---|---|
| Weapons | `content/weapons/*.ts` | 15/15 — 5 Crimson, 5 Verdant, 5 Azure, each with 7 levels and a fusion flourish |
| Enemies | `content/enemies/{shallows,crimson,verdant,singularity}.ts` | 21 normal enemies across the 4 stages |
| Bosses | `content/bosses/{warden,pyre,matriarch,null_prism}.ts` | 4/4, multi-pattern, arena-clamped |
| Stages | `content/stages/*.ts` | 4/4 — 5 waves + 10 events each, chained by `unlockAfter` |
| Meta | passives (15), shop (19 upgrades), characters (6), achievements (40), ascension (10) | complete |
| UI | `ui/screens/*` | 14 screens incl. Forge, Codex, Achievements, Settings, Credits |
| Store art | `steam/assets/*.png` | 8 assets at Steam's exact required sizes |

### Verification recipe (how the build was checked)

1. `npx tsc --noEmit` — zero errors.
2. `npx vite build` — production bundle builds.
3. Playwright against the dev server: every menu opens, a full run of each stage reaches the boss and
   the results screen, level-up cards apply, and the win path grants achievements + unlocks.
4. Per-weapon simulation harness: each weapon is given 24 targets for 6 s at Lv 1 and Lv 7; every
   weapon deals damage and the Lv 7 / Lv 1 ratio sits near the 6–8× anchor (AoE weapons run higher on
   clumped targets by design).
5. Per-enemy simulation: every enemy runs 4 s of AI without throwing and produces its bullets/hazards.

### Notes for future content authors

- `isUnlocked()` honours three gates in order: no `unlock` field, the achievement in
  `save.data.achievements`, or a direct unlock recorded in `save.data.weapons` (achievement rewards).
- Telegraphed attacks must stay on `w.hazard` so that slow/freeze/knockback cannot desync the visual
  from the hit; defuse a pending hazard in the attacker's `death` hook.
- The HUD is DOM; its styles live in `ui/hud.css` and it hides itself whenever `ui.blocking` is true.
