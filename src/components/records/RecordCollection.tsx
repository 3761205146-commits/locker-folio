import CloseButton from '../overlays/CloseButton'
import { RECORDS } from './recordCatalog'
import { useRecordPlayerStore } from './recordPlayerStore'
import '../overlays/overlay.css'
import './records.css'
import './recordControls.css'

function time(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export default function RecordCollection() {
  const activeId = useRecordPlayerStore((state) => state.activeId)
  const isPlaying = useRecordPlayerStore((state) => state.isPlaying)
  const progressById = useRecordPlayerStore((state) => state.progressById)
  const durationById = useRecordPlayerStore((state) => state.durationById)
  const toggle = useRecordPlayerStore((state) => state.toggle)
  const seek = useRecordPlayerStore((state) => state.seek)
  return <div className="ov"><CloseButton /><section className="record-collection" aria-label="Liz 的唱片收藏"><header className="record-collection__heading"><p>Liz’s little music shelf</p><h3>VINYL COLLECTION <span>♡</span></h3><small>Pick a record and let it play</small></header><div className="record-collection__list">{RECORDS.map((record, index) => { const playing = activeId === record.id && isPlaying; const selected = activeId === record.id; const progress = progressById[record.id] ?? 0; const duration = durationById[record.id] ?? 0; return <article key={record.id} className="record-card" data-playing={playing || undefined} data-selected={selected || undefined} style={{ ['--record-label' as string]: record.color, ['--record-accent' as string]: record.accent, ['--record-delay' as string]: `${index * 90}ms` }}><button type="button" className="record-card__disc" onClick={() => void toggle(record.id)} aria-label={`${playing ? '暂停' : '播放'} ${record.title}`}><i/><i/><i/><i/><span className="record-card__label"><b>{record.label}</b><em>{playing ? 'Ⅱ' : '▶'}</em></span></button><div className="record-card__meta"><p>{record.subtitle}</p><h4>{record.title}</h4><button type="button" className="record-card__play" onClick={() => void toggle(record.id)} aria-pressed={playing}><span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{playing ? 'PAUSE' : selected ? 'RESUME' : 'PLAY'}</button><label className="record-card__progress"><span>{time(progress * duration)}</span><input type="range" min="0" max="1" step="0.001" value={selected ? progress : 0} onChange={(event) => seek(record.id, Number(event.target.value))} disabled={!selected} aria-label={`${record.title} 播放进度`} /><span>{time(duration)}</span></label></div></article>})}</div><p className="record-collection__hint" aria-live="polite">{isPlaying ? '正在播放的唱片会持续旋转；关闭此页也不会停止音乐。' : '三张唱片独立配置，切换时上一首会自动停止。'}</p></section></div>
}
