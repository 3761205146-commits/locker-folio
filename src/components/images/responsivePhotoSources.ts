import manifest from './responsive-photos.json'
export type Photo = { width: number; height: number; widths: number[]; originalWidths?: number[] }
export const photos: Record<string, Photo> = manifest
const base = import.meta.env.BASE_URL
export const photoKey = (src: string) => src.startsWith(base) ? '/' + src.slice(base.length) : src
export function photoSource(original: string, width: number, photo: Photo, fallback: string) {
  // Some already-compressed small JPEGs beat a native-resolution WebP.
  if (photo.originalWidths?.includes(width)) return fallback
  return base + original.replace(/^\/images\//, 'images/responsive/').replace(/\.jpg$/i, `-${width}.webp`)
}
// Conservative bounds from books.css (two page columns minus padding) and
// about.css. srcset is a choice list; it does not preload all the candidates.
export const BOOK_PAGE_SIZES = '(max-width: 600px) calc(50vw - 30px), (max-width: 915px) 43vw, 390px'
export const BOOK_COVER_SIZES = '(max-width: 600px) calc(100vw - 44px), 472px'
export const PROFILE_SIZES = 'min(94vw, 1180px, 132.86vh)'
