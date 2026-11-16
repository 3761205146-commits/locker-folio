import { create } from 'zustand'
export const usePhotoboothStore = create<{ open: boolean; openBooth: () => void; closeBooth: () => void }>((set) => ({
  open: false,
  openBooth: () => set({ open: true }),
  closeBooth: () => set({ open: false }),
}))
