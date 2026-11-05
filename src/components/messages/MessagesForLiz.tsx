import { Html } from '@react-three/drei'
import { useGuestbookStore, type LizMessage } from './guestbookStore'
import './messages-for-liz.css'

export type { LizMessage, LizMessagesDataSource } from './guestbookStore'

const AVATARS: Record<LizMessage['avatar'], string> = { heart: '♥', cloud: '☁', cat: 'ᓚ₍^. .^₎' }

export function MessageList({ messages }: { messages: LizMessage[] }) {
  return messages.map((message) => (
    <article className={`ml-note${message.pending ? ' ml-note--new' : ''}`} key={message.id}>
      <span className={`ml-note__avatar ml-note__avatar--${message.avatar}`} aria-hidden="true">{AVATARS[message.avatar]}</span>
      <div><div className="ml-note__meta"><strong>{message.nickname}</strong><time>{message.createdAt}</time></div><p>{message.body}</p></div>
    </article>
  ))
}

/** Compact 3D-door preview. The fullscreen Modal is deliberately mounted outside Canvas. */
export default function MessagesForLiz() {
  const messages = useGuestbookStore((state) => state.messages)
  const open = useGuestbookStore((state) => state.setOpen)
  return (
    <Html transform distanceFactor={1.15} zIndexRange={[0, 0]}>
      <section className="ml-card" aria-label="Messages for Liz 留言板，点击展开" role="button" tabIndex={0} onClick={() => open(true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') open(true) }}>
        <span className="ml-card__tape ml-card__tape--left" aria-hidden="true" /><span className="ml-card__tape ml-card__tape--right" aria-hidden="true" />
        <header className="ml-card__header"><div><p>birthday mailbox</p><h2>Messages for Liz ♡</h2></div><span className="ml-card__open" aria-hidden="true">↗</span></header>
        <div className="ml-card__notes"><MessageList messages={messages.slice(0, 3)} /></div><p className="ml-card__hint">点击展开并写下祝福</p>
      </section>
    </Html>
  )
}
