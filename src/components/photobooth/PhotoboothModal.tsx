import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { FRAMES, type BoothFrame } from './frames'
import { canvasBlob, compose, drawCover, freshShot, loadImage, type Shot } from './composite'
import { usePhotoboothStore } from './photoboothStore'
import './photobooth.css'

type CameraStatus = 'idle' | 'requesting' | 'ready' | 'error'
const EMPTY = (): (Shot | null)[] => [null, null, null, null]

function StripPreview({ frame, shots }: { frame: BoothFrame; shots: (Shot | null)[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    // Draw offscreen first: an old async render must never replace a newer draft.
    const draft = document.createElement('canvas')
    compose(frame, shots, draft, 0.28).then(() => {
      if (!current || !canvas.current) return
      canvas.current.width = draft.width; canvas.current.height = draft.height
      canvas.current.getContext('2d')!.drawImage(draft, 0, 0)
      setFailed(false)
    }).catch(() => { if (current) setFailed(true) })
    return () => { current = false }
  }, [frame, shots])
  return <div className="pb-strip">{failed ? <p role="alert">相框预览读取失败，请返回重试。</p> : <canvas ref={canvas} aria-label="四宫格实时预览" />}</div>
}

function Viewfinder({ frame, index, shot, video, streaming }: { frame: BoothFrame; index: number; shot: Shot | null; video: RefObject<HTMLVideoElement | null>; streaming: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let disposed = false, raf = 0
    const box = frame.windows[index]
    const target = canvas.current!
    target.width = 1000; target.height = Math.round(1000 * box.height / box.width)
    const ctx = target.getContext('2d')!
    Promise.all([loadImage(frame.url), shot ? loadImage(shot.src) : Promise.resolve(null)]).then(([art, photo]) => {
      if (disposed) return
      setFailed(false)
      const draw = () => {
        if (disposed) return
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, target.width, target.height)
        ctx.scale(target.width / box.width, target.height / box.height)
        const rect = { x: 0, y: 0, width: box.width, height: box.height }
        if (photo && shot) drawCover(ctx, photo, photo.naturalWidth, photo.naturalHeight, rect, shot)
        else {
          const source = video.current
          if (streaming && source && source.readyState >= 2) drawCover(ctx, source, source.videoWidth, source.videoHeight, rect, { zoom: 1, offsetX: 0, offsetY: 0 }, true)
        }
        ctx.drawImage(art!, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
        if (!shot && streaming) raf = requestAnimationFrame(draw)
      }
      draw()
    }).catch(() => { if (!disposed) setFailed(true) })
    return () => { disposed = true; cancelAnimationFrame(raf) }
  }, [frame, index, shot, video, streaming])
  return <div className="pb-viewfinder">{failed && <p role="alert">相框读取失败，请返回重试。</p>}<canvas ref={canvas} aria-label={shot ? `第${index + 1}张照片预览` : '摄像头实时预览'} /></div>
}

function BoothSession({ close }: { close: () => void }) {
  const [frame, setFrame] = useState<BoothFrame | null>(null)
  const [stage, setStage] = useState<'choose' | 'shoot' | 'done'>('choose')
  const [shots, setShots] = useState(EMPTY)
  const [confirmed, setConfirmed] = useState([false, false, false, false])
  const [index, setIndex] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [cameraError, setCameraError] = useState('')
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const request = useRef(0)
  const alive = useRef(true)
  const activeShot = shots[index]
  useLayoutEffect(() => { content.current?.scrollTo({ top: 0 }) }, [stage, index])

  const stopCamera = useCallback(() => {
    request.current++
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setCameraStatus('idle')
  }, [])
  const startCamera = useCallback(async () => {
    stopCamera()
    const token = ++request.current
    setCameraStatus('requesting'); setCameraError('')
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('secure')
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      if (!alive.current || token !== request.current) { media.getTracks().forEach((track) => track.stop()); return }
      streamRef.current = media; setStream(media); setCameraStatus('ready')
      media.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
        if (streamRef.current !== media) return
        stopCamera(); setCameraStatus('error'); setCameraError('摄像头已断开，可以重新开启，或上传本地照片。')
      }, { once: true }))
    } catch (reason) {
      if (!alive.current || token !== request.current) return
      const name = reason instanceof DOMException ? reason.name : ''
      const message = name === 'NotAllowedError' ? '摄像头权限未获允许。你可以在浏览器设置中允许后重试，或上传本地照片。'
        : name === 'NotFoundError' ? '没有找到摄像头，请连接设备，或上传本地照片。'
          : name === 'NotReadableError' ? '摄像头可能被其他应用占用，请关闭后重试，或上传本地照片。'
            : !window.isSecureContext || !navigator.mediaDevices ? '当前浏览器环境无法开启摄像头，请通过 HTTPS 或 localhost 打开，或上传本地照片。'
              : '暂时无法开启摄像头，请重试，或上传本地照片。'
      setCameraStatus('error'); setCameraError(message)
    }
  }, [stopCamera])

  useEffect(() => {
    alive.current = true
    const lastFocus = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    const wasInert = root?.inert ?? false
    if (root) root.inert = true
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key !== 'Tab') return
      const elements = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]') ?? [])].filter((el) => el.getClientRects().length > 0)
      const first = elements[0], last = elements.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const visibility = () => {
      if (document.hidden) { stopCamera(); setCameraStatus('idle'); setCameraError('摄像头已暂停，点击「开启摄像头」继续，照片已保留。') }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      alive.current = false; stopCamera()
      document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', visibility)
      if (root) root.inert = wasInert
      document.body.style.overflow = overflow
      lastFocus?.focus()
    }
  }, [close, stopCamera])
  useEffect(() => {
    const el = video.current
    if (!el || !stream) return
    el.srcObject = stream
    void el.play().catch(() => { if (alive.current) { setCameraStatus('error'); setCameraError('预览无法播放，请点击「开启摄像头」重试，或上传照片。') } })
    return () => { el.srcObject = null }
  }, [stream, stage])
  useEffect(() => () => { if (result) URL.revokeObjectURL(result) }, [result])
  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(false), 380)
    return () => window.clearTimeout(timer)
  }, [flash])

  const saveShot = (shot: Shot | null) => {
    setShots((previous) => previous.map((value, i) => i === index ? shot : value))
    setConfirmed((previous) => previous.map((value, i) => i === index ? false : value))
    setError('')
  }
  const capture = () => {
    const source = video.current
    if (!source || source.readyState < 2 || !source.videoWidth) { setError('摄像头画面尚未就绪，请稍等或上传本地照片。'); return }
    const canvas = document.createElement('canvas')
    canvas.width = source.videoWidth; canvas.height = source.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1)
    ctx.drawImage(source, 0, 0)
    saveShot(freshShot(canvas.toDataURL('image/jpeg', 0.95))); setFlash(true)
  }
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setError('')
    let url = ''
    try {
      url = URL.createObjectURL(file)
      const image = await loadImage(url)
      if (!alive.current) return
      const ratio = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
      saveShot(freshShot(canvas.toDataURL('image/png'))); setFlash(true)
    } catch { if (alive.current) setError('这张图片无法读取，请选择 JPG、PNG 或浏览器支持的照片格式。') }
    finally { if (url) URL.revokeObjectURL(url); if (alive.current) setBusy(false) }
  }
  const finish = async () => {
    setBusy(true); setError('')
    try {
      if (!frame || shots.some((shot) => !shot)) throw new Error('还有照片未拍摄，请返回补齐。')
      const canvas = document.createElement('canvas')
      await compose(frame, shots, canvas)
      const blob = await canvasBlob(canvas)
      if (!alive.current) return
      stopCamera(); setResult(URL.createObjectURL(blob)); setStage('done')
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '合成失败，请重试。') }
    finally { if (alive.current) setBusy(false) }
  }
  const confirm = () => {
    if (!activeShot || busy) return
    const next = confirmed.map((value, i) => i === index ? true : value)
    setConfirmed(next)
    if (index < 3) { setIndex(index + 1); setError('') }
    else if (next.every(Boolean)) void finish()
    else { const missing = next.findIndex((value) => !value); setIndex(missing); setError('请先确认这张照片，再继续合成。') }
  }
  const choose = (selection: BoothFrame) => { setFrame(selection); setIndex(0); setStage('shoot'); setResult(null); setError(''); void startCamera() }
  const backToFrames = () => { stopCamera(); setStage('choose'); setError(''); setResult(null) }
  const updateCrop = (key: 'zoom' | 'offsetX' | 'offsetY', value: number) => { if (activeShot) saveShot({ ...activeShot, [key]: value }) }

  return createPortal(
    <div className="pb-backdrop">
      <section ref={dialog} tabIndex={-1} className="pb-dialog" role="dialog" aria-modal="true" aria-labelledby="pb-title">
        <header className="pb-header">
          <div><p className="pb-eyebrow">LIZ’S LITTLE PHOTO BOOTH</p><h1 id="pb-title">人生四宫格 <span aria-hidden="true">♡</span></h1></div>
          <button type="button" className="pb-close" aria-label="关闭拍照亭" onClick={close}>×</button>
        </header>
        <div ref={content} className="pb-content">
          {stage === 'choose' && <div className="pb-choose">
            <div className="pb-intro"><span className="pb-pill">01 / PICK YOUR FRAME</span><h2>选一款相框，留住今天的你</h2><p>一张一张慢慢拍，把四个小瞬间装进同一段回忆。</p></div>
            <div className="pb-frame-options">{FRAMES.map((option) => <button type="button" key={option.id} className="pb-frame-option" onClick={() => choose(option)} aria-label={`选择相框${option.id}：${option.title}`}>
              <div className="pb-frame-paper"><img src={option.url} alt={`人生四宫格${option.id}原始相框`} /></div>
              <strong>{option.title}</strong><small>{option.subtitle}</small><span className="pb-select-label">选择这款相框 →</span>
            </button>)}</div>
            {shots.some(Boolean) && <p className="pb-hint">已拍照片保留，换一款相框也可以继续调整。</p>}
          </div>}
          {stage === 'shoot' && frame && <div className="pb-shoot">
            <aside className="pb-preview-column"><span className="pb-pill">{frame.title} · YOUR PHOTO STRIP</span><StripPreview frame={frame} shots={shots} /><button type="button" className="pb-text-button" onClick={backToFrames} disabled={busy}>← 返回相框选择</button></aside>
            <main className="pb-capture-column">
              <div className="pb-step-heading"><div><p className="pb-eyebrow">ONE LITTLE MOMENT AT A TIME</p><h2>正在拍摄第 {index + 1} 张照片</h2></div><b className="pb-counter" aria-label={`拍摄进度${index + 1}/4`}>{index + 1}<small>/4</small></b></div>
              <ol className="pb-progress" aria-label="四张照片进度">{shots.map((shot, i) => <li key={i} className={`${i === index ? 'is-current' : ''} ${confirmed[i] ? 'is-confirmed' : ''}`}><span>{confirmed[i] ? '✓' : i + 1}</span>{i === index ? (shot ? '待确认' : '拍摄中') : confirmed[i] ? '已确认' : shot ? '已拍摄' : '待拍摄'}</li>)}</ol>
              <div className={`pb-camera-area${flash ? ' is-flashing' : ''}`}>
                <video ref={video} className="pb-source-video" autoPlay playsInline muted aria-hidden="true" />
                <Viewfinder frame={frame} index={index} shot={activeShot} video={video} streaming={cameraStatus === 'ready'} />
                {flash && <span className="pb-captured" role="status">这一刻，收好啦 ♡</span>}
              </div>
              <div className="pb-status" aria-live="polite">{activeShot ? '看看这一张，调整好再确认。下一张由你决定什么时候拍。' : cameraStatus === 'ready' ? '把自己放进透明窗口里，准备好就按下快门。镜像预览与成片一致。' : cameraStatus === 'requesting' ? '正在请求摄像头权限…也可以直接上传照片。' : cameraError || '开启摄像头，或选择本地照片开始。'}</div>
              {cameraError && activeShot && <p className="pb-hint">{cameraError}</p>}
              {activeShot && <fieldset className="pb-crop" disabled={busy}><legend>调整这张照片</legend>
                <label>放大 <input aria-label="照片放大比例" type="range" min="1" max="2.5" step="0.01" value={activeShot.zoom} onChange={(e) => updateCrop('zoom', +e.target.value)} /><output>{activeShot.zoom.toFixed(2)}×</output></label>
                <label>上下 <input aria-label="照片上下位置" type="range" min="-1" max="1" step="0.01" value={activeShot.offsetY} onChange={(e) => updateCrop('offsetY', +e.target.value)} /><span>↕</span></label>
                <label>左右 <input aria-label="照片左右位置" type="range" min="-1" max="1" step="0.01" value={activeShot.offsetX} onChange={(e) => updateCrop('offsetX', +e.target.value)} /><span>↔</span></label>
              </fieldset>}
              {error && <p className="pb-error" role="alert">{error}</p>}
              <div className="pb-actions">{activeShot ? <><button type="button" className="pb-button pb-secondary" onClick={() => saveShot(null)} disabled={busy}>重拍这一张</button><button type="button" className="pb-button pb-primary" onClick={confirm} disabled={busy}>{busy ? '正在合成…' : index === 3 ? '确认使用，合成四宫格 ♡' : '确认使用，下一张 →'}</button></> : <button type="button" className="pb-button pb-primary pb-shutter" onClick={capture} disabled={cameraStatus !== 'ready' || busy}><span aria-hidden="true">◉</span> 拍摄第 {index + 1} 张</button>}</div>
              <div className="pb-secondary-actions"><button type="button" className="pb-text-button" disabled={index === 0 || busy} onClick={() => { setIndex(index - 1); setError('') }}>← 返回上一张</button><label className={`pb-upload${busy ? ' is-disabled' : ''}`}>上传本地照片<input aria-label="上传本地照片" type="file" accept="image/*" onChange={(event) => void upload(event)} disabled={busy} /></label>{cameraStatus !== 'ready' && <button type="button" className="pb-text-button" onClick={() => void startCamera()} disabled={cameraStatus === 'requesting'}>开启摄像头</button>}</div>
            </main>
          </div>}
          {stage === 'done' && result && <div className="pb-done"><div className="pb-result-paper"><img src={result} alt="合成后的人生四宫格" /></div><div className="pb-result-copy"><span className="pb-pill">FOUR MOMENTS, ONE MEMORY</span><h2>今天的可爱，<br />已存档 <span>♡</span></h2><p>四张照片，四个小瞬间。<br />把这段回忆带走吧。</p><a className="pb-button pb-primary" href={result} download={`人生四宫格-${frame?.id}.png`}>下载人生四宫格 ↓</a><button type="button" className="pb-button pb-secondary" onClick={() => { setShots(EMPTY()); setConfirmed([false, false, false, false]); setIndex(0); setResult(null); setStage('shoot'); void startCamera() }}>重新拍摄</button><button type="button" className="pb-text-button" onClick={backToFrames}>返回相框选择</button><p className="pb-hint">PNG · 1515 × 4500 · 原始相框比例</p></div></div>}
        </div>
        <footer className="pb-footer"><span aria-hidden="true">♡</span> 照片仅在你的浏览器内处理，不上传、不登录；关闭后释放摄像头。</footer>
      </section>
    </div>, document.body,
  )
}
export default function PhotoboothModal() {
  const open = usePhotoboothStore((state) => state.open)
  const close = usePhotoboothStore((state) => state.closeBooth)
  return open ? <BoothSession close={close} /> : null
}
