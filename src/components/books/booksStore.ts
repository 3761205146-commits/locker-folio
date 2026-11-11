import { create } from 'zustand'

type BooksState = {
  activeBook: number | null
  page: number
  openBook: (bookId: number) => void
  closeBook: () => void
  nextPage: () => void
  previousPage: () => void
}

export const useBooksStore = create<BooksState>((set) => ({
  activeBook: null,
  page: 0,
  openBook: (bookId) => set({ activeBook: bookId, page: 0 }),
  closeBook: () => set({ activeBook: null, page: 0 }),
  nextPage: () => set((state) => ({ page: Math.min(state.page + 2, 4) })),
  previousPage: () => set((state) => ({ page: Math.max(state.page - 2, 0) })),
}))
