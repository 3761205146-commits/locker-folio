import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  isDisplayFontReady,
  retryFailedAssets,
  useBlockingAssets,
} from '../experience/assetManifest'
import { prefersReducedMotion } from '../hooks/useReducedMotion'
import './loader.css'
import { useScenePreparation } from '../scene/scenePreparation'

/** 显示值追赶真实值的最快速度：满格至少要走这么久，避免命中缓存时 0→100 一闪而过 */
const RAMP_MS = 900
/** 22 颗爱心全部点亮后的停顿 */
const HOLD_MS = 600
/** 加载页淡出时长 */
const FADE_MS = 620
/** 有资源失败时，错误面板最多停留这么久就以降级模式继续，绝不永久卡住 */
const AUTO_CONTINUE_MS = 5_000

function isReady(
  assets: { settled: boolean; retrying: boolean },
  preparation: { resourcesAcquired: boolean; texturesPrepared: boolean; sceneRenderable: boolean; fatal: boolean },
) {
  return assets.settled && !assets.retrying && preparation.resourcesAcquired
    && preparation.texturesPrepared && preparation.sceneRenderable && !preparation.fatal
}

type Tuning = { ramp: number; hold: number; frozen: number | null }

function readTuning(): Tuning {
  // Reduced Motion：显示值直接跟真实值，只留一个能被看见的极短停顿
  if (prefersReducedMotion()) return { ramp: 0, hold: 180, frozen: null }
  if (!import.meta.env.DEV) return { ramp: RAMP_MS, hold: HOLD_MS, frozen: null }

  const q = new URLSearchParams(location.search)
  // 开发期：?loader=hold 冻结在中途，方便核对视觉
  if (q.get('loader') === 'hold') return { ramp: RAMP_MS, hold: HOLD_MS, frozen: 62 }
  if (q.has('fast')) return { ramp: 120, hold: 80, frozen: null }
  return { ramp: RAMP_MS, hold: HOLD_MS, frozen: null }
}

/**
 * Liz 生日开场加载页：22 颗爱心由真实首屏资源进度驱动，
 * 全部点亮并停顿后柔和淡出到原有柜子开场。
 *
 * 要点：
 * - 资源取得/解码占 70%，最终纹理准备占 20%，场景可渲染占 10%；
 *   三部分均由真实完成事件驱动，仍由原有爱心界面显示。
 * - 显示值只会追赶真实值、永不超过它，因此单调递增且不会倒退；
 *   命中缓存时靠 RAMP_MS 限速，保证 0→100 不是一闪而过。
 * - 100% 表示资源、最终纹理及冻结初始帧均已准备，随后保留 HOLD_MS 的停顿。
 * - 资源失败会走重试 / fallback / 降级三级处置，并在界面上给出重试入口，
 *   同时有自动继续倒计时，不会永远卡在百分比上。
 * - onReady 传了就调回调（供场景状态机接线），没传就退回 setPhase('reveal')。
 */
export default function Loader({ onReady }: { onReady?: () => void }) {
  const setProgress = useStore((s) => s.setProgress)
  const setPhase = useStore((s) => s.setPhase)
  const assets = useBlockingAssets()
  const preparation = useScenePreparation()
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!useScenePreparation.getState().sceneRenderable) {
        useScenePreparation.setState({ fatal: true, failures: ['场景准备超时，请重试'] })
      }
    }, 45_000)
    return () => window.clearTimeout(timer)
  }, [preparation.generation])

  const [tuning] = useState(readTuning)
  const [shown, setShown] = useState(() => tuning.frozen ?? 0)
  const [countdown, setCountdown] = useState(Math.ceil(AUTO_CONTINUE_MS / 1000))
  const [leaving, setLeaving] = useState(false)
  const [visible, setVisible] = useState(() => !document.hidden)

  const assetsRef = useRef(assets)
  const preparationRef = useRef(preparation)
  const onReadyRef = useRef(onReady)
  const setPhaseRef = useRef(setPhase)
  const leftRef = useRef(false)
  const leaveTimerRef = useRef<number | null>(null)
  const fullAtRef = useRef(0)
  const mountedRef = useRef(false)
  const leavingRef = useRef(false)
  const fadeDeadlineRef = useRef(0)
  const realReady = isReady(assets, preparation)
  /** 显示值同时存一份 ref：rAF 里必须同步读到当前值，不能依赖 setState 更新器 */
  const shownRef = useRef(tuning.frozen ?? 0)

  useLayoutEffect(() => {
    assetsRef.current = assets
    preparationRef.current = preparation
    onReadyRef.current = onReady
    setPhaseRef.current = setPhase
    // A retry invalidates an in-flight fade before the browser can paint it.
    if (!realReady) {
      fullAtRef.current = 0
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current)
      if (leavingRef.current) { leavingRef.current = false; setLeaving(false) }
    }
  }, [assets, preparation, onReady, setPhase, realReady])
  const readyNow = useCallback(() => isReady(assetsRef.current, useScenePreparation.getState()), [])

  // 重试期间 settled 会回到 false，但错误面板必须继续留在屏幕上
  const hasError = (assets.settled && assets.failed.length > 0) || assets.retrying || preparation.failures.length > 0
  // Ultra 就位前不画 WELCOME：回退的细衬线和 Ultra 的超粗板衬差太远，
  // 跳字比晚一点出现刺眼得多（参考第一帧就是粗字）。上限由字体阶段的 2.5s 兜底。
  const fontReady = isDisplayFontReady(assets)
  const pct = Math.round(shown)
  const litHearts = Math.min(22, Math.ceil((shown / 100) * 22))
  /** 显示值追平真实值、资源全部结算、且没有重试在飞 */
  const canLeave = shown >= 100 && realReady

  const finishLeave = useCallback(() => {
    if (!mountedRef.current || leftRef.current || !leavingRef.current || document.hidden || !readyNow()) return
    leftRef.current = true
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    if (import.meta.env.DEV) {
      const a = assetsRef.current
      console.info(
        `[loader] 离场 · 阻塞资源 ${a.readyCount}/${a.totalCount} ready` +
          `${a.failed.length ? ` · ${a.failed.length} 项失败已降级` : ''}` +
          ` · 资源耗时 ${Math.round(a.elapsedMs)}ms` +
          ` · 100% 停顿 ${Math.round(performance.now() - fullAtRef.current)}ms`,
      )
    }
    if (onReadyRef.current) onReadyRef.current()
    else setPhaseRef.current('reveal')
  }, [readyNow])

  const leave = useCallback(() => {
    if (!mountedRef.current || leftRef.current || leavingRef.current || document.hidden || !readyNow()) return
    leavingRef.current = true
    setLeaving(true)
    // 标签页被隐藏时 transitionend 可能延后，兜底保证不会停在加载页。
    fadeDeadlineRef.current = performance.now() + FADE_MS + 180
    leaveTimerRef.current = window.setTimeout(finishLeave, FADE_MS + 180)
  }, [finishLeave, readyNow])

  useEffect(() => {
    mountedRef.current = true
    const visibility = () => {
      setVisible(!document.hidden)
      if (!document.hidden && leavingRef.current && readyNow()) {
        if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = window.setTimeout(finishLeave, Math.max(0, fadeDeadlineRef.current - performance.now()))
      }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', visibility)
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current)
    }
  }, [finishLeave, readyNow])

  /* 显示值追赶真实进度：只往上走，且永不超过真实值 */
  useEffect(() => {
    // 冻结模式（?loader=hold）只看视觉，不跑帧循环
    if (tuning.frozen !== null || !visible) return
    let raf = 0
    let timer: number | undefined
    let active = true
    let last = performance.now()
    const advance = () => {
      if (!active || document.hidden) return
      // rAF timestamps may precede a timer callback in the same frame. Both
      // schedulers must consume one shared, monotonic wall clock exactly once.
      const now = performance.now()
      const dt = now - last
      last = now
      const prepared = preparationRef.current
      const weighted = assetsRef.current.progress * 0.7
        + (prepared.texturesPrepared ? 20 : 0)
        + (prepared.sceneRenderable ? 10 : 0)
      const target = readyNow() ? 100 : Math.min(99, weighted)
      const prev = shownRef.current
      const next =
        prev >= target
          ? prev
          : tuning.ramp <= 0
            ? target
            : Math.min(target, prev + (100 / tuning.ramp) * dt)
      if (next !== prev) {
        shownRef.current = next
        setShown(next)
      }
    }
    const tick = () => {
      advance()
      if (active && shownRef.current < 100) raf = requestAnimationFrame(tick)
    }
    const fallback = () => {
      // This is only a display-progress fallback, never a readiness override.
      if (!active || !readyNow()) return
      advance()
      if (shownRef.current < 100) timer = window.setTimeout(fallback, 50)
    }
    raf = requestAnimationFrame(tick)
    if (realReady) timer = window.setTimeout(fallback, 50)
    return () => { active = false; cancelAnimationFrame(raf); window.clearTimeout(timer) }
  }, [tuning, realReady, visible, readyNow])

  /* 兼容旧接口：继续把百分比写进 store */
  useEffect(() => {
    setProgress(pct)
  }, [pct, setProgress])

  /* 100% 停顿 → 离场；有失败则先展示错误态并倒计时降级继续 */
  useEffect(() => {
    if (!canLeave || leaving || !visible || tuning.frozen !== null) return
    if (fullAtRef.current === 0) fullAtRef.current = performance.now()
    if (!hasError) {
      const t = window.setTimeout(leave, Math.max(0, fullAtRef.current + tuning.hold - performance.now()))
      return () => window.clearTimeout(t)
    }
    const deadline = fullAtRef.current + AUTO_CONTINUE_MS
    const tick = window.setInterval(
      () => setCountdown(Math.max(0, Math.ceil((deadline - performance.now()) / 1000))),
      250,
    )
    const t = window.setTimeout(leave, Math.max(0, deadline - performance.now()))
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(t)
    }
  }, [canLeave, hasError, tuning, leave, leaving, visible])

  return (
    <div
      className="loader"
      data-resources-acquired={preparation.resourcesAcquired}
      data-textures-prepared={preparation.texturesPrepared}
      data-scene-renderable={preparation.sceneRenderable}
      aria-busy={!canLeave}
      data-leaving={leaving}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === 'opacity') finishLeave()
      }}
    >
      <div className="loader__content">
        <h1 className="loader__title" data-fontready={fontReady}>
          Happy Birthday
        </h1>
        <div
          className="loader__hearts"
          role="progressbar"
          aria-label="生日开场加载"
          aria-valuemin={0}
          aria-valuemax={22}
          aria-valuenow={litHearts}
          aria-valuetext={`${litHearts} / 22 颗爱心已点亮`}
        >
          {Array.from({ length: 22 }, (_, index) => (
            <span key={index} className="loader__heart" data-lit={index < litHearts} aria-hidden>
              ♥
            </span>
          ))}
        </div>
      </div>

      <div className="loader__sig">all for liz 1121</div>

      {hasError && (
        <div className="loader__err" role="alert">
          <p className="loader__errTitle">
            {assets.retrying
              ? '正在重试…'
              : preparation.fatal ? '场景准备失败，请重试' : `${assets.failed.length + preparation.failures.length} 项首屏资源加载失败`}
          </p>
          {import.meta.env.DEV && (
            <ul className="loader__errList">
              {assets.failed.map((rt) => (
                <li key={rt.entry.id}>
                  {rt.entry.url} — {rt.error}
                </li>
              ))}
            </ul>
          )}
          <div className="loader__errActions">
            <button type="button" onClick={() => { retryFailedAssets(); preparation.retry(); window.dispatchEvent(new Event('scene-preparation-retry')) }} disabled={assets.retrying}>
              重试
            </button>
            <button type="button" onClick={leave} disabled={!realReady || leaving}>
              以降级模式继续{assets.retrying ? '' : `（${countdown}s）`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
