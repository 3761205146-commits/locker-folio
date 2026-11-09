import { useEffect, useRef, useState } from 'react'
import PianoKeyboard, { KEY_TO_MIDI } from './PianoKeyboard'
import { playPianoNote, setPianoVolume, stopAllPianoNotes, stopPianoNote } from './pianoAudio'
import { usePianoStore } from './pianoStore'
import './piano.css'

const UNREAL_AUDIO = `${import.meta.env.BASE_URL}audio/unreal-piano.mp3`

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export default function PianoModal() {
  const open = usePianoStore((state) => state.open)
  const setOpen = usePianoStore((state) => state.setOpen)
  const setMelodyState = usePianoStore((state) => state.setMelodyState)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set())
  const [volume, setVolume] = useState(48)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isTrackPlaying, setIsTrackPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const pauseTrack = () => {
    audioRef.current?.pause()
    setIsTrackPlaying(false)
    setMelodyState('paused')
  }
  const stopNote = (midi: number) => {
    stopPianoNote(midi)
    setActiveNotes((notes) => { const next = new Set(notes); next.delete(midi); return next })
  }
  const startNote = (midi: number) => {
    if (isTrackPlaying) pauseTrack()
    playPianoNote(midi)
    setActiveNotes((notes) => new Set(notes).add(midi))
  }
  const playTrack = async (restart = false) => {
    const audio = audioRef.current
    if (!audio) return
    if (restart) audio.currentTime = 0
    try {
      await audio.play()
      setIsTrackPlaying(true)
      setMelodyState('playing')
    } catch {
      setIsTrackPlaying(false)
    }
  }
  const close = () => {
    pauseTrack()
    stopAllPianoNotes()
    setActiveNotes(new Set())
    setOpen(false)
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const syncDuration = () => setDuration(audio.duration)
    const syncTime = () => setCurrentTime(audio.currentTime)
    const finish = () => { setIsTrackPlaying(false); setMelodyState('idle'); setCurrentTime(audio.duration) }
    audio.addEventListener('loadedmetadata', syncDuration)
    audio.addEventListener('timeupdate', syncTime)
    audio.addEventListener('ended', finish)
    return () => {
      audio.removeEventListener('loadedmetadata', syncDuration)
      audio.removeEventListener('timeupdate', syncTime)
      audio.removeEventListener('ended', finish)
    }
  }, [setMelodyState])
  useEffect(() => {
    if (open) return
    audioRef.current?.pause()
    stopAllPianoNotes()
    setActiveNotes(new Set())
  }, [open])
  useEffect(() => {
    if (!open) return
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return }
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

  if (!open) return null
  return <div className="piano-modal" role="presentation" onMouseDown={close}>
    <section className="piano-panel" role="dialog" aria-modal="true" aria-labelledby="piano-title" onMouseDown={(event) => event.stopPropagation()}>
      <audio ref={audioRef} src={UNREAL_AUDIO} preload="metadata" />
      <i className="piano-spark piano-spark--one">♪</i><i className="piano-spark piano-spark--two">✦</i><i className="piano-spark piano-spark--three">♥</i>
      <button className="piano-close" type="button" aria-label="关闭电子琴" onClick={close}>×</button>
      <header><p>liz’s little music room</p><h2 id="piano-title">Play for Liz <span>♡</span></h2><small>Unreal (LIZ Solo) · piano version</small></header>
      <PianoKeyboard activeNotes={activeNotes} onStart={startNote} onStop={stopNote} />
      <div className="piano-progress"><span>{formatTime(currentTime)}</span><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => { const next = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = next; setCurrentTime(next) }} aria-label="Unreal 播放进度" /><span>{formatTime(duration)}</span></div>
      <div className="piano-controls">
        <label className="piano-volume">♪ <input type="range" min="0" max="100" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); setPianoVolume(next / 100); if (audioRef.current) audioRef.current.volume = next / 100 }} aria-label="音量" /></label>
        <button type="button" className="piano-song" onClick={() => void playTrack(true)}>♬ Unreal (LIZ Solo)</button>
        <button type="button" className="piano-play" onClick={() => isTrackPlaying ? pauseTrack() : void playTrack()}>{isTrackPlaying ? 'Ⅱ Pause' : '▶ Play'}</button>
      </div>
      <p className="piano-tip">完整双手钢琴版 · 点击琴键、滑动触摸，或使用键盘上的 A–L / W–U 弹奏</p>
    </section>
  </div>
}
