export type CrunchKind = 'light' | 'crunch' | 'rapid' | 'chips'

/** Original synthesis: overlapping irregular brittle micro-fractures, filtered
 * noise and short, inharmonic resonances. No recordings or third-party samples. */
export function synthesizeCrunch(kind: CrunchKind, sampleRate: number, seed = 1): Float32Array {
  let randomState = seed >>> 0
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296 }
  const duration = kind === 'chips' ? 0.12 : kind === 'light' ? 0.16 : 0.29
  const samples = new Float32Array(Math.ceil(sampleRate * duration))
  const count = kind === 'chips' ? 5 : kind === 'light' ? 3 : kind === 'rapid' ? 29 : 21
  for (let fracture = 0; fracture < count; fracture++) {
    const start = Math.floor((fracture === 0 ? 0 : random() ** 1.8 * duration * 0.73) * sampleRate)
    const length = Math.floor((0.006 + random() * 0.025) * sampleRate)
    const frequency = 1600 + random() * 6400
    const loudness = (0.18 + random() * 0.5) * (kind === 'chips' ? 0.22 : 1)
    let previousNoise = 0
    for (let i = 0; i < length && start + i < samples.length; i++) {
      const t = i / sampleRate, noise = random() * 2 - 1
      const high = noise - previousNoise * 0.65; previousNoise = noise
      const envelope = Math.min(1, t / 0.00035) * Math.exp(-t * (180 + fracture % 3 * 65))
      const resonance = Math.sin(t * Math.PI * 2 * frequency) * 0.32 + Math.sin(t * Math.PI * 2 * frequency * 1.71) * 0.12
      samples[start + i] += (high * 0.75 + resonance) * envelope * loudness
    }
  }
  for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(samples[i] * 1.2) * 0.65
  return samples
}

export class WorkshopAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private buffers = new Map<CrunchKind, AudioBuffer[]>()
  private voices: { source: AudioBufferSourceNode; gain: GainNode; at: number }[] = []
  private sequence = 0
  private closed = false
  private muted = false

  activate() { this.closed = false }
  /** Called only by user gestures; opens silently to remove first-press latency. */
  unlock() {
    if (this.closed || this.muted) return
    if (!this.context) {
      try {
        const context = new AudioContext({ latencyHint: 'interactive' })
        this.context = context
        const master = context.createGain(); master.gain.value = 0.65
        const filter = context.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 650
        const limiter = context.createDynamicsCompressor(); limiter.threshold.value = -16; limiter.ratio.value = 4; limiter.attack.value = 0.002; limiter.release.value = 0.08
        master.connect(filter); filter.connect(limiter); limiter.connect(context.destination)
        this.master = master
        for (const kind of ['light', 'crunch', 'rapid', 'chips'] as const) {
          this.buffers.set(kind, [0, 1, 2].map((variant) => {
            const data = synthesizeCrunch(kind, context.sampleRate, 179 + variant * 977 + kind.length * 31)
            const buffer = context.createBuffer(1, data.length, context.sampleRate)
            buffer.copyToChannel(new Float32Array(data), 0)
            return buffer
          }))
        }
      } catch { return }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
  }
  play(kind: CrunchKind, strength = 0.65, delay = 0) {
    if (this.closed || this.muted) return
    this.unlock()
    const context = this.context, master = this.master
    if (!context || !master || context.state === 'closed') return
    const variants = this.buffers.get(kind)
    if (!variants) return
    // A bounded pool keeps rapid tapping from growing the audio graph.
    while (this.voices.length >= 12) {
      const oldest = this.voices.shift()!
      oldest.source.stop(); oldest.source.disconnect(); oldest.gain.disconnect()
    }
    const source = context.createBufferSource(), gain = context.createGain()
    source.buffer = variants[this.sequence++ % variants.length]
    source.playbackRate.value = 0.94 + (this.sequence % 5) * 0.035
    gain.gain.value = 0.3 + Math.max(0, Math.min(1, strength)) * 0.65
    source.connect(gain); gain.connect(master)
    const voice = { source, gain, at: context.currentTime + delay }; this.voices.push(voice)
    source.onended = () => {
      source.disconnect(); gain.disconnect()
      const index = this.voices.indexOf(voice)
      if (index !== -1) this.voices.splice(index, 1)
    }
    // Schedule in this gesture's audio quantum, never through a timeout/frame.
    source.start(voice.at)
    return voice
  }
  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.65, this.context.currentTime, 0.008)
    if (!muted) this.unlock()
  }
  pause() { for (const voice of this.voices) voice.source.stop(); if (this.context?.state === 'running') void this.context.suspend().catch(() => {}) }
  dispose() {
    this.closed = true
    for (const voice of this.voices) { voice.source.onended = null; voice.source.stop(); voice.source.disconnect(); voice.gain.disconnect() }
    this.voices = []; this.buffers.clear(); this.master?.disconnect()
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {})
    this.context = null; this.master = null
  }
}
