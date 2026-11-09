import { useEffect, useRef, useState } from 'react'
import PianoKeyboard, { KEY_TO_MIDI } from './PianoKeyboard'
import { playPianoNote, setPianoVolume, stopAllPianoNotes, stopPianoNote } from './pianoAudio'
import { usePianoStore } from './pianoStore'
import './piano.css'

const HAPPY_BIRTHDAY = [60, 60, 62, 60, 65, 64, 60, 60, 62, 60, 67, 65, 60, 60, 72, 69, 65, 64, 62, 70, 70, 69, 65, 67, 65]

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)
}

export default function PianoModal() {
  const open = usePianoStore((state) => state.open)
  const setOpen = usePianoStore((state) => state.setOpen)
  const melodyState = usePianoStore((state) => state.melodyState)
  const setMelodyState = usePianoStore((state) => state.setMelodyState)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set())
  const [volume, setVolume] = useState(48)
  const melodyIndex = useRef(0)
  const timer = useRef<number | null>(null)
  const melodyNote = useRef<number | null>(null)

  const haltMelody = (reset: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    if (melodyNote.current !== null) stopPianoNote(melodyNote.current)
    melodyNote.current = null
    if (reset) melodyIndex.current = 0
    setMelodyState(reset ? 'idle' : 'paused')
    setActiveNotes(new Set())
  }
  const stopMelody = () => haltMelody(true)
  const pauseMelody = () => haltMelody(false)
  const stopNote = (midi: number) => { stopPianoNote(midi); setActiveNotes((notes) => { const next = new Set(notes); next.delete(midi); return next }) }
  const startNote = (midi: number) => { if (melodyState !== 'idle') stopMelody(); playPianoNote(midi); setActiveNotes((notes) => new Set(notes).add(midi)) }
  const playStep = () => {
    const midi = HAPPY_BIRTHDAY[melodyIndex.current]
    if (midi === undefined) { stopMelody(); return }
    melodyNote.current = midi
    playPianoNote(midi)
    setActiveNotes(new Set([midi]))
    timer.current = window.setTimeout(() => {
      stopPianoNote(midi)
      setActiveNotes(new Set())
      melodyNote.current = null
      melodyIndex.current += 1
      timer.current = window.setTimeout(playStep, 70)
    }, 310)
  }
  const startMelody = (restart = false) => {
    if (restart) { stopAllPianoNotes(); melodyIndex.current = 0 }
    if (melodyIndex.current >= HAPPY_BIRTHDAY.length) melodyIndex.current = 0
    setMelodyState('playing')
    playStep()
  }

  useEffect(() => {
    if (!open) return
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return }
      if (event.repeat || isTypingTarget(event.target)) return
      const midi = KEY_TO_MIDI[event.key.toLowerCase()]
      if (midi === undefined) return
      event.preventDefault()
      startNote(midi)
    }
    const up = (event: KeyboardEvent) => {
      const midi = KEY_TO_MIDI[event.key.toLowerCase()]
      if (midi !== undefined) stopNote(midi)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  })
  useEffect(() => () => { stopMelody(); stopAllPianoNotes() }, [])
  useEffect(() => { if (!open) { stopMelody(); stopAllPianoNotes() } }, [open])

  if (!open) return null
  const close = () => setOpen(false)
  return <div className="piano-modal" role="presentation" onMouseDown={close}>
    <section className="piano-panel" role="dialog" aria-modal="true" aria-labelledby="piano-title" onMouseDown={(event) => event.stopPropagation()}>
      <i className="piano-spark piano-spark--one">♪</i><i className="piano-spark piano-spark--two">✦</i><i className="piano-spark piano-spark--three">♥</i>
      <button className="piano-close" type="button" aria-label="关闭电子琴" onClick={close}>×</button>
      <header><p>liz’s little music room</p><h2 id="piano-title">Play for Liz <span>♡</span></h2><small>A little melody just for you</small></header>
      <PianoKeyboard activeNotes={activeNotes} onStart={startNote} onStop={stopNote} />
      <div className="piano-controls">
        <label className="piano-volume">♪ <input type="range" min="0" max="100" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); setPianoVolume(next / 100) }} aria-label="音量" /></label>
        <button type="button" className="piano-song" onClick={() => startMelody(true)}>♬ Happy Birthday</button>
        <button type="button" className="piano-play" onClick={() => melodyState === 'playing' ? pauseMelody() : startMelody(melodyState === 'idle')}>{melodyState === 'playing' ? 'Ⅱ Pause' : '▶ Play'}</button>
      </div>
      <p className="piano-tip">点击琴键、滑动触摸，或使用键盘上的 A–L / W–U 弹奏</p>
    </section>
  </div>
}
