import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react'
import { photos, photoKey, photoSource } from './responsivePhotoSources'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes' | 'onError'> & { src: string; sizes: string; onReady?: () => void; onError?: () => void; cancelPending?: boolean }
function PhotoSource({ src, sizes, decoding = 'async', onReady, onError, onLoad, cancelPending = false, ...props }: Props) {
  const image = useRef<HTMLImageElement>(null)
  const active = useRef(false)
  const revision = useRef(0)
  useEffect(() => {
    active.current = true
    revision.current++
    const node = image.current
    return () => {
      active.current = false
      // Best-effort cancellation of this node's unfinished request only.
      // Completed browser cache entries and other consumers remain untouched.
      if (cancelPending && node && !node.complete) {
        node.removeAttribute('srcset')
        node.removeAttribute('src')
      }
    }
  }, [cancelPending])
  const [originalOnly, setOriginalOnly] = useState(false)
  const original = photoKey(src)
  const photo = photos[original]
  const optimized = photo && !originalOnly
  return <img {...props} ref={image} decoding={decoding}
    srcSet={optimized ? photo.widths.map((width) => `${photoSource(original, width, photo, src)} ${width}w`).join(', ') : undefined}
    sizes={optimized ? sizes : undefined}
    src={optimized ? photoSource(original, photo.widths[Math.min(1, photo.widths.length - 1)], photo, src) : src}
    onLoad={async (event) => {
      onLoad?.(event)
      if (!onReady) return
      const node = event.currentTarget
      const serial = ++revision.current
      const url = node.currentSrc
      try {
        await node.decode()
        if (active.current && serial === revision.current && node.currentSrc === url && node.naturalWidth > 0) onReady?.()
      } catch {
        if (active.current && serial === revision.current) onError?.()
      }
    }}
    onError={(event) => {
      revision.current++
      if (optimized && !/\.jpe?g(?:[?#]|$)/i.test(event.currentTarget.currentSrc)) setOriginalOnly(true)
      else onError?.()
    }} />
}

/** No wrapper box or CSS changes. A URL-keyed instance prevents a failed page
 * from sending the next page straight to its large original. Only mounted
 * photos make requests, and a failed original is not retried in a loop. */
export default function ResponsivePhoto(props: Props) {
  return <PhotoSource key={props.src} {...props} />
}
