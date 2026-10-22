import { l } from '../core/i18n'
import type { AchievementDef, RunResult } from '../game/types'
import type { SaveData } from '../core/save'
import { CHARACTERS } from './characters'
import { SHOP } from './shop'

type Ctx = Parameters<AchievementDef['check']>[0]

/** per-run feat: checked live during play (w) and on the final result (run) */
const feat = (f: (r: RunResult) => boolean) => ({ run, w }: Ctx) => {
  const r = run ?? w?.result()
  return !!r && f(r)
}
/** end-of-run only (needs the final outcome) */
const ended = (f: (r: RunResult) => boolean) => ({ run }: Ctx) => !!run && f(run)
/** lifetime counter, banked at the end of each run */
const total = (k: keyof SaveData['stats'], n: number) => ({ save }: Ctx) => save.stats[k] >= n
const clearedAt = (asc: number) => ({ save }: Ctx) => Object.values(save.cleared).some((a) => a >= asc)
const wonWith = (char: string) => ({ save }: Ctx) => !!save.charWins[char]?.length
const resonant = (hue: 'R' | 'G' | 'B') => ({ w }: Ctx) => !!w && w.p.resonance()[hue] >= 6

/** Achievements — ids double as Steam API names (see docs/STEAM_ACHIEVEMENTS.md). */
export const ACHIEVEMENTS: AchievementDef[] = [
  // ── the descent ──
  {
    id: 'clear_shallows', name: l('Into the Light', '步入光中'), desc: l('Clear the Nebula Shallows.', '通关星云浅滩。'),
    check: ({ save }) => save.cleared['shallows'] !== undefined, reward: { char: 'halo' },
  },
  {
    id: 'clear_crimson', name: l('Trial by Fire', '烈焰试炼'), desc: l('Clear the Crimson Expanse.', '通关赤红荒原。'),
    check: ({ save }) => save.cleared['crimson'] !== undefined, reward: { weapon: 'sunfall' },
  },
  {
    id: 'clear_verdant', name: l('Overgrowth', '万物疯长'), desc: l('Clear the Verdant Lattice.', '通关翠绿晶格。'),
    check: ({ save }) => save.cleared['verdant'] !== undefined, reward: { lumens: 500 },
  },
  {
    id: 'clear_singularity', name: l('Event Horizon', '事件视界'), desc: l('Clear the Singularity and silence the Null Prism.', '通关奇点，令虚无棱镜归于沉寂。'),
    check: ({ save }) => save.cleared['singularity'] !== undefined, reward: { char: 'null' },
  },
  { id: 'asc_3', name: l('Ascendant', '攀升者'), desc: l('Clear any stage at Ascension 3 or higher.', '以飞升 3 或更高难度通关任意关卡。'), check: clearedAt(3) },
  { id: 'asc_5', name: l('Supernova', '超新星'), desc: l('Clear any stage at Ascension 5 or higher.', '以飞升 5 或更高难度通关任意关卡。'), check: clearedAt(5) },
  { id: 'asc_10', name: l('Beyond the Spectrum', '超越光谱'), desc: l('Clear any stage at Ascension 10.', '以飞升 10 难度通关任意关卡。'), check: clearedAt(10) },
  {
    id: 'endless_20', name: l('Undying Light', '不灭之光'), desc: l('Survive 20 minutes in Endless mode.', '在无尽模式中存活 20 分钟。'),
    check: feat((r) => r.endless && r.time >= 1200),
  },
  // ── the six lights ──
  { id: 'win_vex', name: l('Special Delivery', '使命必达'), desc: l('Clear any stage as Vex.', '使用「维克丝」通关任意关卡。'), check: wonWith('vex') },
  { id: 'win_ember', name: l('Burn Bright', '燃尽光华'), desc: l('Clear any stage as Ember.', '使用「余烬」通关任意关卡。'), check: wonWith('ember') },
  { id: 'win_moss', name: l('Deep Roots', '根深蒂固'), desc: l('Clear any stage as Moss.', '使用「苔」通关任意关卡。'), check: wonWith('moss') },
  { id: 'win_quill', name: l('Pinpoint', '一针见血'), desc: l('Clear any stage as Quill.', '使用「翎」通关任意关卡。'), check: wonWith('quill') },
  { id: 'win_halo', name: l('Many Moons', '众星拱月'), desc: l('Clear any stage as Halo.', '使用「光环」通关任意关卡。'), check: wonWith('halo') },
  { id: 'win_null', name: l('Nothing Remains', '万物归虚'), desc: l('Clear any stage as Null.', '使用「虚无」通关任意关卡。'), check: wonWith('null') },
  {
    id: 'all_chars', name: l('Full Spectrum', '全光谱'), desc: l('Clear a stage with every character.', '使用每一位角色各通关一次关卡。'),
    check: ({ save }) => CHARACTERS.every((c) => save.charWins[c.id]?.length),
  },
  // ── light & color ──
  {
    id: 'first_fusion', name: l('Spectral Fusion', '光谱融合'), desc: l('Fuse two weapons of different hues.', '将两把不同色相的武器融合。'),
    check: ({ save, w }) => save.stats.fusions + (w?.fusions ?? 0) > 0, reward: { weapon: 'refractor' },
  },
  {
    id: 'triple_fusion', name: l('Trichromacy', '三色视界'), desc: l('Perform 3 Spectral Fusions in a single run.', '单局内完成 3 次光谱融合。'),
    check: feat((r) => r.fusions >= 3),
  },
  {
    id: 'prismatic', name: l('All Light Is One', '万光归一'),
    desc: l('Achieve Prismatic Resonance: hold Solar, Glacial and Void fusions at once.', '达成棱彩共鸣：同时持有烈阳、冰川与虚空融合武器。'),
    check: ({ save }) => save.stats.prismatic > 0,
  },
  {
    id: 'resonance_r', name: l('Seeing Red', '怒目赤红'),
    desc: l('Hold 6 Crimson items at once to awaken full Crimson Resonance.', '同时持有 6 件绯红物品，唤醒完全绯红共鸣。'),
    check: resonant('R'),
  },
  {
    id: 'resonance_g', name: l('Evergreen', '万古长青'),
    desc: l('Hold 6 Verdant items at once to awaken full Verdant Resonance.', '同时持有 6 件翠绿物品，唤醒完全翠绿共鸣。'),
    check: resonant('G'),
  },
  {
    id: 'resonance_b', name: l('Into the Blue', '坠入蔚蓝'),
    desc: l('Hold 6 Azure items at once to awaken full Azure Resonance.', '同时持有 6 件蔚蓝物品，唤醒完全蔚蓝共鸣。'),
    check: resonant('B'),
  },
  // ── single-run feats ──
  {
    id: 'run_kills_2000', name: l('Bullet Heaven', '弹幕天堂'), desc: l('Destroy 2,000 enemies in a single run.', '单局内消灭 2,000 名敌人。'),
    check: feat((r) => r.kills >= 2000),
  },
  { id: 'level_50', name: l('Radiant', '光芒万丈'), desc: l('Reach level 50 in a single run.', '单局内达到 50 级。'), check: feat((r) => r.level >= 50) },
  {
    id: 'untouchable', name: l('Untouchable', '毫发无伤'), desc: l('Go 3 minutes without taking damage.', '连续 3 分钟未受到任何伤害。'),
    check: feat((r) => r.noHitTime >= 180),
  },
  {
    id: 'pristine', name: l('Flawless Refraction', '完美折射'), desc: l('Clear a stage taking less than 100 damage in total.', '通关一个关卡，且累计受到的伤害低于 100。'),
    check: ended((r) => r.win && r.dmgTaken < 100),
  },
  // ── lifetime ──
  { id: 'kills_1k', name: l('A Thousand Sparks', '千点星火'), desc: l('Destroy 1,000 enemies.', '累计消灭 1,000 名敌人。'), check: total('kills', 1000) },
  {
    id: 'kills_10k', name: l('Lightstorm', '光之风暴'), desc: l('Destroy 10,000 enemies.', '累计消灭 10,000 名敌人。'),
    check: total('kills', 10000), reward: { weapon: 'wisp_swarm' },
  },
  { id: 'kills_50k', name: l('Photon Tide', '光子狂潮'), desc: l('Destroy 50,000 enemies.', '累计消灭 50,000 名敌人。'), check: total('kills', 50000) },
  { id: 'kills_100k', name: l('Lightbringer', '携光者'), desc: l('Destroy 100,000 enemies.', '累计消灭 100,000 名敌人。'), check: total('kills', 100000) },
  { id: 'elites_25', name: l('Elite Hunter', '精英猎手'), desc: l('Defeat 25 elite enemies.', '累计击败 25 名精英敌人。'), check: total('elites', 25) },
  { id: 'bosses_10', name: l('Titanfall', '巨像陨落'), desc: l('Defeat 10 bosses.', '累计击败 10 名首领。'), check: total('bosses', 10) },
  { id: 'chests_50', name: l('Cache Cracker', '宝匣猎人'), desc: l('Open 50 Prism Caches.', '累计开启 50 个棱镜宝匣。'), check: total('chests', 50) },
  {
    id: 'overdrive_100', name: l('Chromatic Overload', '色彩超载'), desc: l('Unleash 100 Prism Bursts.', '累计释放 100 次棱镜爆发。'),
    check: total('overdrives', 100),
  },
  { id: 'lumens_10k', name: l('Gilded', '流光溢金'), desc: l('Collect 10,000 Lumens in total.', '累计获得 10,000 流明。'), check: total('lumensEarned', 10000) },
  { id: 'runs_100', name: l('The Long Fall', '漫长坠落'), desc: l('Complete 100 runs.', '完成 100 局游戏。'), check: total('runs', 100) },
  // ── the forge ──
  {
    id: 'forge_max', name: l('Forged in Light', '光铸之躯'), desc: l('Max out any Prism Forge upgrade.', '将任意一项棱镜熔炉强化升至满级。'),
    check: ({ save }) => SHOP.some((d) => (save.shop[d.id] ?? 0) >= d.max),
  },
  {
    id: 'forge_all', name: l('Well-Tempered', '百炼成钢'), desc: l('Own every Prism Forge upgrade at once.', '同时拥有全部棱镜熔炉强化。'),
    check: ({ save }) => SHOP.every((d) => save.shop[d.id]),
  },
  // ── hidden ──
  {
    id: 'too_bright', name: l('Too Bright', '过于耀眼'), desc: l('Burn out within the first minute of a run.', '开局一分钟内便燃尽熄灭。'), hidden: true,
    check: ended((r) => !r.win && r.time < 60 && r.dmgTaken >= 50),
  },
  {
    id: 'one_light', name: l('Monochrome', '单色'), desc: l('Clear a stage holding just one weapon.', '仅持有一把武器通关关卡。'), hidden: true,
    check: ended((r) => r.win && r.weapons.length === 1),
  },
  {
    id: 'hoard', name: l('Hoard of Light', '光之宝库'), desc: l('Hold 5,000 unspent Lumens.', '持有 5,000 未花费的流明。'), hidden: true,
    check: ({ save }) => save.lumens >= 5000,
  },
]
