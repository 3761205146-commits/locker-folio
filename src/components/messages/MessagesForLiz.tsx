import { Html } from '@react-three/drei'
import { useGuestbookStore, type LizMessage } from './guestbookStore'
import './messages-for-liz.css'

export type { LizMessage, LizMessagesDataSource } from './guestbookStore'

const AVATARS: Record<LizMessage['avatar'], string> = { heart: '♥', cloud: '☁', cat: 'ᓚ₍^. .^₎' }

function displayTime(createdAt: string) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return createdAt
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function MessageList({ messages }: { messages: LizMessage[] }) {
  return messages.map((message) => (
    <article className={`ml-note${message.pending ? ' ml-note--new' : ''}`} key={message.id}>
      <span className={`ml-note__avatar ml-note__avatar--${message.avatar}`} aria-hidden="true">{AVATARS[message.avatar]}</span>
      <div><div className="ml-note__meta"><strong>{message.nickname}</strong><time>{displayTime(message.createdAt)}</time></div><p>{message.body}</p></div>
    </article>
  ))
}

/** Compact 3D-door preview. The fullscreen Modal is deliberately mounted outside Canvas. */
export default function MessagesForLiz() {
  const open = useGuestbookStore((state) => state.setOpen)
  return (
    <Html transform distanceFactor={1.15} zIndexRange={[0, 0]}>
      <button className="ml-toast" type="button" aria-label="Messages for Liz 留言板，点击展开" onClick={() => open(true)}>
        <img className="ml-toast__image" src="/images/guestbook-toast-clean.png" alt="小猫吐司留言板" />
      </button>
    </Html>
  )
}
