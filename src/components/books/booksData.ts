export const ALBUM_BOOKS = Array.from({ length: 13 }, (_, index) => ({
  id: index + 1,
  cover: `/images/albums/${index + 1}.jpg`,
  /** The page structure is deliberately empty until Liz's album material arrives. */
  pageCount: 6,
}))
