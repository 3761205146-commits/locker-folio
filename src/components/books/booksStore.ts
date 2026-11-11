import { create } from 'zustand'

type BooksState = {
  activeBook: number | null
  view: 'cover' | 'reading'
  page: number
  openBook: (bookId: number) => void
  startReading: () => void
  closeBook: () => void
  nextPage: () => void
  previousPage: () => void
}

export const useBooksStore = create<BooksState>((set) => ({
  activeBook: null,
  view: 'cover',
  page: 0,
  openBook: (bookId) => set({ activeBook: bookId, view: 'cover', page: 0 }),
  startReading: () => set({ view: 'reading', page: 0 }),
  closeBook: () => set({ activeBook: null, view: 'cover', page: 0 }),
  nextPage: () => set((state) => ({ page: Math.min(state.page + 2, 4) })),
  previousPage: () => set((state) => ({ page: Math.max(state.page - 2, 0) })),
}))
