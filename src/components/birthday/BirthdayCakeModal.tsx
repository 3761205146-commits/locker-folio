import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBirthdayCakeStore } from './birthdayCakeStore'
import './birthday-cake.css'

const TOP_DOLLOPS = Array.from({ length: 9 })
const SIDE_DOLLOPS = Array.from({ length: 8 })

function CakeIllustration({ lit, onLight }: { lit: boolean; onLight: () => void }) {
  return (
    <div className="birthday-cake__illustration" aria-label="奶油生日蛋糕">
      <span className="birthday-cake__plate" aria-hidden="true" />
      <span className="birthday-cake__body" aria-hidden="true" />
      <span className="birthday-cake__top" aria-hidden="true" />
      <div className="birthday-cake__side-piping" aria-hidden="true">
        {SIDE_DOLLOPS.map((_, index) => <i key={index} />)}
      </div>
      <div className="birthday-cake__top-piping" aria-hidden="true">
        {TOP_DOLLOPS.map((_, index) => <i key={index} />)}
      </div>
      <span className="birthday-cake__strawberry" aria-hidden="true"><i /><b /><b /><b /></span>
      <button className={`birthday-cake__candle${lit ? ' is-lit' : ''}`} type="button" onClick={onLight} disabled={lit} aria-label={lit ? '生日蜡烛已经点亮' : '点燃生日蜡烛'}>
        <span className="birthday-cake__wick" />
        {lit && <span className="birthday-cake__flame" aria-hidden="true"><i /></span>}
      </button>
    </div>
  )
}

/** Full-screen DOM experience; deliberately kept outside the R3F canvas. */
export default function BirthdayCakeModal() {
  const phase = useBirthdayCakeStore((state) => state.phase)
  const lightCandle = useBirthdayCakeStore((state) => state.lightCandle)
  const resetCake = useBirthdayCakeStore((state) => state.resetCake)
  const [closing, setClosing] = useState(false)

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    window.setTimeout(() => {
      setClosing(false)
      resetCake()
    }, 320)
  }, [closing, resetCake])

  useEffect(() => {
    if (phase === 'idle') return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, phase])

  if (phase === 'idle') return null
  const lit = phase === 'lit'
  const modal = (
    <div className={`birthday-cake-modal${closing ? ' is-closing' : ''}`} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section className="birthday-cake-modal__card" role="dialog" aria-modal="true" aria-labelledby="birthday-cake-title">
        <button className="birthday-cake-modal__close" type="button" onClick={close} aria-label="关闭生日惊喜">×</button>
        <span className="birthday-cake-modal__spark birthday-cake-modal__spark--one" aria-hidden="true">✦</span>
        <span className="birthday-cake-modal__spark birthday-cake-modal__spark--two" aria-hidden="true">♡</span>
        <span className="birthday-cake-modal__spark birthday-cake-modal__spark--three" aria-hidden="true">✧</span>
        <CakeIllustration lit={lit} onLight={lightCandle} />
        <div className="birthday-cake-modal__copy" aria-live="polite">
          {!lit ? <p id="birthday-cake-title" className="birthday-cake-modal__wish">Make a wish! <span>♡</span><small>click the candle</small></p> : <p id="birthday-cake-title" className="birthday-cake-modal__birthday">Happy Birthday <span>♡</span></p>}
        </div>
      </section>
    </div>
  )
  return createPortal(modal, document.body)
}
