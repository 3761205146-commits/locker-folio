import { Html } from '@react-three/drei'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './messages-for-liz.css'

/** First-stage client model. A future Supabase adapter implements this contract. */
export type LizMessage = {
  id: string
  nickname: string
  body: string
  createdAt: string
  avatar: 'heart' | 'cloud' | 'cat'
  pending?: boolean
}

/** Reserved for the database and realtime-subscription phase. */
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

function formatLocalTime() {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())
}

/**
 * Door-mounted, local-only message-board prototype.
 * It intentionally does not persist or claim realtime behaviour before a data source is attached.
 */
export default function MessagesForLiz() {
  const [messages, setMessages] = useState(SAMPLE_MESSAGES)
  const [nickname, setNickname] = useState('')
  const [body, setBody] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!sent) return
    const timer = window.setTimeout(() => setSent(false), 2200)
    return () => window.clearTimeout(timer)
  }, [sent])

  const visibleMessages = useMemo(() => (expanded ? messages : messages.slice(0, 3)), [expanded, messages])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanBody = body.trim()
    if (!cleanBody) return
    const message: LizMessage = {
      id: `local-${Date.now()}`,
      nickname: nickname.trim() || '匿名朋友',
      body: cleanBody,
      createdAt: `刚刚 ${formatLocalTime()}`,
      avatar: 'heart',
      pending: true,
    }
    setMessages((current) => [message, ...current])
    setBody('')
    setSent(true)
  }

  return (
    <Html transform distanceFactor={1.15} zIndexRange={[0, 0]}>
      <section className={`ml-card${expanded ? ' ml-card--expanded' : ''}`} aria-label="Messages for Liz 留言板">
        <span className="ml-card__tape ml-card__tape--left" aria-hidden="true" />
        <span className="ml-card__tape ml-card__tape--right" aria-hidden="true" />
        <header className="ml-card__header">
          <div>
            <p className="ml-card__eyebrow">a little birthday mailbox</p>
            <h2>Messages for Liz <span aria-hidden="true">♡</span></h2>
          </div>
          <button
            className="ml-card__expand"
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? '收起留言板' : '展开全部留言'}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? '−' : '↗'}
          </button>
        </header>

        <div className="ml-card__notes" aria-live="polite">
          {visibleMessages.map((message) => (
            <article className={`ml-note${message.pending ? ' ml-note--new' : ''}`} key={message.id}>
              <span className={`ml-note__avatar ml-note__avatar--${message.avatar}`} aria-hidden="true">{AVATARS[message.avatar]}</span>
              <div>
                <div className="ml-note__meta"><strong>{message.nickname}</strong><time>{message.createdAt}</time></div>
                <p>{message.body}</p>
              </div>
            </article>
          ))}
        </div>

        <form className="ml-card__form" onSubmit={submit}>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={18} placeholder="昵称" aria-label="昵称" />
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={140} placeholder="写下你的祝福……" aria-label="祝福内容" rows={expanded ? 3 : 2} />
          <button type="submit" className="ml-card__send" aria-label="发送祝福">♥</button>
        </form>
        <p className={`ml-card__feedback${sent ? ' ml-card__feedback--show' : ''}`} role="status">已放进 Liz 的生日信箱 ♡</p>
        <p className="ml-card__prototype">示例留言 · 云端同步即将开启</p>
      </section>
    </Html>
  )
}
