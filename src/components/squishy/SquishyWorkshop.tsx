import { Canvas } from '@react-three/fiber'
import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NoToneMapping } from 'three'
import WorkshopScene from './WorkshopScene'
import { MOBILE_DPR, useMobileRendering } from '../../scene/renderQuality'
import { WorkshopAudio } from './workshopAudio'
import { beginPress, cancelPresses, endPress } from './workshopActions'
import { createWorkshopMotion, STAGES, STAGE_LABELS, type WorkshopStage } from './workshopState'
import { useWorkshopStore } from './workshopStore'
import './squishy-workshop.css'

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <div className="sw-scene-fallback" role="alert">3D 场景暂时无法加载，请关闭后重试。</div> : this.props.children
  }
}

function WorkshopSession({ close }: { close: () => void }) {
  const mobile = useMobileRendering()
  const [stage, setStage] = useState<WorkshopStage>('prepare')
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(false)
  const [closing, setClosing] = useState(false)
  const [visible, setVisible] = useState(!document.hidden)
  const [interactiveReady, setInteractiveReady] = useState(false)
  const [preparationFailed, setPreparationFailed] = useState(false)
  const motion = useRef(createWorkshopMotion())
  const [audio] = useState(() => new WorkshopAudio())
  const dialog = useRef<HTMLElement>(null)
  const phase = useRef<WorkshopStage>('prepare')
  const timer = useRef<number | null>(null)
  const stageIndex = STAGES.indexOf(stage)
  const reportReady = useCallback((ready: boolean) => {
    setInteractiveReady(ready); setPreparationFailed(!ready)
  }, [])

  const requestClose = useCallback(() => {
    if (timer.current !== null) return
    cancelPresses(motion.current); motion.current.sessionActive = false
    motion.current.autoDip = false; audio.dispose(); setClosing(true)
    timer.current = window.setTimeout(close, 230)
  }, [audio, close, motion])
  const advance = useCallback((next: WorkshopStage) => {
    if (phase.current === next) return
    phase.current = next
    cancelPresses(motion.current)
    if (next === 'cool') motion.current.cooling = 0
    setProgress(0); setStage(next)
  }, [motion])
  const reportProgress = useCallback((value: number) => { if (phase.current === stage) setProgress(value) }, [stage])
  const start = () => {
    audio.unlock(); motion.current.waxGeneration++; motion.current.broken = 0; motion.current.fractured = false; motion.current.coating = 0; motion.current.cooling = 0; motion.current.liftTime = 0; motion.current.dragY = 0.3
    motion.current.autoDip = false; advance('wax')
  }
  const previous = () => {
    endPress(motion.current, audio); motion.current.autoDip = false; motion.current.dragging = false; motion.current.dragY = 0.3; motion.current.liftTime = 0
    if (stage === 'wax') { motion.current.coating = 0; motion.current.cooling = 0; advance('prepare') }
    if (stage === 'cool') { motion.current.coating = 0; motion.current.cooling = 0; advance('wax') }
    if (stage === 'squeeze') { motion.current.coating = 1; motion.current.cooling = 0; advance('cool') }
  }
  const restart = () => { const generation = motion.current.waxGeneration + 1; Object.assign(motion.current, createWorkshopMotion(), { waxGeneration: generation, interactiveReady }); advance('wax') }
  useEffect(() => {
    const sessionMotion = motion.current
    sessionMotion.sessionActive = true
    audio.activate()
    const lastFocus = document.activeElement as HTMLElement | null
    const root = document.getElementById('root'), wasInert = root?.inert ?? false
    const oldOverflow = document.body.style.overflow
    if (root) root.inert = true
    document.body.style.overflow = 'hidden'; dialog.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); requestClose(); return }
      if (event.key !== 'Tab') return
      const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])].filter((el) => el.getClientRects().length)
      const first = buttons[0], last = buttons.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus() }
    }
    const release = () => {
      endPress(motion.current, audio); motion.current.dragging = false
      if (phase.current === 'wax' && motion.current.coating < 1 && !motion.current.autoDip) motion.current.dragY = 0.3
    }
    const pause = () => { cancelPresses(motion.current); motion.current.dragging = false; audio.pause() }
    const visibility = () => { setVisible(!document.hidden); if (document.hidden) pause() }
    document.addEventListener('keydown', keydown)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', pause)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      cancelPresses(sessionMotion); sessionMotion.sessionActive = false; audio.dispose()
      document.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', pause)
      if (root) root.inert = wasInert
      document.body.style.overflow = oldOverflow
      lastFocus?.focus()
    }
  }, [audio, motion, requestClose])

  const centerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (beginPress(motion.current, audio, 0, 0.36, event.pressure)) event.currentTarget.setPointerCapture(event.pointerId)
  }
  return createPortal(<div className={`sw-overlay${closing ? ' is-closing' : ''}`}>
    <section ref={dialog} className="sw-workshop" role="dialog" aria-modal="true" aria-labelledby="sw-title" tabIndex={-1} data-stage={stage} data-interactive-ready={interactiveReady}>
      <header className="sw-header"><h1 id="sw-title"><span>Liz</span> Cheez 脆皮捏捏工坊</h1><div className="sw-header-actions">
        <button type="button" className="sw-sound" aria-label={muted ? '开启声音' : '静音'} aria-pressed={!muted} onClick={() => { audio.setMuted(!muted); setMuted(!muted) }}><span aria-hidden="true">{muted ? '♪̸' : '♫'}</span>{muted ? '声音关' : '声音开'}</button>
        <button type="button" className="sw-close" aria-label="关闭脆皮捏捏工坊" onClick={requestClose}>×</button>
      </div></header>
      <ol className="sw-steps" aria-label="制作进度">{STAGES.map((item, i) => <li key={item} className={item === stage ? 'is-active' : i < stageIndex ? 'is-complete' : ''} aria-current={item === stage ? 'step' : undefined}><span>{i < stageIndex ? '✓' : i + 1}</span>{STAGE_LABELS[i]}</li>)}</ol>
      <div className="sw-viewport" aria-describedby="sw-hint">
        <SceneBoundary><Canvas frameloop={visible ? 'always' : 'never'} dpr={[1, mobile ? MOBILE_DPR : 1.5]} camera={{ position: [0, 0.65, 3.9], fov: 36, near: 0.1, far: 30 }} gl={{ antialias: true, alpha: true, toneMapping: NoToneMapping, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.domElement.dataset.workshopCanvas = 'true' }} fallback={<p className="sw-scene-fallback">此设备暂不支持 3D，请关闭后在支持 WebGL 的浏览器打开。</p>}>
          <Suspense fallback={null}><WorkshopScene stage={stage} motion={motion} audio={audio} onStage={advance} onProgress={reportProgress} onReady={reportReady} /></Suspense>
        </Canvas></SceneBoundary>
      </div>
      <div className="sw-instructions" aria-live="polite"><p id="sw-hint">{preparationFailed ? '脆皮准备失败，请关闭后重试' : stage === 'prepare' ? '拖动，转一转' : stage === 'wax' ? progress >= 1 ? '提起，滴去多余的蜡' : '把 Cheez 拖进蜡液' : stage === 'cool' ? progress >= 1 && !interactiveReady ? '准备脆皮…' : '静候脆皮定型' : progress >= 0.9 ? '脆皮碎完啦 · Cheez 自由了' : '按压、拖动，捏碎 Cheez 的脆皮'}</p>
        {(stage === 'wax' || stage === 'cool' || stage === 'squeeze') && <div className="sw-progress-row"><div className="sw-progress" role="progressbar" aria-label={stage === 'wax' ? '裹蜡进度' : stage === 'cool' ? '冷却进度' : '脆皮碎裂进度'} aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.round(progress * 100)}%` }} /></div><output>{Math.round(progress * 100)}%</output></div>}
      </div>
      <footer className="sw-controls">
        <button type="button" className="sw-text-button" onClick={previous} disabled={stage === 'prepare' || closing}>上一步</button>
        <div className="sw-main-action">
          {stage === 'prepare' && <button type="button" className="sw-primary" onClick={start}>开始制作</button>}
          {stage === 'wax' && <button type="button" className="sw-primary" disabled={progress >= 1 || closing} onClick={() => { audio.unlock(); motion.current.autoDip = true; motion.current.dragY = -0.23 }}>浸入蜡液</button>}
          {stage === 'cool' && <button type="button" className="sw-primary" disabled>{progress >= 1 && !interactiveReady ? '准备中…' : '冷却中…'}</button>}
          {stage === 'squeeze' && <button type="button" className="sw-primary" aria-label="按住捏碎脆皮" disabled={!interactiveReady || closing} onPointerDown={centerDown} onPointerUp={() => endPress(motion.current, audio)} onPointerCancel={() => endPress(motion.current, audio)} onKeyDown={(event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); beginPress(motion.current, audio) } }} onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); endPress(motion.current, audio) } }}>捏碎脆皮</button>}
        </div>
        <button type="button" className="sw-text-button" onClick={restart} disabled={stage !== 'squeeze' || closing}>重新裹蜡</button>
      </footer>
    </section>
  </div>, document.body)
}
export default function SquishyWorkshop() {
  const open = useWorkshopStore((state) => state.open)
  const close = useWorkshopStore((state) => state.closeWorkshop)
  return open ? <WorkshopSession close={close} /> : null
}
