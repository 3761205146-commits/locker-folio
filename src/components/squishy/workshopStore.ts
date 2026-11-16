import { create } from 'zustand'
export const useWorkshopStore = create<{ open: boolean; openWorkshop: () => void; closeWorkshop: () => void }>((set) => ({
  open: false,
  openWorkshop: () => set({ open: true }),
  closeWorkshop: () => set({ open: false }),
}))
