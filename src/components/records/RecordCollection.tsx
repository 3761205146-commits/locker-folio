import CloseButton from '../overlays/CloseButton'
import { RECORDS } from './recordCatalog'
import { useRecordPlayerStore } from './recordPlayerStore'
import '../overlays/overlay.css'
import './records.css'
import './recordControls.css'
import './recordSilent.css'

/** Visual-only record shelf: labels remain available to assistive technology. */
export default function RecordCollection() {
  const activeId = useRecordPlayerStore((state) => state.activeId)
  const isPlaying = useRecordPlayerStore((state) => state.isPlaying)
  const progressById = useRecordPlayerStore((state) => state.progressById)
  const toggle = useRecordPlayerStore((state) => state.toggle)
  const seek = useRecordPlayerStore((state) => state.seek)
  return <div className="ov"><CloseButton /><section className="record-collection record-collection--silent" aria-label="Liz 的唱片收藏"><div className="record-collection__list">{RECORDS.map((record, index) => { const playing = activeId === record.id && isPlaying; const selected = activeId === record.id; const progress = progressById[record.id] ?? 0; return <article key={record.id} className="record-card" data-playing={playing || undefined} style={{ ['--record-label' as string]: record.color, ['--record-accent' as string]: record.accent, ['--record-delay' as string]: `${index * 90}ms` }}><button type="button" className="record-card__disc" onClick={() => void toggle(record.id)} aria-label={`${playing ? '暂停' : '播放'} ${record.title}`}><i/><i/><i/><i/><span className="record-card__label"><em>{playing ? 'Ⅱ' : '▶'}</em></span></button><label className="record-card__progress"><input type="range" min="0" max="1" step="0.001" value={selected ? progress : 0} onChange={(event) => seek(record.id, Number(event.target.value))} disabled={!selected} aria-label={`${record.title} 播放进度`} /></label></article>})}</div></section></div>
}
