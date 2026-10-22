# PRISMFALL — Steam Achievements

Source of truth: `src/content/achievements.ts` (this table mirrors it — update both together).
**API name = achievement `id`.** Never rename an API name after release; Steam keys player progress on it.

## Steamworks setup

- *Steamworks → App Admin → Stats & Achievements → Achievements*: create one entry per row below.
- **API Name**: the `id` column, exactly (lowercase snake_case).
- **Display name / Description**: fill `english` from the EN columns and `schinese` (Simplified Chinese) from the ZH columns.
- **Hidden**: tick for rows marked **Yes** (name and description stay secret until unlocked).
- **Icons**: 64×64 JPG/PNG, an *achieved* (full neon colour) and an *unachieved* (desaturated, dimmed) version per achievement.
  Suggested tint by group: descent = stage palette, characters = character colour, fusion/resonance = hue colour, lifetime = white.
- No Steam stats are required — every unlock is computed in-game and pushed with
  `window.native.achieve(id)` → Electron `ipcMain 'achieve'` → `steamworks.js achievement.activate(id)`.
- Publish the changes, then test with the real App ID in `steam_appid.txt` (480/Spacewar ignores custom API names).

## When each achievement is evaluated

| group | evaluated | data |
|---|---|---|
| per-run feats (`endless_20`, `triple_fusion`, `run_kills_2000`, `level_50`, `untouchable`, resonance) | live, every 2 s during a run + at run end | `World` / `RunResult` |
| outcome feats (`pristine`, `too_bright`, `one_light`) | at run end only | `RunResult` |
| stage, ascension & character clears | at run end (after the clear is banked) | `SaveData.cleared`, `SaveData.charWins` |
| lifetime counters (kills, elites, bosses, chests, bursts, lumens, runs) | at run end (after the run is banked) | `SaveData.stats` |
| `first_fusion`, `prismatic` | live, within 2 s of the fusion | `SaveData.stats` + `World` |
| Forge & Lumen hoard | first check of the next run (immediately on purchase once `buyShop` calls `checkAchievements`) | `SaveData.shop`, `SaveData.lumens` |

## Achievements (40 — 3 hidden)

| # | API name | Name (EN) | Name (ZH) | Description (EN) | Description (ZH) | Hidden | In-game reward |
|---|---|---|---|---|---|---|---|
| 1 | `clear_shallows` | Into the Light | 步入光中 | Clear the Nebula Shallows. | 通关星云浅滩。 | No | char `halo` |
| 2 | `clear_crimson` | Trial by Fire | 烈焰试炼 | Clear the Crimson Expanse. | 通关赤红荒原。 | No | weapon `sunfall` |
| 3 | `clear_verdant` | Overgrowth | 万物疯长 | Clear the Verdant Lattice. | 通关翠绿晶格。 | No | lumens `500` |
| 4 | `clear_singularity` | Event Horizon | 事件视界 | Clear the Singularity and silence the Null Prism. | 通关奇点，令虚无棱镜归于沉寂。 | No | char `null` |
| 5 | `asc_3` | Ascendant | 攀升者 | Clear any stage at Ascension 3 or higher. | 以飞升 3 或更高难度通关任意关卡。 | No | — |
| 6 | `asc_5` | Supernova | 超新星 | Clear any stage at Ascension 5 or higher. | 以飞升 5 或更高难度通关任意关卡。 | No | — |
| 7 | `asc_10` | Beyond the Spectrum | 超越光谱 | Clear any stage at Ascension 10. | 以飞升 10 难度通关任意关卡。 | No | — |
| 8 | `endless_20` | Undying Light | 不灭之光 | Survive 20 minutes in Endless mode. | 在无尽模式中存活 20 分钟。 | No | — |
| 9 | `win_vex` | Special Delivery | 使命必达 | Clear any stage as Vex. | 使用「维克丝」通关任意关卡。 | No | — |
| 10 | `win_ember` | Burn Bright | 燃尽光华 | Clear any stage as Ember. | 使用「余烬」通关任意关卡。 | No | — |
| 11 | `win_moss` | Deep Roots | 根深蒂固 | Clear any stage as Moss. | 使用「苔」通关任意关卡。 | No | — |
| 12 | `win_quill` | Pinpoint | 一针见血 | Clear any stage as Quill. | 使用「翎」通关任意关卡。 | No | — |
| 13 | `win_halo` | Many Moons | 众星拱月 | Clear any stage as Halo. | 使用「光环」通关任意关卡。 | No | — |
| 14 | `win_null` | Nothing Remains | 万物归虚 | Clear any stage as Null. | 使用「虚无」通关任意关卡。 | No | — |
| 15 | `all_chars` | Full Spectrum | 全光谱 | Clear a stage with every character. | 使用每一位角色各通关一次关卡。 | No | — |
| 16 | `first_fusion` | Spectral Fusion | 光谱融合 | Fuse two weapons of different hues. | 将两把不同色相的武器融合。 | No | weapon `refractor` |
| 17 | `triple_fusion` | Trichromacy | 三色视界 | Perform 3 Spectral Fusions in a single run. | 单局内完成 3 次光谱融合。 | No | — |
| 18 | `prismatic` | All Light Is One | 万光归一 | Achieve Prismatic Resonance: hold Solar, Glacial and Void fusions at once. | 达成棱彩共鸣：同时持有烈阳、冰川与虚空融合武器。 | No | — |
| 19 | `resonance_r` | Seeing Red | 怒目赤红 | Hold 6 Crimson items at once to awaken full Crimson Resonance. | 同时持有 6 件绯红物品，唤醒完全绯红共鸣。 | No | — |
| 20 | `resonance_g` | Evergreen | 万古长青 | Hold 6 Verdant items at once to awaken full Verdant Resonance. | 同时持有 6 件翠绿物品，唤醒完全翠绿共鸣。 | No | — |
| 21 | `resonance_b` | Into the Blue | 坠入蔚蓝 | Hold 6 Azure items at once to awaken full Azure Resonance. | 同时持有 6 件蔚蓝物品，唤醒完全蔚蓝共鸣。 | No | — |
| 22 | `run_kills_2000` | Bullet Heaven | 弹幕天堂 | Destroy 2,000 enemies in a single run. | 单局内消灭 2,000 名敌人。 | No | — |
| 23 | `level_50` | Radiant | 光芒万丈 | Reach level 50 in a single run. | 单局内达到 50 级。 | No | — |
| 24 | `untouchable` | Untouchable | 毫发无伤 | Go 3 minutes without taking damage. | 连续 3 分钟未受到任何伤害。 | No | — |
| 25 | `pristine` | Flawless Refraction | 完美折射 | Clear a stage taking less than 100 damage in total. | 通关一个关卡，且累计受到的伤害低于 100。 | No | — |
| 26 | `kills_1k` | A Thousand Sparks | 千点星火 | Destroy 1,000 enemies. | 累计消灭 1,000 名敌人。 | No | — |
| 27 | `kills_10k` | Lightstorm | 光之风暴 | Destroy 10,000 enemies. | 累计消灭 10,000 名敌人。 | No | weapon `wisp_swarm` |
| 28 | `kills_50k` | Photon Tide | 光子狂潮 | Destroy 50,000 enemies. | 累计消灭 50,000 名敌人。 | No | — |
| 29 | `kills_100k` | Lightbringer | 携光者 | Destroy 100,000 enemies. | 累计消灭 100,000 名敌人。 | No | — |
| 30 | `elites_25` | Elite Hunter | 精英猎手 | Defeat 25 elite enemies. | 累计击败 25 名精英敌人。 | No | — |
| 31 | `bosses_10` | Titanfall | 巨像陨落 | Defeat 10 bosses. | 累计击败 10 名首领。 | No | — |
| 32 | `chests_50` | Cache Cracker | 宝匣猎人 | Open 50 Prism Caches. | 累计开启 50 个棱镜宝匣。 | No | — |
| 33 | `overdrive_100` | Chromatic Overload | 色彩超载 | Unleash 100 Prism Bursts. | 累计释放 100 次棱镜爆发。 | No | — |
| 34 | `lumens_10k` | Gilded | 流光溢金 | Collect 10,000 Lumens in total. | 累计获得 10,000 流明。 | No | — |
| 35 | `runs_100` | The Long Fall | 漫长坠落 | Complete 100 runs. | 完成 100 局游戏。 | No | — |
| 36 | `forge_max` | Forged in Light | 光铸之躯 | Max out any Prism Forge upgrade. | 将任意一项棱镜熔炉强化升至满级。 | No | — |
| 37 | `forge_all` | Well-Tempered | 百炼成钢 | Own every Prism Forge upgrade at once. | 同时拥有全部棱镜熔炉强化。 | No | — |
| 38 | `too_bright` | Too Bright | 过于耀眼 | Burn out within the first minute of a run. | 开局一分钟内便燃尽熄灭。 | **Yes** | — |
| 39 | `one_light` | Monochrome | 单色 | Clear a stage holding just one weapon. | 仅持有一把武器通关关卡。 | **Yes** | — |
| 40 | `hoard` | Hoard of Light | 光之宝库 | Hold 5,000 unspent Lumens. | 持有 5,000 未花费的流明。 | **Yes** | — |

Rewards are granted in-game only (Steam has no reward concept): `char` unlocks a character, `weapon` adds it to the upgrade pool,
`lumens` credits the Forge balance.
