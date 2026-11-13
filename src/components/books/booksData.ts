import { ALBUM_BOOK_PAGES } from './bookPages'

export const ALBUM_BOOKS = Array.from({ length: 13 }, (_, index) => ({
  id: index + 1,
  cover: `/images/albums/${index + 1}.jpg`,
  /** Pages are isolated by book and follow the original ZIP entry order. */
  pages: ALBUM_BOOK_PAGES[index + 1],
  pageCount: ALBUM_BOOK_PAGES[index + 1].length,
}))
