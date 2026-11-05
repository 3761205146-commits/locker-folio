import { create } from 'zustand'

export type LizMessage = {
  id: string
  nickname: string
  body: string
  createdAt: string
  avatar: 'heart' | 'cloud' | 'cat'
  pending?: boolean
}

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

type GuestbookState = {
  open: boolean
  messages: LizMessage[]
  nickname: string
  body: string
  sent: boolean
  setOpen: (open: boolean) => void
  setNickname: (nickname: string) => void
  setBody: (body: string) => void
  sendLocal: () => boolean
  clearSent: () => void
}

export const useGuestbookStore = create<GuestbookState>((set, get) => ({
  open: false,
  messages: SAMPLE_MESSAGES,
  nickname: '',
  body: '',
  sent: false,
  setOpen: (open) => set({ open }),
  setNickname: (nickname) => set({ nickname }),
  setBody: (body) => set({ body }),
  clearSent: () => set({ sent: false }),
  sendLocal: () => {
    const { body, nickname } = get()
    const cleanBody = body.trim()
    if (!cleanBody) return false
    const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())
    set((state) => ({
      body: '',
      sent: true,
      messages: [{ id: `local-${Date.now()}`, nickname: nickname.trim() || '匿名朋友', body: cleanBody, createdAt: `刚刚 ${time}`, avatar: 'heart', pending: true }, ...state.messages],
    }))
    return true
  },
}))
