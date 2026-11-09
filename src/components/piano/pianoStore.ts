import { create } from 'zustand'

export type MelodyState = 'idle' | 'playing' | 'paused'

type PianoState = {
  open: boolean
  melodyState: MelodyState
  setOpen: (open: boolean) => void
  setMelodyState: (state: MelodyState) => void
}

export const usePianoStore = create<PianoState>((set) => ({
  open: false,
  melodyState: 'idle',
  setOpen: (open) => set({ open, ...(open ? {} : { melodyState: 'idle' }) }),
  setMelodyState: (melodyState) => set({ melodyState }),
}))
