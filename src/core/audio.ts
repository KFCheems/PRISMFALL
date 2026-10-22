/**
 * Procedural audio engine (WebAudio). Every sound and every note is synthesized at runtime — no audio files.
 *
 * Signal flow:
 *   voices → sfxBus ─┐
 *   music  → muffle → musicBus ─┼→ reverb send ─┐
 *                                └──────────────┴→ compressor → master → destination
 *
 * The music is a small step sequencer: one config per track (tempo, key, scale, patterns) driving
 * pad / bass / arp / lead / drum voices on a 16th-note grid. `intensity()` opens filter and drum layers
 * as the fight heats up; `beat()` reports the phase within the bar for visual pulsing.
 */
export type Sfx =
  // weapons
  | 'shoot' | 'shootHeavy' | 'laser' | 'slash' | 'pulse' | 'whip' | 'spore' | 'plant' | 'turret' | 'drone' | 'orbit' | 'shard' | 'mortar' | 'beam'
  // impacts
  | 'hit' | 'crit' | 'explode' | 'explodeBig' | 'zap' | 'freeze' | 'shatter' | 'burn' | 'void'
  // enemies
  | 'enemyDie' | 'eliteDie' | 'enemyShoot' | 'charge' | 'teleport' | 'spawn' | 'bossWarn' | 'bossRoar' | 'bossDie' | 'bossPhase'
  // player
  | 'hurt' | 'heal' | 'dash' | 'xp' | 'lumen' | 'pickup' | 'levelUp' | 'chest' | 'fusion' | 'overdriveReady' | 'overdrive' | 'revive' | 'death' | 'bomb' | 'magnet'
  // ui
  | 'uiMove' | 'uiSelect' | 'uiBack' | 'uiDeny' | 'unlock' | 'achievement' | 'victory' | 'defeat' | 'purchase'

export type Music = 'menu' | 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'boss' | 'finalBoss' | 'victory' | 'defeat'

export interface SfxOpts {
  vol?: number // 0..1 multiplier
  pitch?: number // playback-rate style multiplier (1 = normal)
  pan?: number // -1..1
}

// ───────────────────────────── math helpers ─────────────────────────────
/** midi note → Hz */
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

// ───────────────────────────── track definitions ─────────────────────────────
interface TrackDef {
  bpm: number
  root: number // midi root of the key
  scale: number[] // semitone degrees of the scale
  /** chord progression, one entry per bar (degree indexes into `scale`) */
  chords: number[][]
  /** arpeggio degrees, one per 16th step (null = rest) */
  arp: (number | null)[]
  /** bass degrees, one per 8th step (null = rest) */
  bass: (number | null)[]
  /** lead melody degrees, one per 8th step, used from the second bar on */
  lead?: (number | null)[]
  drums: 'none' | 'soft' | 'full' | 'drive'
  padType: OscillatorType
  leadType: OscillatorType
  /** filter cutoff at intensity 0 and 1 */
  cut: [number, number]
}

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10]

/** 16-step arp pattern, degrees ascending/descending through the chord */
const arpUp = (d: number[] = [0, 1, 2, 3]) => {
  const out: (number | null)[] = []
  for (let i = 0; i < 16; i++) out.push(i % 2 ? null : d[(i / 2) % d.length])
  return out
}

const TRACKS: Record<Music, TrackDef> = {
  menu: {
    bpm: 74, root: 57, scale: AEOLIAN,
    chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]],
    arp: arpUp([0, 2, 4, 7]),
    bass: [0, null, 0, null, 4, null, 4, null],
    drums: 'none', padType: 'sine', leadType: 'triangle', cut: [420, 2400],
  },
  stage1: {
    bpm: 96, root: 50, scale: DORIAN,
    chords: [[0, 2, 4], [3, 5, 0], [5, 0, 2], [4, 6, 1]],
    arp: arpUp([0, 2, 4, 2]),
    bass: [0, null, 0, 0, 3, null, 3, null],
    lead: [4, null, 6, null, 4, 2, null, 0],
    drums: 'soft', padType: 'sine', leadType: 'triangle', cut: [600, 3200],
  },
  stage2: {
    bpm: 118, root: 52, scale: PHRYGIAN,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [4, 6, 1]],
    arp: arpUp([0, 2, 4, 6]),
    bass: [0, 0, null, 0, 1, 1, null, 1],
    lead: [4, 4, null, 2, 0, null, 1, null],
    drums: 'full', padType: 'triangle', leadType: 'square', cut: [700, 3600],
  },
  stage3: {
    bpm: 104, root: 55, scale: DORIAN,
    chords: [[0, 2, 4], [2, 4, 6], [3, 5, 0], [5, 0, 2]],
    arp: arpUp([0, 1, 2, 4]),
    bass: [0, null, 2, null, 3, null, 2, null],
    lead: [2, null, 4, 5, null, 4, 2, null],
    drums: 'soft', padType: 'sine', leadType: 'triangle', cut: [560, 3000],
  },
  stage4: {
    bpm: 126, root: 49, scale: PHRYGIAN,
    chords: [[0, 2, 4], [0, 2, 4], [3, 5, 0], [1, 3, 5]],
    arp: arpUp([0, 2, 4, 5]),
    bass: [0, 0, 0, null, 0, 0, 1, null],
    lead: [4, null, 3, null, 2, 1, null, 0],
    drums: 'full', padType: 'sawtooth', leadType: 'square', cut: [780, 4200],
  },
  boss: {
    bpm: 140, root: 53, scale: PHRYGIAN,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [3, 5, 0]],
    arp: arpUp([0, 2, 4, 6]),
    bass: [0, 0, 0, 0, 1, 1, 1, 1],
    lead: [4, null, 4, 3, null, 2, 1, null],
    drums: 'drive', padType: 'sawtooth', leadType: 'sawtooth', cut: [900, 5200],
  },
  finalBoss: {
    bpm: 152, root: 47, scale: PHRYGIAN,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [4, 6, 1]],
    arp: arpUp([0, 2, 3, 5]),
    bass: [0, 0, 0, 1, 0, 0, 1, 0],
    lead: [4, 4, 3, 3, 2, 1, 2, null],
    drums: 'drive', padType: 'sawtooth', leadType: 'square', cut: [1000, 6000],
  },
  victory: {
    bpm: 112, root: 60, scale: [0, 2, 4, 5, 7, 9, 11],
    chords: [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4]],
    arp: arpUp([0, 2, 4, 6]),
    bass: [0, null, 4, null, 3, null, 0, null],
    lead: [4, 4, 6, 6, 7, 7, 4, null],
    drums: 'soft', padType: 'triangle', leadType: 'triangle', cut: [900, 5000],
  },
  defeat: {
    bpm: 62, root: 45, scale: AEOLIAN,
    chords: [[0, 2, 4], [3, 5, 0], [1, 3, 5], [0, 2, 4]],
    arp: arpUp([0, 2, 4, 2]),
    bass: [0, null, null, null, 0, null, null, null],
    drums: 'none', padType: 'sine', leadType: 'sine', cut: [300, 1400],
  },
}

// ───────────────────────────── the engine ─────────────────────────────
class Audio {
  ctx: AudioContext | null = null
  private master!: GainNode
  private sfxBus!: GainNode
  private musicBus!: GainNode
  private musicFilter!: BiquadFilterNode
  private revSend!: GainNode
  private rev!: ConvolverNode
  private last: Record<string, number> = {}
  private noiseBuf: AudioBuffer | null = null
  private want = { master: 0.8, music: 0.7, sfx: 0.8 }
  private muffled = false
  private intensityVal = 0.35

  // sequencer state
  private track: Music | null = null
  private def: TrackDef | null = null
  private timer: number | null = null
  private nextTime = 0
  private step = 0
  private musicStart = 0
  private barGain!: GainNode

  unlock() {
    if (this.ctx) return void this.ctx.resume()
    const c = new AudioContext()
    this.ctx = c

    // master chain: everything goes through a gentle limiter so layered bursts never clip
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 12
    comp.ratio.value = 6
    comp.attack.value = 0.004
    comp.release.value = 0.18
    comp.connect(c.destination)

    this.master = c.createGain()
    this.master.connect(comp)

    this.sfxBus = c.createGain()
    this.sfxBus.connect(this.master)

    this.musicFilter = c.createBiquadFilter()
    this.musicFilter.type = 'lowpass'
    this.musicFilter.frequency.value = 18000
    this.musicFilter.Q.value = 0.4

    this.musicBus = c.createGain()
    this.musicBus.connect(this.musicFilter)
    this.musicFilter.connect(this.master)

    // a small synthetic room: exponentially decaying noise burst as the impulse response
    this.rev = c.createConvolver()
    this.rev.buffer = this.makeImpulse(c, 1.6, 2.6)
    this.revSend = c.createGain()
    this.revSend.gain.value = 0.16
    this.revSend.connect(this.rev)
    this.rev.connect(this.master)
    this.musicBus.connect(this.revSend)

    this.noiseBuf = this.makeNoise(c, 2)

    this.applyVolumes()
    if (this.track) this.startTrack(this.track)
  }

  private makeNoise(c: AudioContext, seconds: number) {
    const n = Math.floor(c.sampleRate * seconds)
    const b = c.createBuffer(1, n, c.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    return b
  }

  private makeImpulse(c: AudioContext, seconds: number, decay: number) {
    const n = Math.floor(c.sampleRate * seconds)
    const b = c.createBuffer(2, n, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch)
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay)
    }
    return b
  }

  // ───────────────────────────── voice primitives ─────────────────────────────
  /** one short oscillator with an exponential pitch and amplitude envelope */
  private tone(
    freq: number, dur: number, o: { type?: OscillatorType; vol?: number; to?: number; attack?: number; pan?: number; bus?: GainNode; detune?: number; filter?: [number, number]; q?: number } = {},
  ) {
    const c = this.ctx!
    const now = c.currentTime
    const g = c.createGain()
    const p = c.createStereoPanner()
    p.pan.value = o.pan ?? 0
    let node: AudioNode = g
    if (o.filter) {
      const f = c.createBiquadFilter()
      f.type = 'lowpass'
      f.Q.value = o.q ?? 1
      f.frequency.setValueAtTime(o.filter[0], now)
      f.frequency.exponentialRampToValueAtTime(Math.max(60, o.filter[1]), now + dur)
      g.connect(f)
      node = f
    }
    node.connect(p)
    p.connect(o.bus ?? this.sfxBus)

    const osc = c.createOscillator()
    osc.type = o.type ?? 'triangle'
    osc.frequency.setValueAtTime(Math.max(20, freq), now)
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), now + dur * 0.9)
    if (o.detune) osc.detune.value = o.detune
    const v = (o.vol ?? 0.3)
    const atk = o.attack ?? 0.004
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(v, now + atk)
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    osc.connect(g)
    osc.start(now)
    osc.stop(now + dur + 0.02)
  }

  /** filtered noise burst — impacts, hats, explosions, wind */
  private noise(dur: number, o: { vol?: number; hp?: number; lp?: number; q?: number; sweep?: [number, number]; type?: BiquadFilterType; pan?: number; bus?: GainNode; attack?: number } = {}) {
    const c = this.ctx!
    if (!this.noiseBuf) return
    const now = c.currentTime
    const src = c.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    src.playbackRate.value = 1

    const f = c.createBiquadFilter()
    f.type = o.type ?? 'bandpass'
    f.Q.value = o.q ?? 1
    const a = o.lp ?? o.sweep?.[0] ?? 2400
    f.frequency.setValueAtTime(a, now)
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweep[1]), now + dur)

    const g = c.createGain()
    const v = o.vol ?? 0.25
    const atk = o.attack ?? 0.003
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(v, now + atk)
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    const p = c.createStereoPanner()
    p.pan.value = o.pan ?? 0

    src.connect(f)
    f.connect(g)
    g.connect(p)
    p.connect(o.bus ?? this.sfxBus)
    src.start(now)
    src.stop(now + dur + 0.02)
  }

  /** a quick upward or downward frequency glide */
  private glide(from: number, to: number, dur: number, o: { type?: OscillatorType; vol?: number; pan?: number } = {}) {
    this.tone(from, dur, { to, type: o.type ?? 'sine', vol: o.vol ?? 0.22, pan: o.pan })
  }

  // ───────────────────────────── sound effects ─────────────────────────────
  sfx(name: Sfx, o: SfxOpts = {}) {
    const c = this.ctx
    // schedule even while the context is briefly 'suspended' (the first frame after unlock, before
    // resume() resolves) — WebAudio queues those events until the clock starts. Only 'closed' is final.
    if (!c || c.state === 'closed') return
    const now = c.currentTime
    if (now - (this.last[name] ?? 0) < 0.022) return
    this.last[name] = now
    const v = o.vol ?? 1
    const pitch = o.pitch ?? 1
    const pan = clamp(o.pan ?? 0, -1, 1)

    switch (name) {
      // ── weapons ──
      case 'shoot':
        this.tone(880 * pitch, 0.075, { type: 'square', vol: 0.16 * v, to: 420 * pitch, pan, filter: [4200, 900] })
        this.noise(0.05, { vol: 0.07 * v, sweep: [5200, 1800], q: 0.9, pan })
        break
      case 'shootHeavy':
        this.tone(220 * pitch, 0.16, { type: 'sawtooth', vol: 0.22 * v, to: 90 * pitch, pan, filter: [1800, 300] })
        this.noise(0.14, { vol: 0.12 * v, sweep: [2200, 240], q: 0.7, pan })
        break
      case 'laser':
        this.tone(1600 * pitch, 0.18, { type: 'sawtooth', vol: 0.14 * v, to: 320 * pitch, pan, filter: [7000, 800], q: 6 })
        this.tone(2400 * pitch, 0.1, { type: 'sine', vol: 0.08 * v, to: 900 * pitch, pan })
        break
      case 'beam':
        this.tone(320 * pitch, 0.3, { type: 'sawtooth', vol: 0.13 * v, to: 1600 * pitch, pan, filter: [1200, 6000], q: 8 })
        this.noise(0.26, { vol: 0.07 * v, sweep: [800, 6000], q: 3, pan })
        break
      case 'slash':
        this.noise(0.11, { vol: 0.2 * v, sweep: [1200, 7000], q: 2.2, pan })
        this.tone(1200 * pitch, 0.08, { type: 'triangle', vol: 0.09 * v, to: 300, pan })
        break
      case 'pulse':
        this.tone(180 * pitch, 0.22, { type: 'sine', vol: 0.3 * v, to: 60 * pitch, pan })
        this.noise(0.16, { vol: 0.08 * v, sweep: [700, 140], q: 0.8, pan })
        break
      case 'whip':
        this.noise(0.16, { vol: 0.3 * v, sweep: [400, 5600], q: 2.2, pan })
        this.tone(900 * pitch, 0.09, { type: 'triangle', vol: 0.06 * v, to: 300, pan })
        break
      case 'spore':
        this.noise(0.24, { vol: 0.1 * v, sweep: [400, 2200], q: 0.6, pan, attack: 0.04 })
        this.tone(320 * pitch, 0.2, { type: 'sine', vol: 0.06 * v, to: 420, pan })
        break
      case 'plant':
        this.tone(180 * pitch, 0.13, { type: 'triangle', vol: 0.16 * v, to: 320, pan })
        this.noise(0.1, { vol: 0.06 * v, sweep: [600, 1800], q: 1.2, pan })
        break
      case 'turret':
        this.tone(660 * pitch, 0.06, { type: 'square', vol: 0.13 * v, to: 990 * pitch, pan })
        break
      case 'drone':
        this.tone(300 * pitch, 0.14, { type: 'square', vol: 0.11 * v, to: 640 * pitch, pan, filter: [2600, 600] })
        this.tone(600 * pitch, 0.1, { type: 'sine', vol: 0.05 * v, to: 1200 * pitch, pan })
        break
      case 'orbit':
        this.tone(520 * pitch, 0.1, { type: 'triangle', vol: 0.08 * v, to: 780 * pitch, pan, detune: 8 })
        break
      case 'shard':
        this.tone(1800 * pitch, 0.07, { type: 'triangle', vol: 0.11 * v, to: 2600 * pitch, pan })
        this.noise(0.05, { vol: 0.05 * v, sweep: [6000, 3000], q: 2, pan })
        break
      case 'mortar':
        this.tone(120 * pitch, 0.2, { type: 'sine', vol: 0.24 * v, to: 220 * pitch, pan })
        this.noise(0.2, { vol: 0.1 * v, sweep: [500, 2200], q: 0.7, pan })
        break

      // ── impacts ──
      case 'hit':
        this.noise(0.045, { vol: 0.1 * v, sweep: [3200, 1200], q: 1.4, pan })
        break
      case 'crit':
        this.noise(0.08, { vol: 0.16 * v, sweep: [6000, 1500], q: 1.2, pan })
        this.tone(1400 * pitch, 0.1, { type: 'square', vol: 0.1 * v, to: 2600, pan })
        break
      case 'explode':
        this.noise(0.3, { vol: 0.26 * v, sweep: [1800, 90], q: 0.5, pan, type: 'lowpass' })
        this.tone(90 * pitch, 0.26, { type: 'sine', vol: 0.24 * v, to: 40, pan })
        break
      case 'explodeBig':
        this.noise(0.62, { vol: 0.34 * v, sweep: [2600, 60], q: 0.4, pan, type: 'lowpass' })
        this.tone(70 * pitch, 0.55, { type: 'sine', vol: 0.32 * v, to: 28, pan })
        this.tone(140 * pitch, 0.3, { type: 'triangle', vol: 0.12 * v, to: 50, pan })
        break
      case 'zap':
        this.noise(0.13, { vol: 0.16 * v, sweep: [7000, 2400], q: 5, pan })
        this.tone(2200 * pitch, 0.1, { type: 'square', vol: 0.09 * v, to: 600, pan })
        break
      case 'freeze':
        this.tone(2400 * pitch, 0.28, { type: 'sine', vol: 0.13 * v, to: 3600, pan })
        this.tone(3200 * pitch, 0.22, { type: 'triangle', vol: 0.07 * v, to: 1800, pan })
        this.noise(0.18, { vol: 0.05 * v, sweep: [8000, 4000], q: 4, pan })
        break
      case 'shatter':
        this.noise(0.26, { vol: 0.19 * v, sweep: [9000, 3000], q: 3, pan })
        for (let i = 0; i < 3; i++) this.tone(2600 * pitch * (1 + i * 0.4), 0.1, { type: 'sine', vol: 0.05 * v, to: 4200, pan })
        break
      case 'burn':
        this.noise(0.32, { vol: 0.13 * v, sweep: [900, 2600], q: 0.8, pan, attack: 0.03 })
        break
      case 'void':
        this.tone(140 * pitch, 0.42, { type: 'sine', vol: 0.2 * v, to: 40, pan })
        this.tone(280 * pitch, 0.4, { type: 'triangle', vol: 0.1 * v, to: 90, pan, detune: -14 })
        this.noise(0.4, { vol: 0.07 * v, sweep: [400, 80], q: 2, pan })
        break

      // ── enemies ──
      case 'enemyDie':
        this.noise(0.16, { vol: 0.14 * v, sweep: [2400, 300], q: 1, pan })
        this.tone(420 * pitch, 0.14, { type: 'triangle', vol: 0.1 * v, to: 120, pan })
        break
      case 'eliteDie':
        this.noise(0.4, { vol: 0.24 * v, sweep: [3600, 200], q: 0.8, pan })
        this.tone(180 * pitch, 0.36, { type: 'sawtooth', vol: 0.16 * v, to: 50, pan })
        break
      case 'enemyShoot':
        this.tone(300 * pitch, 0.09, { type: 'square', vol: 0.07 * v, to: 520, pan })
        break
      case 'charge':
        this.tone(120 * pitch, 0.5, { type: 'sawtooth', vol: 0.1 * v, to: 900 * pitch, pan, filter: [400, 4000], q: 5 })
        break
      case 'teleport':
        this.glide(1600 * pitch, 220, 0.2, { type: 'sine', vol: 0.13 * v, pan })
        this.noise(0.16, { vol: 0.06 * v, sweep: [4000, 500], q: 2, pan })
        break
      case 'spawn':
        this.glide(90 * pitch, 380 * pitch, 0.22, { type: 'triangle', vol: 0.09 * v, pan })
        break
      case 'bossWarn':
        this.tone(58, 1.1, { type: 'sawtooth', vol: 0.22 * v, to: 44, filter: [300, 90], q: 3 })
        this.tone(87, 1.1, { type: 'square', vol: 0.1 * v, to: 66, filter: [400, 120], q: 2 })
        break
      case 'bossRoar':
        this.noise(0.9, { vol: 0.24 * v, sweep: [700, 90], q: 0.6, type: 'lowpass' })
        this.tone(62, 0.85, { type: 'sawtooth', vol: 0.22 * v, to: 40, filter: [500, 80], q: 4 })
        this.tone(93, 0.8, { type: 'square', vol: 0.1 * v, to: 60, filter: [600, 100], q: 3 })
        break
      case 'bossDie':
        this.noise(1.5, { vol: 0.34 * v, sweep: [3000, 40], q: 0.35, type: 'lowpass' })
        this.tone(70, 1.4, { type: 'sine', vol: 0.3 * v, to: 24 })
        this.tone(140, 1.0, { type: 'sawtooth', vol: 0.14 * v, to: 30, filter: [900, 60], q: 3 })
        break
      case 'bossPhase':
        this.tone(200, 0.55, { type: 'square', vol: 0.16 * v, to: 520, filter: [1200, 5000], q: 6 })
        this.noise(0.5, { vol: 0.13 * v, sweep: [600, 5000], q: 1.4 })
        break

      // ── player ──
      case 'hurt':
        this.tone(260 * pitch, 0.18, { type: 'sawtooth', vol: 0.24 * v, to: 70, filter: [1800, 300], q: 2 })
        this.noise(0.14, { vol: 0.13 * v, sweep: [2000, 300], q: 0.8 })
        break
      case 'heal':
        this.tone(660 * pitch, 0.26, { type: 'sine', vol: 0.13 * v, to: 990, pan })
        this.tone(880 * pitch, 0.3, { type: 'sine', vol: 0.09 * v, to: 1320, pan })
        break
      case 'dash':
        this.noise(0.18, { vol: 0.16 * v, sweep: [400, 5000], q: 1.1, pan })
        this.tone(300 * pitch, 0.12, { type: 'sine', vol: 0.07 * v, to: 900, pan })
        break
      case 'xp':
        this.tone(1200 * pitch, 0.05, { type: 'sine', vol: 0.06 * v, to: 1800, pan })
        break
      case 'lumen':
        this.tone(1500 * pitch, 0.09, { type: 'sine', vol: 0.08 * v, to: 2200, pan })
        this.tone(2250 * pitch, 0.07, { type: 'sine', vol: 0.04 * v, to: 3000, pan })
        break
      case 'pickup':
        this.tone(900 * pitch, 0.06, { type: 'triangle', vol: 0.08 * v, to: 1300, pan })
        break
      case 'magnet':
        this.tone(200 * pitch, 0.3, { type: 'sine', vol: 0.12 * v, to: 800, pan })
        this.noise(0.28, { vol: 0.07 * v, sweep: [300, 3000], q: 2, pan })
        break
      case 'bomb':
        this.noise(0.5, { vol: 0.28 * v, sweep: [2400, 60], q: 0.4, type: 'lowpass' })
        this.tone(80, 0.45, { type: 'sine', vol: 0.26 * v, to: 30 })
        break
      case 'levelUp':
        ;[0, 4, 7, 12].forEach((s, i) => this.tone(hz(72 + s), 0.34 - i * 0.03, { type: 'triangle', vol: 0.13 * v, attack: 0.01 }));
        break
      case 'chest':
        ;[0, 5, 9, 12, 16].forEach((s, i) => this.tone(hz(74 + s), 0.4, { type: 'sine', vol: 0.1 * v, attack: 0.01 }));
        break
      case 'fusion':
        this.tone(120, 0.5, { type: 'sawtooth', vol: 0.16 * v, to: 1200, filter: [500, 6000], q: 5 })
        ;[0, 7, 12, 19].forEach((s, i) => this.tone(hz(64 + s), 0.6 - i * 0.05, { type: 'triangle', vol: 0.09 * v, attack: 0.02 }));
        break
      case 'overdriveReady':
        this.tone(880, 0.16, { type: 'sine', vol: 0.1 * v, to: 1320 })
        this.tone(1320, 0.22, { type: 'sine', vol: 0.06 * v, to: 1760 })
        break
      case 'overdrive':
        this.noise(0.7, { vol: 0.28 * v, sweep: [200, 8000], q: 0.5, attack: 0.02 })
        this.tone(60, 0.7, { type: 'sine', vol: 0.3 * v, to: 180 })
        ;[0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(hz(60 + s), 0.5, { type: 'triangle', vol: 0.07 * v, attack: 0.02 + i * 0.02 }))
        break
      case 'revive':
        ;[0, 5, 12, 17, 24].forEach((s, i) => this.tone(hz(67 + s), 0.7 - i * 0.06, { type: 'sine', vol: 0.11 * v, attack: 0.02 }))
        break
      case 'death':
        this.tone(220, 1.1, { type: 'sawtooth', vol: 0.22 * v, to: 40, filter: [2000, 120], q: 3 })
        this.noise(1.0, { vol: 0.16 * v, sweep: [1200, 60], q: 0.5, type: 'lowpass' })
        break

      // ── ui ──
      case 'uiMove':
        this.tone(880 * pitch, 0.04, { type: 'sine', vol: 0.06 * v })
        break
      case 'uiSelect':
        this.tone(660 * pitch, 0.06, { type: 'triangle', vol: 0.1 * v, to: 990 })
        break
      case 'uiBack':
        this.tone(520 * pitch, 0.07, { type: 'triangle', vol: 0.09 * v, to: 340 })
        break
      case 'uiDeny':
        this.tone(180 * pitch, 0.12, { type: 'square', vol: 0.1 * v, to: 120 })
        break
      case 'purchase':
        this.tone(990 * pitch, 0.09, { type: 'triangle', vol: 0.12 * v })
        this.tone(1320 * pitch, 0.12, { type: 'sine', vol: 0.09 * v, to: 1760 })
        break
      case 'unlock':
        ;[0, 4, 7, 11].forEach((s, i) => this.tone(hz(69 + s), 0.3, { type: 'triangle', vol: 0.1 * v, attack: 0.01 + i * 0.03 }))
        break
      case 'achievement':
        ;[0, 7, 12, 16, 19].forEach((s, i) => this.tone(hz(72 + s), 0.36, { type: 'sine', vol: 0.09 * v, attack: 0.01 + i * 0.035 }))
        break
      case 'victory':
        ;[0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(hz(60 + s), 0.8, { type: 'triangle', vol: 0.11 * v, attack: 0.01 + i * 0.05 }))
        break
      case 'defeat':
        ;[0, -3, -7, -12].forEach((s, i) => this.tone(hz(57 + s), 1.0, { type: 'sine', vol: 0.12 * v, attack: 0.02 + i * 0.08 }))
        break
    }
  }

  // ───────────────────────────── music ─────────────────────────────
  /** pick a track; `null` fades the current one out */
  music(track: Music | null) {
    if (this.track === track) return
    this.track = track
    if (!this.ctx) return
    this.startTrack(track)
  }

  private startTrack(track: Music | null) {
    const c = this.ctx!
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (!track) {
      this.def = null
      return
    }
    const def = (this.def = TRACKS[track])
    this.step = 0
    this.musicStart = c.currentTime + 0.1
    this.nextTime = this.musicStart

    // a short fade-in so a track change never clicks
    const fade = c.createGain()
    fade.gain.setValueAtTime(0.0001, c.currentTime)
    fade.gain.exponentialRampToValueAtTime(1, c.currentTime + 0.7)
    fade.connect(this.musicBus)
    this.barGain = fade
    this.nextTime = c.currentTime + 0.08

    const stepDur = 60 / def.bpm / 4
    this.timer = setInterval(() => this.schedule(), 40) as unknown as number
    // schedule the first couple of steps immediately
    for (let i = 0; i < 4; i++) this.playStep(this.nextTime + i * stepDur)
    this.nextTime += 4 * stepDur
  }

  private schedule() {
    const c = this.ctx
    const def = this.def
    if (!c || !def) return
    const stepDur = 60 / def.bpm / 4
    while (this.nextTime < c.currentTime + 0.25) {
      this.playStep(this.nextTime)
      this.nextTime += stepDur
    }
  }

  /** one 16th-note step of the current track */
  private playStep(t: number) {
    const c = this.ctx
    const def = this.def
    if (!c || !def) return
    const s = this.step++ % 16
    const bar = Math.floor(this.step / 16) % def.chords.length
    const chord = def.chords[bar]
    const inten = this.intensityVal
    const [c0, c1] = def.cut
    const cut = c0 + (c1 - c0) * inten
    const note = (deg: number, oct = 0) => hz(def.root + (def.scale[((deg % 7) + 7) % 7] ?? 0) + 12 * (oct + Math.floor(deg / 7)))

    const bus = this.barGain ?? this.musicBus
    const when = Math.max(0, t - c.currentTime)

    // ── pad: one long chord per bar, very quiet, holds the harmony
    if (s === 0) {
      for (const d of chord) {
        const o = c.createOscillator()
        const g = c.createGain()
        const f = c.createBiquadFilter()
        f.type = 'lowpass'
        f.frequency.value = cut * 0.55
        f.Q.value = 0.6
        o.type = def.padType
        o.frequency.value = note(d, -1)
        o.detune.value = (Math.random() - 0.5) * 14
        g.gain.setValueAtTime(0.0001, c.currentTime + when)
        g.gain.linearRampToValueAtTime(0.035, c.currentTime + when + 0.5)
        g.gain.linearRampToValueAtTime(0.0001, c.currentTime + when + (60 / def.bpm) * 4)
        o.connect(f).connect(g).connect(bus)
        o.start(c.currentTime + when)
        o.stop(c.currentTime + when + (60 / def.bpm) * 4 + 0.1)
      }
    }

    // ── bass: eighth notes
    if (s % 2 === 0) {
      const d = def.bass[(s / 2) % def.bass.length]
      if (d !== null) {
        const o = c.createOscillator()
        const g = c.createGain()
        o.type = 'triangle'
        o.frequency.value = note(d, -2)
        const dur = (60 / def.bpm) * 0.55
        g.gain.setValueAtTime(0.0001, c.currentTime + when)
        g.gain.exponentialRampToValueAtTime(0.1 + inten * 0.05, c.currentTime + when + 0.012)
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur)
        o.connect(g).connect(bus)
        o.start(c.currentTime + when)
        o.stop(c.currentTime + when + dur + 0.02)
      }
    }

    // ── arp: the lead layer, comes in with intensity
    if (def.arp[s] !== null && inten > 0.18) {
      const d = def.arp[s] as number
      const o = c.createOscillator()
      const g = c.createGain()
      const f = c.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = cut
      f.Q.value = 3
      o.type = def.leadType
      o.frequency.value = note(d + chord[0], 0)
      const dur = (60 / def.bpm) * 0.4
      const amp = (0.045 + inten * 0.045) * (s % 4 === 0 ? 1.25 : 0.8)
      g.gain.setValueAtTime(0.0001, c.currentTime + when)
      g.gain.exponentialRampToValueAtTime(amp, c.currentTime + when + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur)
      o.connect(f).connect(g).connect(bus)
      o.start(c.currentTime + when)
      o.stop(c.currentTime + when + dur + 0.02)
    }

    // ── lead melody in the second half of the loop, high intensity only
    if (def.lead && inten > 0.55 && s % 2 === 0) {
      const d = def.lead[(s / 2) % def.lead.length]
      if (d !== null) {
        const o = c.createOscillator()
        const g = c.createGain()
        o.type = def.leadType
        o.frequency.value = note(d + chord[0], 1)
        const dur = (60 / def.bpm) * 0.7
        g.gain.setValueAtTime(0.0001, c.currentTime + when)
        g.gain.exponentialRampToValueAtTime(0.03 * inten, c.currentTime + when + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur)
        o.connect(g).connect(bus)
        o.start(c.currentTime + when)
        o.stop(c.currentTime + when + dur + 0.02)
      }
    }

    // ── drums
    if (def.drums !== 'none') {
      const kick = s % 4 === 0 || (def.drums === 'drive' && s === 14)
      const snare = s === 4 || s === 12
      const hat = s % 2 === 1 && (def.drums === 'full' || def.drums === 'drive')
      if (kick) this.drum('kick', when, 0.24 + inten * 0.1)
      if (snare && (def.drums === 'full' || def.drums === 'drive')) this.drum('snare', when, 0.12 + inten * 0.08)
      if (hat) this.drum('hat', when, 0.035 + inten * 0.03)
    }
  }

  private drum(kind: 'kick' | 'snare' | 'hat', when: number, vol: number) {
    const c = this.ctx
    if (!c) return
    const t = c.currentTime + when
    if (kind === 'kick') {
      const o = c.createOscillator(), g = c.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(140, t)
      o.frequency.exponentialRampToValueAtTime(42, t + 0.11)
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
      o.connect(g).connect(this.barGain ?? this.musicBus)
      o.start(t)
      o.stop(t + 0.22)
      return
    }
    if (!this.noiseBuf) return
    const src = c.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = c.createBiquadFilter()
    f.type = kind === 'snare' ? 'bandpass' : 'highpass'
    f.frequency.value = kind === 'snare' ? 1900 : 7200
    f.Q.value = kind === 'snare' ? 0.9 : 0.7
    const g = c.createGain()
    const dur = kind === 'snare' ? 0.13 : 0.045
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.barGain ?? this.musicBus)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  /** 0..1 — drives how many layers of the track play and how bright it is */
  intensity(x: number) {
    this.intensityVal = clamp(x, 0, 1)
  }

  /** duck the music behind menus / pause */
  muffle(on: boolean) {
    if (!this.ctx || this.muffled === on) return
    this.muffled = on
    const f = this.musicFilter.frequency
    f.cancelScheduledValues(this.ctx.currentTime)
    f.setTargetAtTime(on ? 620 : 18000, this.ctx.currentTime, 0.12)
  }

  volumes(master: number, music: number, sfx: number) {
    this.want = { master, music, sfx }
    this.applyVolumes()
  }

  private applyVolumes() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.want.master, t, 0.05)
    // music sits under the effects: a touch louder than SFX because its RMS is much lower than transient hits
    this.musicBus.gain.setTargetAtTime(this.want.music * 1.15, t, 0.05)
    this.sfxBus.gain.setTargetAtTime(this.want.sfx, t, 0.05)
  }

  /** 0..1 phase within the current bar (for visual pulsing) */
  beat() {
    const c = this.ctx
    const def = this.def
    if (!c || !def || this.track === null) return 0
    const bar = (60 / def.bpm) * 4
    const t = c.currentTime - this.musicStart
    if (t < 0) return 0
    return (t % bar) / bar
  }

  /** Diagnostics for automated tests and the debug overlay: what is playing right now. */
  debugState() {
    return { track: this.track, intensity: this.intensityVal, muffled: this.muffled, running: this.ctx?.state === 'running', contextState: this.ctx?.state ?? 'none' }
  }

  /** Bypass the per-name rate-limiter (tests fire each sound once in a burst). */
  resetGate(name: Sfx) {
    delete this.last[name]
  }

  /** Test-only tap on the master output so a test can measure real signal. */
  tapMaster(): AnalyserNode | null {
    if (!this.ctx) return null
    const an = this.ctx.createAnalyser()
    an.fftSize = 2048
    this.master.connect(an)
    return an
  }
}

export const audio = new Audio()
