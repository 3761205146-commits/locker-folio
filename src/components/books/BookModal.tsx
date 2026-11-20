import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ResponsivePhoto from '../images/ResponsivePhoto'
import { BOOK_COVER_SIZES, BOOK_PAGE_SIZES } from '../images/responsivePhotoSources'
import { ALBUM_BOOKS } from './booksData'
import { useBooksStore } from './booksStore'
import './books.css'

export default function BookModal() {
  const activeBook = useBooksStore((state) => state.activeBook)
  // Reset only book-local preparation when closing or changing books.
  return activeBook ? <OpenBookModal key={activeBook} /> : null
}

function OpenBookModal() {
  const activeBook = useBooksStore((state) => state.activeBook)
  const view = useBooksStore((state) => state.view)
  const page = useBooksStore((state) => state.page)
  const closeBook = useBooksStore((state) => state.closeBook)
  const startReading = useBooksStore((state) => state.startReading)
  const nextPage = useBooksStore((state) => state.nextPage)
  const previousPage = useBooksStore((state) => state.previousPage)
  const book = activeBook ? ALBUM_BOOKS[activeBook - 1] : null

  type Snapshot = { view: 'cover' | 'reading'; page: number; key: string }
  const [progress, setProgress] = useState<{ shown: Snapshot | null; ready: Record<string, string[]> }>({ shown: null, ready: {} })
  const { shown, ready } = progress
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const [request, setRequest] = useState({ view, page, attempt, serial: 0 })
  if (request.view !== view || request.page !== page || request.attempt !== attempt) {
    setRequest({ view, page, attempt, serial: request.serial + 1 })
  }
  const target = `${view}-${page}-${attempt}-${request.serial}`
  const [openingKey, setOpeningKey] = useState<string | null>(null)
  if (view === 'reading' && openingKey === null && request.view === view && request.page === page && request.attempt === attempt) setOpeningKey(target)
  const required = book ? (view === 'cover' ? [book.cover] : [book.cover, ...book.pages.slice(page, page + 2)]) : []
  const targetReady = required.length > 0 && required.every((src) => ready[target]?.includes(src))
  const pending = !shown || shown.view !== view || shown.page !== page || !targetReady

  useEffect(() => {
    if (!book) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBook()
      if (view === 'reading' && event.key === 'ArrowRight') nextPage(book.pageCount)
      if (view === 'reading' && event.key === 'ArrowLeft') previousPage()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [book, closeBook, nextPage, previousPage, view])

  if (!book) return null
  const isSeventhBook = book.id === 7
  const displayView = shown?.view ?? 'cover'
  const onReady = (src: string) => setProgress((previous) => {
    const current = useBooksStore.getState()
    if (current.activeBook !== book.id || current.view !== view || current.page !== page || previous.ready[target]?.includes(src)) return previous
    const loaded = [...(previous.ready[target] ?? []), src]
    return {
      ready: { ...previous.ready, [target]: loaded },
      shown: required.every((url) => loaded.includes(url)) ? { view, page, key: target } : previous.shown,
    }
  })
  const photo = (src: string, sizes: string, alt: string, preparing: boolean, cover = false) => (
    <ResponsivePhoto cancelPending src={src} sizes={sizes} alt={alt} loading="eager" decoding="async"
      className={cover && isSeventhBook ? 'album-book-modal__cover-art--seven' : undefined}
      onReady={preparing ? () => onReady(src) : undefined}
      onError={preparing ? () => setFailed(target) : undefined} />
  )
  const renderView = (state: { view: 'cover' | 'reading'; page: number }, preparing: boolean, layerKey: string) => state.view === 'cover' ? (
    <div className="album-book-modal__cover-stage">
      <button className="album-book-modal__cover-preview" type="button" onClick={startReading} disabled={pending} aria-label="Open book">
        {photo(book.cover, BOOK_COVER_SIZES, `Liz album cover ${book.id}`, preparing, true)}
      </button>
      <button className="album-book-modal__open" type="button" onClick={startReading} disabled={pending}>OPEN</button>
    </div>
  ) : (
    <>
      <div className="album-book-modal__spread">
        <div className={`album-book-modal__cover${layerKey !== openingKey ? ' album-book-modal__cover--opened' : ''}`} aria-hidden="true">{photo(book.cover, BOOK_COVER_SIZES, '', preparing, true)}</div>
        {[state.page, state.page + 1].map((index, side) => (
          <div className={`album-book-modal__page album-book-modal__page--${side ? 'right' : 'left'}${book.pages[index] ? '' : ' album-book-modal__page--empty'}`} key={index}>
            {book.pages[index] && photo(book.pages[index], BOOK_PAGE_SIZES, `Book ${book.id}, page ${index + 1}`, preparing)}
            {book.pages[index] && <span>{index + 1}</span>}
          </div>
        ))}
      </div>
      <div className="album-book-modal__controls">
        <button type="button" onClick={previousPage} disabled={page <= 0}>‹ Previous</button>
        <span>{Math.floor(state.page / 2) + 1} / {Math.ceil(book.pageCount / 2)}</span>
        <button type="button" onClick={() => nextPage(book.pageCount)} disabled={page + 2 >= book.pageCount}>Next ›</button>
      </div>
    </>
  )
  // Keep the previous decoded spread until its replacement is ready. The staged
  // DOM is promoted in place, retaining the very images whose decode completed.
  const layers = shown && !targetReady && (shown.view !== view || shown.page !== page)
    ? [{ ...shown, preparing: false }, { view, page, key: target, preparing: true }]
    : [{ view, page, key: target, preparing: true }]
  const neighbors = !pending && view === 'reading'
    ? [page - 2, page - 1, page + 2, page + 3].filter((index) => index >= 0 && index < book.pages.length)
    : []
  const modal = (
    <div className="album-book-modal" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) closeBook() }}>
      <section className={`album-book-modal__book album-book-modal__book--${displayView}`} role="dialog" aria-modal="true" aria-label={`Album book ${book.id}`}>
        <button className="album-book-modal__close" type="button" onClick={closeBook} aria-label="Close book">×</button>
        {layers.map((layer) => (
          <div key={layer.key} className={`album-book-modal__layer${layer.preparing && !targetReady ? ' album-book-modal__layer--pending' : ''}`} aria-hidden={layer.preparing && !targetReady}>
            {renderView(layer, layer.preparing, layer.key)}
          </div>
        ))}
        {pending && <div className="album-book-modal__load-state" role={failed === target ? 'alert' : 'status'}>
          {failed === target ? <>图片加载失败 <button type="button" onClick={() => { setFailed(null); setAttempt((value) => value + 1) }}>重试</button></> : '图片加载中…'}
        </div>}
        <div className="album-book-modal__preload" aria-hidden="true">
          {neighbors.map((index) => <ResponsivePhoto cancelPending key={book.pages[index]} src={book.pages[index]} sizes={BOOK_PAGE_SIZES} alt="" loading="eager" fetchPriority="low" />)}
        </div>
      </section>
    </div>
  )
  return createPortal(modal, document.body)
}
