import { create } from 'zustand'

export const HERO_TEXTURE_URLS = [
  '/assets/obj/liz/liz-left-poster.jpg',
  '/assets/obj/findaword2.webp',
  '/assets/obj2/polaroid-liz/photo-1.jpg',
  '/assets/obj2/polaroid-liz/photo-2.jpg',
  '/assets/obj2/polaroid-liz/photo-3.jpg',
  '/assets/obj/liz/liz-about-card.png',
  '/assets/obj/idcard2.webp',
  '/images/cheez-plush-face.png',
] as const

export const useScenePreparation = create<{
  resourcesAcquired: boolean
  texturesPrepared: boolean
  sceneRenderable: boolean
  failures: string[]
  fatal: boolean
  generation: number
  retry: () => void
}>((set) => ({
  resourcesAcquired: false, texturesPrepared: false, sceneRenderable: false,
  failures: [], fatal: false, generation: 0,
  retry: () => set((s) => ({ resourcesAcquired: false, texturesPrepared: false,
    sceneRenderable: false, failures: [], fatal: false, generation: s.generation + 1 })),
}))
