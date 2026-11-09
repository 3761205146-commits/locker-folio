export type MidiNote = { midi: number; start: number; end: number }

function readVar(view: DataView, at: { value: number }) {
  let value = 0
  let byte = 0
  do { byte = view.getUint8(at.value++); value = (value << 7) | (byte & 0x7f) } while (byte & 0x80)
  return value
}

export function parseUnrealMidi(data: ArrayBuffer): MidiNote[] {
  const view = new DataView(data)
  const position = { value: 0 }
  const tag = () => String.fromCharCode(view.getUint8(position.value++), view.getUint8(position.value++), view.getUint8(position.value++), view.getUint8(position.value++))
  if (tag() !== 'MThd') throw new Error('Unsupported MIDI header')
  const headerLength = view.getUint32(position.value); position.value += 4
  position.value += 2
  const tracks = view.getUint16(position.value); position.value += 2
  const division = view.getUint16(position.value); position.value += 2 + Math.max(0, headerLength - 6)
  if (division & 0x8000) throw new Error('SMPTE MIDI timing is not supported')

  const tempos: { tick: number; tempo: number }[] = [{ tick: 0, tempo: 500000 }]
  const raw: { midi: number; startTick: number; endTick: number }[] = []
  for (let track = 0; track < tracks; track += 1) {
    if (tag() !== 'MTrk') throw new Error('Invalid MIDI track')
    const length = view.getUint32(position.value); position.value += 4
    const end = position.value + length
    let tick = 0; let running = 0
    const active = new Map<string, number[]>()
    while (position.value < end) {
      tick += readVar(view, position)
      let status = view.getUint8(position.value++)
      if (status < 0x80) { position.value -= 1; status = running } else running = status
      if (status === 0xff) {
        const type = view.getUint8(position.value++); const length = readVar(view, position)
        if (type === 0x51 && length === 3) tempos.push({ tick, tempo: (view.getUint8(position.value) << 16) | (view.getUint8(position.value + 1) << 8) | view.getUint8(position.value + 2) })
        position.value += length
      } else if (status === 0xf0 || status === 0xf7) position.value += readVar(view, position)
      else {
        const type = status & 0xf0; const channel = status & 0x0f; const midi = view.getUint8(position.value++); const velocity = type === 0xc0 || type === 0xd0 ? 0 : view.getUint8(position.value++)
        if (type === 0x90 && velocity > 0) { const key = `${channel}:${midi}`; active.set(key, [...(active.get(key) ?? []), tick]) }
        if (type === 0x80 || (type === 0x90 && velocity === 0)) {
          const key = `${channel}:${midi}`; const starts = active.get(key); const startTick = starts?.shift()
          if (startTick !== undefined) raw.push({ midi, startTick, endTick: tick })
        }
      }
    }
  }
  tempos.sort((a, b) => a.tick - b.tick)
  const toSeconds = (tick: number) => {
    let seconds = 0; let previous = 0; let tempo = 500000
    for (const change of tempos) {
      if (change.tick > tick) break
      seconds += (change.tick - previous) * tempo / division / 1_000_000
      previous = change.tick; tempo = change.tempo
    }
    return seconds + (tick - previous) * tempo / division / 1_000_000
  }
  return raw.map((note) => ({ midi: note.midi, start: toSeconds(note.startTick), end: toSeconds(note.endTick) }))
}
