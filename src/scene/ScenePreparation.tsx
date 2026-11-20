import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { type Material, type Object3D, type Texture } from 'three'
import { useStore } from '../store'
import { preloadReliableTextures, retryReliableTextures } from './reliableTexture'
import { preloadDecalAtlas, retryDecalAtlas } from './decalAtlas'
import { HERO_TEXTURE_URLS, useScenePreparation } from './scenePreparation'

/** Runs only behind the inert, transparent scene container. Cache-owned source
 * textures are fetched, but only the final material maps are uploaded. */
export default function ScenePreparation() {
  const { gl, scene, camera, invalidate } = useThree()
  const generation = useScenePreparation((s) => s.generation)
  const run = useRef<{
    active: boolean; acquired: boolean; warming: boolean; revision: number
    failed: Set<string>; initialized: WeakSet<Texture>
  } | null>(null)
  useEffect(() => {
    const retry = () => {
      retryReliableTextures(); retryDecalAtlas()
      // Manual retry already replaces Canvas via its generation key. Do not
      // also wake the old boundaries that are about to be unmounted.
    }
    window.addEventListener('scene-preparation-retry', retry)
    return () => window.removeEventListener('scene-preparation-retry', retry)
  }, [])
  useEffect(() => {
    if (useStore.getState().phase !== 'loading') return
    const session = {
      active: true, acquired: false, warming: false, revision: 0,
      failed: new Set<string>(), initialized: new WeakSet<Texture>(),
    }
    run.current = session
    let timer: number | undefined
    let recoveryQueued = false
    const current = () => session.active && useScenePreparation.getState().generation === generation
    const prepare = (recovering: boolean) => {
      if (!current()) return
      const revision = ++session.revision
      session.acquired = false; session.warming = false
      window.clearTimeout(timer)
      if (recovering) {
        // Keep the old failures visible until recovered material maps have
        // actually mounted, initialized and rendered. HTTP success is not enough.
        useScenePreparation.setState({ resourcesAcquired: false, texturesPrepared: false, sceneRenderable: false })
      }
      timer = window.setTimeout(() => {
        if (!current() || session.revision !== revision || useScenePreparation.getState().sceneRenderable) return
        session.active = false
        useScenePreparation.setState({ fatal: true, failures: ['场景准备超时，请重试'] })
      }, 30_000)
      void Promise.all([
        preloadReliableTextures(HERO_TEXTURE_URLS),
        preloadDecalAtlas(gl.capabilities.getMaxAnisotropy()),
      ]).then(([failed, atlasReady]) => {
        if (!current() || session.revision !== revision) return
        session.failed = new Set(failed)
        if (!atlasReady) session.failed.add('/assets/obj2/doorDecals.webp')
        session.acquired = true
        const failures = recovering
          ? [...new Set([...useScenePreparation.getState().failures, ...session.failed])]
          : [...session.failed]
        useScenePreparation.setState({ resourcesAcquired: true, failures })
        invalidate()
      })
    }
    const online = () => {
      if (!current() || recoveryQueued || useScenePreparation.getState().fatal
        || (!session.failed.size && !useScenePreparation.getState().failures.length)) return
      recoveryQueued = true
      // Run after every local boundary has received the same native event.
      queueMicrotask(() => {
        recoveryQueued = false
        if (!current()) return
        retryReliableTextures(); retryDecalAtlas()
        prepare(true)
      })
    }
    window.addEventListener('online', online)
    prepare(false)
    return () => {
      session.active = false
      window.clearTimeout(timer)
      window.removeEventListener('online', online)
    }
  }, [camera, generation, gl, invalidate, scene])

  useFrame(() => {
    const session = run.current
    if (!session?.active || !session.acquired || session.warming
      || useScenePreparation.getState().generation !== generation) return
    const maps = new Set<Texture>(), urls = new Set<string>()
    scene.traverse((object) => {
      const material = (object as Object3D & { material?: Material | Material[] }).material
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        for (const value of Object.values(m)) {
          if (!(value as Texture | null)?.isTexture) continue
          const texture = value as Texture
          maps.add(texture)
          const image = texture.image as HTMLImageElement | undefined
          if (image?.src) urls.add(new URL(image.src, location.href).pathname)
        }
      }
    })
    const required = [...HERO_TEXTURE_URLS, '/assets/obj2/doorDecals.webp']
    if (required.some((url) => !session.failed.has(url) && !urls.has(url))) return
    if (['LizAlbumBooks', 'KeyboardModel', 'BirthdayCake', 'CcdCamera', 'TurntableModel'].some((name) => !scene.getObjectByName(name))) return
    session.warming = true
    const revision = session.revision
    const valid = () => session.active && session.revision === revision
      && useScenePreparation.getState().generation === generation
    void (async () => {
      // Spread final-map initialization across frames; never upload raw crop inputs.
      for (const texture of maps) {
        if (!valid()) return
        if (session.initialized.has(texture)) continue
        gl.initTexture(texture)
        session.initialized.add(texture)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      if (!valid()) return
      useScenePreparation.setState({ texturesPrepared: true })
      await gl.compileAsync(scene, camera)
      if (!valid()) return
      const visibility = new Map<Object3D, boolean>()
      try {
        // Warm shadow/custom shader paths while the whole DOM container is hidden.
        if (useStore.getState().phase === 'loading') {
          scene.traverse((object) => {
            if (!object.name.endsWith('_Intro')) return
            visibility.set(object, object.visible)
            object.visible = true
          })
        }
        gl.render(scene, camera)
      } finally {
        visibility.forEach((visible, object) => { object.visible = visible })
      }
      // The framebuffer that can be revealed must contain the frozen initial pose.
      gl.render(scene, camera)
      if (!valid()) return
      useScenePreparation.setState({ sceneRenderable: true, failures: [...session.failed] })
      invalidate()
    })().catch(() => {
      if (valid()) useScenePreparation.setState({ fatal: true, failures: ['场景准备失败，请重试'] })
    })
  })
  return null
}
