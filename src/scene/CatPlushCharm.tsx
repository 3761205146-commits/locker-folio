import { useReliableTexture } from './reliableTexture'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type MeshBasicMaterial } from 'three'
import { createCatPlushSurface } from './catPlushSurface'

/** The alpha silhouette and UVs come from the unchanged original artwork. */
export function CatPlushHeadModel() {
  const source = useReliableTexture(`${import.meta.env.BASE_URL}images/cheez-plush-face.png`)
  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  const { front, back, face, nap } = useMemo(
    () => createCatPlushSurface(source.image as HTMLImageElement, anisotropy),
    [source, anisotropy],
  )
  // Keep the original HTML-image texture for all facial pixels. Canvas readback
  // loses hidden RGB in the original PNG's internal alpha gaps, so it must never
  // replace the artwork. Only the cutout rim uses the padded map.
  const artwork = useMemo(() => {
    const texture = source.clone()
    texture.colorSpace = SRGBColorSpace
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.anisotropy = Math.min(8, anisotropy)
    // clone() already marks this private texture/source for its first upload.
    // Final sampling parameters are set here, before any material can use it.
    return texture
  }, [source, anisotropy])
  const softenRim = useMemo(() => (shader: Parameters<MeshBasicMaterial['onBeforeCompile']>[0]) => {
    shader.uniforms.plushRimMap = { value: face }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float plushEdgeBlend;\nvarying float vPlushEdgeBlend;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlushEdgeBlend = plushEdgeBlend;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D plushRimMap;\nvarying float vPlushEdgeBlend;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, texture2D(plushRimMap, vMapUv).rgb, vPlushEdgeBlend);')
  }, [face])
  useEffect(() => () => { front.dispose(); back.dispose(); face.dispose(); artwork.dispose(); nap.dispose() }, [front, back, face, artwork, nap])
  return (
    <group name="CatPlushHeadModel">
      {/* Anchor is the origin: hover grows downwards without moving the fixing. */}
      <mesh name="CatPlush_CabinetMount" position={[0, 0.004, -0.005]} castShadow>
        <boxGeometry args={[0.065, 0.012, 0.07]} />
        <meshStandardMaterial color="#bac4cc" metalness={0.85} roughness={0.25} />
      </mesh>
      {[0, 1, 2].map((link) => (
        <mesh key={link} name={`CatPlush_Chain_${link}`} position={[0, -0.019 - link * 0.025, 0]}
          rotation={[0, link % 2 ? Math.PI / 2 : 0, 0]} scale={[0.7, 1, 1]} castShadow>
          <torusGeometry args={[0.018, 0.004, 10, 28]} />
          <meshStandardMaterial color="#cbd2d9" metalness={0.92} roughness={0.2} />
        </mesh>
      ))}
      <mesh name="CatPlush_KeyRing" position={[0, -0.108, 0]} castShadow>
        <torusGeometry args={[0.031, 0.005, 12, 48]} />
        <meshStandardMaterial color="#d2d8df" metalness={0.92} roughness={0.18} />
      </mesh>
      <mesh name="CatPlush_FabricLoop" position={[0, -0.144, 0]} scale={[0.55, 1, 0.65]} castShadow>
        <torusGeometry args={[0.02, 0.007, 10, 28]} />
        <meshStandardMaterial color="#f4d58c" roughness={0.95} />
      </mesh>
      <group position={[0, -0.705, 0]}>
      <mesh name="CatPlush_RoundedBack" geometry={back} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.96} bumpMap={nap} bumpScale={0.0009} />
      </mesh>
      <mesh name="CatPlush_OriginalFront" geometry={front} castShadow>
        <meshBasicMaterial map={artwork} toneMapped={false} onBeforeCompile={softenRim} customProgramCacheKey={() => 'cat-plush-rim-v1'} />
      </mesh>
      </group>
    </group>
  )
}
