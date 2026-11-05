import { Html } from '@react-three/drei'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import './messages-for-liz.css'

export type LizMessage = { id: string; nickname: string; body: string; createdAt: string; avatar: 'heart' | 'cloud' | 'cat'; pending?: boolean }

/** Reserved for the Supabase persistence and realtime phase. */
export type LizMessagesDataSource = {
  listLatest: () => Promise<LizMessage[]>
  create: (message: Pick<LizMessage, 'nickname' | 'body'>) => Promise<LizMessage>
  subscribe: (onMessage: (message: LizMessage) => void) => () => void
}

const SAMPLE_MESSAGES: LizMessage[] = [
  { id: 'sample-3', nickname: 'Mia', body: '愿你的 22 岁像天空一样明亮自由。', createdAt: '今天 10:21', avatar: 'cloud' },
  { id: 'sample-2', nickname: '阿棠', body: '生日快乐，永远被温柔和爱包围 ♡', createdAt: '今天 09:48', avatar: 'heart' },
  { id: 'sample-1', nickname: '小猫同学', body: '把所有闪闪发光的祝福都送给 Liz！', createdAt: '昨天 22:16', avatar: 'cat' },
]
const AVATARS: Record<LizMessage['avatar'], string> = { heart: '♥', cloud: '☁', cat: 'ᓚ₍^. .^₎' }

function MessageList({ messages }: { messages: LizMessage[] }) {
  return messages.map((message) => (
    <article className={`ml-note${message.pending ? ' ml-note--new' : ''}`} key={message.id}>
      <span className={`ml-note__avatar ml-note__avatar--${message.avatar}`} aria-hidden="true">{AVATARS[message.avatar]}</span>
      <div><div className="ml-note__meta"><strong>{message.nickname}</strong><time>{message.createdAt}</time></div><p>{message.body}</p></div>
    </article>
  ))
}

/** Door preview plus a body-level fullscreen guestbook. Local-only until a data source is attached. */
export default function MessagesForLiz() {
  const [messages, setMessages] = useState(SAMPLE_MESSAGES)
  const [nickname, setNickname] = useState('')
  const [body, setBody] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [sent, setSent] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const close = () => setExpanded(false)
  const open = () => setExpanded(true)

  useEffect(() => {
    if (!sent) return
    const timer = window.setTimeout(() => setSent(false), 2200)
    return () => window.clearTimeout(timer)
  }, [sent])
  useEffect(() => {
    if (!expanded) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])
  useEffect(() => {
    if (!expanded) return
    const frame = window.requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0, behavior: sent ? 'smooth' : 'auto' }))
    return () => window.cancelAnimationFrame(frame)
  }, [expanded, messages.length, sent])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanBody = body.trim()
    if (!cleanBody) return
    setMessages((current) => [{ id: `local-${Date.now()}`, nickname: nickname.trim() || '匿名朋友', body: cleanBody, createdAt: `刚刚 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`, avatar: 'heart', pending: true }, ...current])
    setBody('')
    setSent(true)
  }

  const fullScreen = expanded && createPortal(
    <div className="ml-modal" role="presentation" onMouseDown={close}>
      <section className="ml-modal__panel" role="dialog" aria-modal="true" aria-labelledby="ml-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="ml-modal__tape ml-modal__tape--left" aria-hidden="true" /><span className="ml-modal__tape ml-modal__tape--right" aria-hidden="true" />
        <header className="ml-modal__header"><div><p>a little birthday mailbox</p><h2 id="ml-modal-title">Messages for Liz <span aria-hidden="true">♡</span></h2></div><button type="button" className="ml-modal__close" aria-label="关闭留言板" onClick={close}>×</button></header>
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
    </div>, document.body,
  )

  return <><Html transform distanceFactor={1.15} zIndexRange={[0, 0]}><section className="ml-card" aria-label="Messages for Liz 留言板，点击展开" role="button" tabIndex={0} onClick={open} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') open() }}>
    <span className="ml-card__tape ml-card__tape--left" aria-hidden="true" /><span className="ml-card__tape ml-card__tape--right" aria-hidden="true" />
    <header className="ml-card__header"><div><p>birthday mailbox</p><h2>Messages for Liz ♡</h2></div><span className="ml-card__open" aria-hidden="true">↗</span></header>
    <div className="ml-card__notes"><MessageList messages={messages.slice(0, 3)} /></div><p className="ml-card__hint">点击展开并写下祝福</p>
  </section></Html>{fullScreen}</>
}
