import { create } from 'zustand'
import { findRecord, type RecordId } from './recordCatalog'

type RecordPlayerState = {
  activeId: RecordId | null
  isPlaying: boolean
  progressById: Partial<Record<RecordId, number>>
  durationById: Partial<Record<RecordId, number>>
  toggle: (id: RecordId) => Promise<void>
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
    const { activeId } = useRecordPlayerStore.getState()
    if (!activeId || !Number.isFinite(player?.duration)) return
    useRecordPlayerStore.setState((state) => ({ durationById: { ...state.durationById, [activeId]: player!.duration } }))
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
  isPlaying: false,
  progressById: {},
  durationById: {},
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
    element.src = record.audioSrc
    element.currentTime = 0
    set((state) => ({ activeId: id, isPlaying: false, progressById: { ...state.progressById, [id]: 0 } }))
    try { await element.play() } catch { set({ isPlaying: false }) }
  },
  seek: (id, progress) => {
    const element = audio()
    if (get().activeId !== id || !Number.isFinite(element.duration)) return
    element.currentTime = Math.max(0, Math.min(1, progress)) * element.duration
    set((state) => ({ progressById: { ...state.progressById, [id]: progress } }))
  },
}))
