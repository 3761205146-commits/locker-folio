import { FRAME_HEIGHT, FRAME_WIDTH, type BoothFrame, type PhotoWindow } from './frames'
export type Shot = { src: string; zoom: number; offsetX: number; offsetY: number }
export const freshShot = (src: string): Shot => ({ src, zoom: 1, offsetX: 0, offsetY: 0 })
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片读取失败，请重新选择。'))
    image.src = src
  })
}

/** Identical cover crop for live review and full-resolution export. */
export function drawCover(ctx: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, rect: PhotoWindow, crop: Pick<Shot, 'zoom' | 'offsetX' | 'offsetY'>, mirror = false) {
  const ratio = Math.max(rect.width / width, rect.height / height) * crop.zoom
  const dw = width * ratio, dh = height * ratio
  const x = rect.x + (rect.width - dw) / 2 + crop.offsetX * (dw - rect.width) / 2
  const y = rect.y + (rect.height - dh) / 2 + crop.offsetY * (dh - rect.height) / 2
  ctx.save()
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip()
  if (mirror) { ctx.translate(x + dw, y); ctx.scale(-1, 1); ctx.drawImage(source, 0, 0, dw, dh) }
  else ctx.drawImage(source, x, y, dw, dh)
  ctx.restore()
}

export async function compose(frame: BoothFrame, shots: readonly (Shot | null)[], canvas: HTMLCanvasElement, scale = 1) {
  const [art, ...photos] = await Promise.all([loadImage(frame.url), ...shots.map((shot) => shot ? loadImage(shot.src) : Promise.resolve(null))])
  canvas.width = Math.round(FRAME_WIDTH * scale)
  canvas.height = Math.round(FRAME_HEIGHT * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.imageSmoothingQuality = 'high'
  photos.forEach((photo, index) => {
    const shot = shots[index]
    if (photo && shot) drawCover(ctx, photo, photo.naturalWidth, photo.naturalHeight, frame.windows[index], shot)
  })
  ctx.drawImage(art!, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
}
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片合成失败，请重试。')), 'image/png'))
}
