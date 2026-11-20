import { TextureLoader, type Texture } from 'three'

export class SceneAssetError extends Error {
  readonly url: string
  readonly retry: () => void
  constructor(url: string, retry: () => void) {
    super(`图片加载失败（已尝试 3 次）：${url}`)
    this.name = 'SceneAssetError'
    this.url = url; this.retry = retry
  }
}

/** A finite shared retry budget, without changing URLs or browser cache keys. */
export async function loadTextureWithRetry(url: string): Promise<Texture> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise<void>((resolve) => window.setTimeout(resolve, attempt === 1 ? 350 : 1000))
    try {
      return await new Promise<Texture>((resolve, reject) => {
        let settled = false
        const timer = window.setTimeout(() => {
          if (settled) return
          settled = true
          texture.dispose()
          reject(new Error('纹理请求超时'))
        }, 8_000)
        const texture = new TextureLoader().load(url, (loaded) => {
          if (settled) { loaded.dispose(); return }
          settled = true
          window.clearTimeout(timer)
          resolve(loaded)
        }, undefined, (error) => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          texture.dispose()
          reject(error)
        })
      })
    } catch {
      if (attempt === 2) throw new Error(`图片请求失败：${url}`)
    }
  }
  throw new Error(`图片请求失败：${url}`)
}

type Resource = { promise: Promise<void>; texture?: Texture; error?: SceneAssetError }
const resources = new Map<string, Resource>()
function resourceFor(url: string): Resource {
  let resource = resources.get(url)
  if (!resource) {
    const next: Resource = { promise: Promise.resolve() }
    next.promise = loadTextureWithRetry(url).then(
      (texture) => { next.texture = texture },
      () => { next.error = new SceneAssetError(url, () => { if (resources.get(url) === next) resources.delete(url) }) },
    )
    resources.set(url, next)
    resource = next
  }
  return resource
}

/** Start every request before waiting on any one Suspense dependency. */
export async function preloadReliableTextures(urls: readonly string[]): Promise<string[]> {
  const pending = urls.map((url) => ({ url, resource: resourceFor(url) }))
  await Promise.all(pending.map(({ resource }) => resource.promise))
  return pending.filter(({ resource }) => resource.error).map(({ url }) => url)
}

export function retryReliableTextures() {
  for (const resource of resources.values()) resource.error?.retry()
}

function readTexture(url: string): Texture {
  const resource = resourceFor(url)
  if (resource.error) throw resource.error
  if (!resource.texture) throw resource.promise
  return resource.texture
}

/** The cache owns source textures for the app lifetime; consumers never dispose
 * them. Configure before returning to render, not in a post-render effect.
 * Unused sources (e.g. a crop's input) are never eagerly uploaded. Callers that
 * need different sampling parameters must create and own a private derivative. */
export function useReliableTexture(url: string, configure?: (texture: Texture) => void): Texture {
  const texture = readTexture(url)
  configure?.(texture)
  return texture
}
