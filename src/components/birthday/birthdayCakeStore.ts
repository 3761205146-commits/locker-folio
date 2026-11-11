import { create } from 'zustand'

export type BirthdayCakePhase = 'idle' | 'expanded' | 'lit'

type BirthdayCakeState = {
  phase: BirthdayCakePhase
  openCake: () => void
  lightCandle: () => void
  resetCake: () => void
}

/** State for the cabinet cake and its DOM-only surprise experience. */
export const useBirthdayCakeStore = create<BirthdayCakeState>((set) => ({
  phase: 'idle',
  openCake: () => set({ phase: 'expanded' }),
  lightCandle: () => set((state) => state.phase === 'expanded' ? { phase: 'lit' } : state),
  resetCake: () => set({ phase: 'idle' }),
}))
