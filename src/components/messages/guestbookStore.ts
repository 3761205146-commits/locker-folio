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

type GuestbookStatus = 'idle' | 'loading' | 'ready' | 'error'

function byNewest(messages: LizMessage[]) {
  return [...messages].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
}

type GuestbookState = {
  open: boolean
  messages: LizMessage[]
  nickname: string
  body: string
  sent: boolean
  status: GuestbookStatus
  error: string | null
  isSending: boolean
  setOpen: (open: boolean) => void
  setNickname: (nickname: string) => void
  setBody: (body: string) => void
  startSync: () => () => void
  sendMessage: () => Promise<boolean>
  clearSent: () => void
}

export const useGuestbookStore = create<GuestbookState>((set, get) => ({
  open: false,
  messages: [],
  nickname: '',
  body: '',
  sent: false,
  status: 'idle',
  error: null,
  isSending: false,
  setOpen: (open) => set({ open }),
  setNickname: (nickname) => set({ nickname }),
  setBody: (body) => set({ body }),
  clearSent: () => set({ sent: false }),
  startSync: () => {
    let active = true
    let stopRealtime: () => void = () => {}
    void import('./guestbookDataSource').then(async ({ supabaseGuestbookDataSource }) => {
      try {
        if (!active) return
        set({ status: 'loading', error: null })
        const messages = await supabaseGuestbookDataSource.listLatest()
        if (!active) return
        set({ messages: byNewest(messages), status: 'ready' })
        stopRealtime = supabaseGuestbookDataSource.subscribe((message) => {
          if (!active) return
          set((state) => ({
            messages: byNewest([message, ...state.messages.filter((item) => item.id !== message.id)]),
          }))
        })
      } catch (error) {
        if (!active) return
        set({ status: 'error', error: error instanceof Error ? error.message : '暂时无法读取留言，请稍后重试。' })
      }
    })
    return () => { active = false; stopRealtime() }
  },
  sendMessage: async () => {
    const { body, nickname } = get()
    const cleanBody = body.trim()
    const cleanNickname = nickname.trim()
    if (!cleanNickname || !cleanBody) {
      set({ error: '请填写昵称和生日祝福。' })
      return false
    }
    if (cleanNickname.length > 30 || cleanBody.length > 300) {
      set({ error: '昵称最多 30 个字符，祝福最多 300 个字符。' })
      return false
    }
    set({ isSending: true, error: null, sent: false })
    try {
      const { supabaseGuestbookDataSource } = await import('./guestbookDataSource')
      const message = await supabaseGuestbookDataSource.create({ nickname: cleanNickname, body: cleanBody })
      set((state) => ({
        body: '',
        sent: true,
        isSending: false,
        messages: byNewest([message, ...state.messages.filter((item) => item.id !== message.id)]),
      }))
      return true
    } catch (error) {
      set({ isSending: false, error: error instanceof Error ? error.message : '发送失败，请稍后重试。' })
      return false
    }
  },
}))
