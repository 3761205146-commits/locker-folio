import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../lib/supabase'
import type { LizMessage, LizMessagesDataSource } from './guestbookStore'

type GuestbookRow = {
  id: string
  nickname: string
  message: string
  created_at: string
}

const TABLE = 'guestbook_messages'

function avatarFor(id: string): LizMessage['avatar'] {
  const index = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0) % 3
  return ['heart', 'cloud', 'cat'][index] as LizMessage['avatar']
}

function toLizMessage(row: GuestbookRow): LizMessage {
  return {
    id: row.id,
    nickname: row.nickname,
    body: row.message,
    createdAt: row.created_at,
    avatar: avatarFor(row.id),
  }
}

function requireClient() {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase 尚未配置。请在 .env.local 中填写 VITE_SUPABASE_PUBLISHABLE_KEY。')
  return client
}

export const supabaseGuestbookDataSource: LizMessagesDataSource = {
  async listLatest() {
    const { data, error } = await requireClient()
      .from(TABLE)
      .select('id, nickname, message, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as GuestbookRow[]).map(toLizMessage)
  },

  async create({ nickname, body }) {
    const { data, error } = await requireClient()
      .from(TABLE)
      .insert({ nickname, message: body })
      .select('id, nickname, message, created_at')
      .single()

    if (error) throw error
    return toLizMessage(data as GuestbookRow)
  },

  subscribe(onMessage) {
    const client = requireClient()
    const channel: RealtimeChannel = client
      .channel('guestbook_messages-inserts')
      .on<GuestbookRow>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: TABLE },
        (payload) => onMessage(toLizMessage(payload.new)),
      )
      .subscribe()

    return () => { void client.removeChannel(channel) }
  },
}
