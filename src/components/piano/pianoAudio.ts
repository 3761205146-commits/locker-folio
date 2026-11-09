type Voice = { gain: GainNode; oscillators: OscillatorNode[] }

let context: AudioContext | null = null
let master: GainNode | null = null
let volume = 0.48
const voices = new Map<number, Voice>()

function getContext() {
  if (context) return context
  context = new AudioContext()
  master = context.createGain()
  master.gain.value = volume
  master.connect(context.destination)
  return context
}

function frequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function setPianoVolume(next: number) {
  volume = next
  if (master && context) master.gain.setTargetAtTime(next, context.currentTime, 0.025)
}

export function playPianoNote(midi: number) {
  if (voices.has(midi)) return
  const audio = getContext()
  void audio.resume()
  const gain = audio.createGain()
  const now = audio.currentTime
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.018)
  gain.gain.exponentialRampToValueAtTime(0.11, now + 0.14)
  gain.connect(master!)

  const primary = audio.createOscillator()
  primary.type = 'triangle'
  primary.frequency.value = frequency(midi)
  const sparkle = audio.createOscillator()
  sparkle.type = 'sine'
  sparkle.frequency.value = frequency(midi) * 2
  const sparkleGain = audio.createGain()
  sparkleGain.gain.value = 0.12
  primary.connect(gain)
  sparkle.connect(sparkleGain).connect(gain)
  primary.start(now)
  sparkle.start(now)
  voices.set(midi, { gain, oscillators: [primary, sparkle] })
}

export function stopPianoNote(midi: number) {
  const voice = voices.get(midi)
  if (!voice || !context) return
  const now = context.currentTime
  voice.gain.gain.cancelScheduledValues(now)
  voice.gain.gain.setTargetAtTime(0.0001, now, 0.045)
  window.setTimeout(() => {
    voice.oscillators.forEach((oscillator) => oscillator.stop())
    voice.gain.disconnect()
  }, 180)
  voices.delete(midi)
}

export function stopAllPianoNotes() {
  Array.from(voices.keys()).forEach(stopPianoNote)
}

export function disposePianoAudio() {
  stopAllPianoNotes()
  if (context) void context.close()
  context = null
  master = null
}
