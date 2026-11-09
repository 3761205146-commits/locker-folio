import { useEffect, useRef } from 'react'

export type PianoKey = { midi: number; label?: string; black?: boolean }

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11]
const WHITE_LABELS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Q', 'R', 'I', 'O']
const BLACK_LABELS: Record<number, string> = { 0: 'W', 1: 'E', 3: 'T', 4: 'Y', 5: 'U', 7: '2', 8: '3', 10: '5', 11: '6', 12: '7' }

export const WHITE_KEYS: PianoKey[] = Array.from({ length: 24 }, (_, index) => ({
  midi: 60 + Math.floor(index / 7) * 12 + WHITE_STEPS[index % 7],
  label: WHITE_LABELS[index],
}))

export const BLACK_KEYS: (PianoKey & { after: number })[] = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map((after) => ({
  midi: WHITE_KEYS[after].midi + 1,
  label: BLACK_LABELS[after],
  black: true,
  after,
}))

export const KEY_TO_MIDI = Object.fromEntries([...WHITE_KEYS, ...BLACK_KEYS].filter((key) => key.label).map((key) => [key.label!.toLowerCase(), key.midi]))

type Props = {
  activeNotes: Set<number>
  onStart: (midi: number) => void
  onStop: (midi: number) => void
}

export default function PianoKeyboard({ activeNotes, onStart, onStop }: Props) {
  const pointers = useRef(new Map<number, number>())
  const noteAt = (x: number, y: number) => {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-midi]')
    return target ? Number(target.dataset.midi) : null
  }
  const start = (pointerId: number, midi: number) => {
    if (pointers.current.get(pointerId) === midi) return
    const previous = pointers.current.get(pointerId)
    if (previous !== undefined) onStop(previous)
    pointers.current.set(pointerId, midi)
    onStart(midi)
  }
  const finish = (pointerId: number) => {
    const midi = pointers.current.get(pointerId)
    if (midi === undefined) return
    pointers.current.delete(pointerId)
    onStop(midi)
  }

  useEffect(() => {
    const finishOutside = (event: PointerEvent) => finish(event.pointerId)
    window.addEventListener('pointerup', finishOutside)
    window.addEventListener('pointercancel', finishOutside)
    return () => {
      window.removeEventListener('pointerup', finishOutside)
      window.removeEventListener('pointercancel', finishOutside)
    }
  })

  return (
    <div
      className="piano-keys"
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId)) return
        const midi = noteAt(event.clientX, event.clientY)
        if (midi !== null) start(event.pointerId, midi)
      }}
      onPointerUp={(event) => finish(event.pointerId)}
      onPointerCancel={(event) => finish(event.pointerId)}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse' && event.buttons === 0) finish(event.pointerId) }}
    >
      <div className="piano-whites">
        {WHITE_KEYS.map((key) => <button key={key.midi} type="button" data-midi={key.midi} className={`piano-key piano-key--white${activeNotes.has(key.midi) ? ' is-active' : ''}`} onPointerDown={(event) => { event.preventDefault(); start(event.pointerId, key.midi) }}><span>{key.label}</span></button>)}
      </div>
      {BLACK_KEYS.map((key) => <button key={key.midi} type="button" data-midi={key.midi} className={`piano-key piano-key--black${activeNotes.has(key.midi) ? ' is-active' : ''}`} style={{ left: `${((key.after + 1) / 24) * 100}%` }} onPointerDown={(event) => { event.preventDefault(); start(event.pointerId, key.midi) }}><span>{key.label}</span></button>)}
    </div>
  )
}
