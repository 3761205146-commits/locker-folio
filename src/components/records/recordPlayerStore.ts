import { create } from 'zustand'
import { findRecord, type RecordId } from './recordCatalog'

type RecordPlayerState = {
  activeId: RecordId | null
  preparedId: RecordId | null
  isPlaying: boolean
  progressById: Partial<Record<RecordId, number>>
  durationById: Partial<Record<RecordId, number>>
  toggle: (id: RecordId) => Promise<void>
  prepare: (id: RecordId) => void
  seek: (id: RecordId, progress: number) => void
}

let player: HTMLAudioElement | null = null

/** A module-level audio element deliberately outlives the collection modal. */
function audio() {
  if (player) return player
  player = new Audio()
  player.preload = 'metadata'
  player.addEventListener('play', () => useRecordPlayerStore.setState({ isPlaying: true }))
  player.addEventListener('pause', () => useRecordPlayerStore.setState({ isPlaying: false }))
  player.addEventListener('ended', () => useRecordPlayerStore.setState({ isPlaying: false }))
  player.addEventListener('loadedmetadata', () => {
    const { activeId, preparedId } = useRecordPlayerStore.getState()
    const id = activeId ?? preparedId
    if (!id || !Number.isFinite(player?.duration)) return
    useRecordPlayerStore.setState((state) => ({ durationById: { ...state.durationById, [id]: player!.duration } }))
  })
  player.addEventListener('timeupdate', () => {
    const { activeId } = useRecordPlayerStore.getState()
    if (!activeId || !Number.isFinite(player?.duration) || !player?.duration) return
    useRecordPlayerStore.setState((state) => ({ progressById: { ...state.progressById, [activeId]: Math.min(player!.currentTime / player!.duration, 1) } }))
  })
  return player
}

export const useRecordPlayerStore = create<RecordPlayerState>((set, get) => ({
  activeId: null,
  preparedId: null,
  isPlaying: false,
  progressById: {},
  durationById: {},
  prepare: (id) => {
    // A hovered/focused/pressed song is explicit intent. Never replace an
    // active song, including a paused one whose progress must be preserved.
    if (get().activeId !== null || get().preparedId === id) return
    const record = findRecord(id)
    if (!record?.audioSrc) return
    const element = audio()
    if (!element.paused) return
    set({ preparedId: id })
    element.src = record.audioSrc
  },
  toggle: async (id) => {
    const record = findRecord(id)
    if (!record?.audioSrc) return
    const element = audio()
    const { activeId, isPlaying } = get()
    if (activeId === id) {
      if (isPlaying) element.pause()
      else await element.play()
      return
    }
    // One singleton element guarantees switching songs never layers their audio.
    element.pause()
    // Reuse the exact singleton/source prepared by intent, without restarting
    // its metadata request. Song selection still starts at the original zero.
    if (get().preparedId !== id || !element.src) element.src = record.audioSrc
    element.currentTime = 0
    set((state) => ({ activeId: id, preparedId: id, isPlaying: false,
      progressById: { ...state.progressById, [id]: 0 },
      durationById: Number.isFinite(element.duration) ? { ...state.durationById, [id]: element.duration } : state.durationById,
    }))
    try { await element.play() } catch { set({ isPlaying: false }) }
  },
  seek: (id, progress) => {
    const element = audio()
    if (get().activeId !== id || !Number.isFinite(element.duration)) return
    element.currentTime = Math.max(0, Math.min(1, progress)) * element.duration
    set((state) => ({ progressById: { ...state.progressById, [id]: progress } }))
  },
}))
