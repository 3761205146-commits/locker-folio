import { useEffect, useRef, type FormEvent } from 'react'
import { useGuestbookStore } from './guestbookStore'
import { MessageList } from './MessagesForLiz'

/** Fullscreen DOM Modal. It is rendered by App, never by the R3F Canvas renderer. */
export default function MessagesForLizModal() {
  const open = useGuestbookStore((state) => state.open)
  const setOpen = useGuestbookStore((state) => state.setOpen)
  const messages = useGuestbookStore((state) => state.messages)
  const nickname = useGuestbookStore((state) => state.nickname)
  const body = useGuestbookStore((state) => state.body)
  const sent = useGuestbookStore((state) => state.sent)
  const setNickname = useGuestbookStore((state) => state.setNickname)
  const setBody = useGuestbookStore((state) => state.setBody)
  const sendLocal = useGuestbookStore((state) => state.sendLocal)
  const clearSent = useGuestbookStore((state) => state.clearSent)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])
  useEffect(() => {
    if (!sent) return
    const timer = window.setTimeout(clearSent, 2200)
    return () => window.clearTimeout(timer)
  }, [clearSent, sent])
  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0, behavior: sent ? 'smooth' : 'auto' }))
    return () => window.cancelAnimationFrame(frame)
  }, [messages.length, open, sent])

  if (!open) return null
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); sendLocal() }
  return (
    <div className="ml-modal" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="ml-modal__panel" role="dialog" aria-modal="true" aria-labelledby="ml-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="ml-modal__tape ml-modal__tape--left" aria-hidden="true" /><span className="ml-modal__tape ml-modal__tape--right" aria-hidden="true" />
        <header className="ml-modal__header"><div><p>a little birthday mailbox</p><h2 id="ml-modal-title">Messages for Liz <span aria-hidden="true">♡</span></h2></div><button type="button" className="ml-modal__close" aria-label="关闭留言板" onClick={() => setOpen(false)}>×</button></header>
        <div className="ml-modal__body">
          <div className="ml-modal__messages" ref={listRef} aria-live="polite"><MessageList messages={messages} /></div>
          <form className="ml-modal__form" onSubmit={submit}>
            <label><span>你的昵称</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={18} placeholder="昵称" /></label>
            <label><span>生日祝福</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={140} placeholder="写下你的祝福……" rows={4} /></label>
            <button type="submit" className="ml-modal__send">♥ <span>发送给 Liz</span></button>
            <p className={`ml-modal__feedback${sent ? ' ml-modal__feedback--show' : ''}`} role="status">已放进 Liz 的生日信箱 ♡</p>
          </form>
        </div>
        <p className="ml-modal__prototype">示例留言 · 当前仅作前端演示，云端同步即将开启</p>
      </section>
    </div>
  )
}
