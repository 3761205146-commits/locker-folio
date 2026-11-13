import { findRecord } from './recordCatalog'
import { useRecordPlayerStore } from './recordPlayerStore'
import { useStore } from '../../store'
import './miniPlayer.css'

function time(value: number) {
  if (!Number.isFinite(value)) return '0:00'
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
}

export default function MiniRecordPlayer() {
  const activeId = useRecordPlayerStore((state) => state.activeId)
  const isPlaying = useRecordPlayerStore((state) => state.isPlaying)
  const progressById = useRecordPlayerStore((state) => state.progressById)
  const durationById = useRecordPlayerStore((state) => state.durationById)
  const toggle = useRecordPlayerStore((state) => state.toggle)
  const overlay = useStore((state) => state.overlay)
  const record = findRecord(activeId)
  // The collection already has full controls; keep the mini control for the cabinet page.
  if (!record || !activeId || overlay === 'skills') return null
  const progress = progressById[activeId] ?? 0
  const duration = durationById[activeId] ?? 0
  return <aside className="mini-record-player" aria-label="当前播放"><div className="mini-record-player__disc" data-playing={isPlaying || undefined} /><div><p>NOW PLAYING</p><strong>{record.title}</strong><small>{time(progress * duration)} / {time(duration)}</small></div><button type="button" onClick={() => void toggle(activeId)} aria-label={isPlaying ? '暂停' : '继续播放'}>{isPlaying ? 'Ⅱ' : '▶'}</button></aside>
}
