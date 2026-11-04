import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  isDisplayFontReady,
  retryFailedAssets,
  useBlockingAssets,
} from '../experience/assetManifest'
import { prefersReducedMotion } from '../hooks/useReducedMotion'
import './loader.css'

/** 显示值追赶真实值的最快速度：满格至少要走这么久，避免命中缓存时 0→100 一闪而过 */
const RAMP_MS = 900
/** 22 颗爱心全部点亮后的停顿 */
const HOLD_MS = 600
/** 加载页淡出时长 */
const FADE_MS = 620
/** 有资源失败时，错误面板最多停留这么久就以降级模式继续，绝不永久卡住 */
const AUTO_CONTINUE_MS = 5_000

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
 * - 百分比由 assetManifest 的真实事件驱动：每张首屏阻塞图的请求完成占 55%，
 *   decode() 完成占剩下的 45%，按预期体积加权。**没有任何固定计时的假进度。**
 * - 显示值只会追赶真实值、永不超过它，因此单调递增且不会倒退；
 *   命中缓存时靠 RAMP_MS 限速，保证 0→100 不是一闪而过。
 * - 100% 表示阻塞资源真的 decode 完可以拿去渲染，随后保留 HOLD_MS 的停顿。
 * - 资源失败会走重试 / fallback / 降级三级处置，并在界面上给出重试入口，
 *   同时有自动继续倒计时，不会永远卡在百分比上。
 * - onReady 传了就调回调（供场景状态机接线），没传就退回 setPhase('reveal')。
 */
export default function Loader({ onReady }: { onReady?: () => void }) {
  const setProgress = useStore((s) => s.setProgress)
  const setPhase = useStore((s) => s.setPhase)
  const assets = useBlockingAssets()

  const [tuning] = useState(readTuning)
  const [shown, setShown] = useState(() => tuning.frozen ?? 0)
  const [countdown, setCountdown] = useState(Math.ceil(AUTO_CONTINUE_MS / 1000))
  const [leaving, setLeaving] = useState(false)

  const assetsRef = useRef(assets)
  const onReadyRef = useRef(onReady)
  const setPhaseRef = useRef(setPhase)
  const leftRef = useRef(false)
  const leaveTimerRef = useRef<number | null>(null)
  const fullAtRef = useRef(0)
  /** 显示值同时存一份 ref：rAF 里必须同步读到当前值，不能依赖 setState 更新器 */
  const shownRef = useRef(tuning.frozen ?? 0)

  useEffect(() => {
    assetsRef.current = assets
    onReadyRef.current = onReady
    setPhaseRef.current = setPhase
  })

  // 重试期间 settled 会回到 false，但错误面板必须继续留在屏幕上
  const hasError = (assets.settled && assets.failed.length > 0) || assets.retrying
  // Ultra 就位前不画 WELCOME：回退的细衬线和 Ultra 的超粗板衬差太远，
  // 跳字比晚一点出现刺眼得多（参考第一帧就是粗字）。上限由字体阶段的 2.5s 兜底。
  const fontReady = isDisplayFontReady(assets)
  const pct = Math.round(shown)
  const litHearts = Math.min(22, Math.ceil((shown / 100) * 22))
  /** 显示值追平真实值、资源全部结算、且没有重试在飞 */
  const canLeave = shown >= 100 && assets.settled && !assets.retrying

  const finishLeave = useCallback(() => {
    if (leftRef.current) return
    leftRef.current = true
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
  }, [])

  const leave = useCallback(() => {
    if (leftRef.current || leaving) return
    setLeaving(true)
    // 标签页被隐藏时 transitionend 可能延后，兜底保证不会停在加载页。
    leaveTimerRef.current = window.setTimeout(finishLeave, FADE_MS + 180)
  }, [finishLeave, leaving])

  useEffect(
    () => () => {
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current)
    },
    [],
  )

  /* 显示值追赶真实进度：只往上走，且永不超过真实值 */
  useEffect(() => {
    // 冻结模式（?loader=hold）只看视觉，不跑帧循环
    if (tuning.frozen !== null) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const target = assetsRef.current.progress
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
      // 追平 100 就停帧循环，不留无意义的常驻 rAF
      if (next < 100) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tuning])

  /* 兼容旧接口：继续把百分比写进 store */
  useEffect(() => {
    setProgress(pct)
  }, [pct, setProgress])

  /* 100% 停顿 → 离场；有失败则先展示错误态并倒计时降级继续 */
  useEffect(() => {
    if (!canLeave || tuning.frozen !== null) return
    if (fullAtRef.current === 0) fullAtRef.current = performance.now()
    if (!hasError) {
      const t = window.setTimeout(leave, tuning.hold)
      return () => window.clearTimeout(t)
    }
    const deadline = performance.now() + AUTO_CONTINUE_MS
    const tick = window.setInterval(
      () => setCountdown(Math.max(0, Math.ceil((deadline - performance.now()) / 1000))),
      250,
    )
    const t = window.setTimeout(leave, AUTO_CONTINUE_MS)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(t)
    }
  }, [canLeave, hasError, tuning, leave])

  return (
    <div
      className="loader"
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
              : `${assets.failed.length} 项首屏资源加载失败`}
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
            <button type="button" onClick={retryFailedAssets} disabled={assets.retrying}>
              重试
            </button>
            <button type="button" onClick={leave}>
              以降级模式继续{assets.retrying ? '' : `（${countdown}s）`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
