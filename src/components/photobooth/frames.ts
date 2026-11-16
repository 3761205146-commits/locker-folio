export type PhotoWindow = { x: number; y: number; width: number; height: number }
export type BoothFrame = { id: number; title: string; subtitle: string; url: string; windows: readonly PhotoWindow[] }

// Measured from the original 1515 × 4500 PNG alpha channels. Separate islands
// within a row (around portraits / decorations) belong to the same photo.
// Photos sit BELOW the untouched PNG; opaque black artwork is never a mask.
export const FRAME_WIDTH = 1515
export const FRAME_HEIGHT = 4500
export const FRAMES: readonly BoothFrame[] = [
  { id: 1, title: '蓝色珍珠', subtitle: 'BLUE PEARL · 海浪与心动', url: `${import.meta.env.BASE_URL}assets/photobooth/人生四宫格1.png`, windows: [
    { x: 160, y: 210, width: 1196, height: 820 },
    { x: 170, y: 1141, width: 1180, height: 830 },
    { x: 160, y: 2081, width: 1196, height: 821 },
    { x: 160, y: 3012, width: 1196, height: 782 },
  ] },
  { id: 2, title: '黑白来信', subtitle: 'LOVE LETTER · 记录这一刻', url: `${import.meta.env.BASE_URL}assets/photobooth/人生四宫格2.png`, windows: [
    { x: 210, y: 163, width: 1095, height: 815 },
    { x: 187, y: 1129, width: 1144, height: 778 },
    { x: 210, y: 2055, width: 1095, height: 876 },
    { x: 187, y: 3097, width: 1144, height: 793 },
  ] },
]
