import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ALBUM_BOOKS } from './booksData'
import { useBooksStore } from './booksStore'
import './books.css'

export default function BookModal() {
  const activeBook = useBooksStore((state) => state.activeBook)
  const view = useBooksStore((state) => state.view)
  const page = useBooksStore((state) => state.page)
  const closeBook = useBooksStore((state) => state.closeBook)
  const startReading = useBooksStore((state) => state.startReading)
  const nextPage = useBooksStore((state) => state.nextPage)
  const previousPage = useBooksStore((state) => state.previousPage)
  const book = activeBook ? ALBUM_BOOKS[activeBook - 1] : null

  useEffect(() => {
    if (!book) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBook()
      if (view === 'reading' && event.key === 'ArrowRight') nextPage()
      if (view === 'reading' && event.key === 'ArrowLeft') previousPage()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [book, closeBook, nextPage, previousPage, view])

  if (!book) return null
  const canPrevious = page > 0
  const canNext = page + 2 < book.pageCount
  const modal = (
    <div className="album-book-modal" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) closeBook() }}>
      <section className={`album-book-modal__book album-book-modal__book--${view}`} role="dialog" aria-modal="true" aria-label={`Album book ${book.id}`}>
        <button className="album-book-modal__close" type="button" onClick={closeBook} aria-label="Close book">×</button>
        {view === 'cover' ? (
          <div className="album-book-modal__cover-stage">
            <button className="album-book-modal__cover-preview" type="button" onClick={startReading} aria-label="Open book">
              <img src={book.cover} alt={`Liz album cover ${book.id}`} />
            </button>
            <button className="album-book-modal__open" type="button" onClick={startReading}>打开书本</button>
          </div>
        ) : (
          <>
            <div className="album-book-modal__spread">
              <div className="album-book-modal__cover" aria-hidden="true"><img src={book.cover} alt="" /></div>
              <div className="album-book-modal__page album-book-modal__page--left" key={`left-${book.id}-${page}`}><span>{page + 1}</span></div>
              <div className="album-book-modal__page album-book-modal__page--right" key={`right-${book.id}-${page}`}><span>{page + 2}</span></div>
            </div>
            <div className="album-book-modal__controls">
              <button type="button" onClick={previousPage} disabled={!canPrevious}>‹ Previous</button>
              <span>{page / 2 + 1} / {Math.ceil(book.pageCount / 2)}</span>
              <button type="button" onClick={nextPage} disabled={!canNext}>Next ›</button>
            </div>
          </>
        )}
      </section>
    </div>
  )
  return createPortal(modal, document.body)
}
