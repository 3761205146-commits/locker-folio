import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, SRGBColorSpace } from 'three'

/** The alpha silhouette and UVs come from the unchanged original artwork. */
export function CatPlushHeadModel() {
  const face = useTexture(`${import.meta.env.BASE_URL}images/cheez-plush-face.png`)
  const { front, back, nap } = useMemo(() => {
    const canvas = document.createElement('canvas')
    const image = face.image as HTMLImageElement
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const cx = canvas.width / 2, cy = canvas.height * 0.425
    const segments = 192
    const edge = Array.from({ length: segments }, (_, i) => {
      const a = i / segments * Math.PI * 2
      let distance = 0
      for (let r = 0; r < canvas.width * 0.49; r += 0.5) {
        const x = Math.round(cx + Math.cos(a) * r)
        const y = Math.round(cy - Math.sin(a) * r)
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) break
        if (data[(y * canvas.width + x) * 4 + 3] > 80) distance = r
      }
      return [Math.cos(a) * distance, Math.sin(a) * distance]
    })
    function surface(rings: number[][], reverse = false) {
      const points: number[] = [], uvs: number[] = [], indices: number[] = []
      for (const [radius, z] of rings) {
        for (const [ex, ey] of edge) {
          const x = cx + ex * radius, y = cy - ey * radius
          points.push((x / canvas.width - 0.5) * 0.8, (0.5 - y / canvas.height) * 0.8 + 0.3, z)
          uvs.push(x / canvas.width, 1 - y / canvas.height)
        }
      }
      for (let j = 0; j < rings.length - 1; j++) {
        for (let i = 0; i < segments; i++) {
          const a = j * segments + i, b = j * segments + (i + 1) % segments
          const c = a + segments, d = b + segments
          indices.push(...(reverse ? [a, d, c, a, b, d] : [a, c, d, a, d, b]))
        }
      }
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
      geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      return geometry
    }
    // Suppress isolated alpha fringe pixels while retaining the ears and silhouette.
    const radii = edge.map(([x, y]) => Math.hypot(x, y))
    edge.forEach((point, i) => {
      const radius = (radii[(i + segments - 1) % segments] + radii[i] * 2 + radii[(i + 1) % segments]) / 4
      const a = i / segments * Math.PI * 2
      point[0] = Math.cos(a) * radius
      point[1] = Math.sin(a) * radius
    })
    const front = surface([[0, 0.13], [0.35, 0.125], [0.7, 0.105], [0.9, 0.065], [1, 0]])
    const back = surface([[0, -0.14], [0.5, -0.125], [0.85, -0.085], [0.98, -0.03], [1, 0]], true)
    const colors: number[] = []
    const positions = back.getAttribute('position')
    const cream = new Color('#fffdf7'), yellow = new Color('#ffdb86')
    for (let i = 0; i < positions.count; i++) {
      const blend = Math.max(0, Math.min(1, (positions.getY(i) - 0.34) / 0.05))
      const color = cream.clone().lerp(yellow, blend)
      colors.push(color.r, color.g, color.b)
    }
    back.setAttribute('color', new Float32BufferAttribute(colors, 3))
    // Deterministic fine fibres: no new asset or alteration of the reference image.
    const fibres = document.createElement('canvas')
    fibres.width = fibres.height = 128
    const fctx = fibres.getContext('2d')!
    const pixels = fctx.createImageData(128, 128)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = 125 + Math.sin(i * 12.9898) * 45
      pixels.data.set([value, value, value, 255], i)
    }
    fctx.putImageData(pixels, 0, 0)
    return { front, back, nap: new CanvasTexture(fibres) }
  }, [face])
  useEffect(() => {
    face.colorSpace = SRGBColorSpace
    face.needsUpdate = true
    return () => { front.dispose(); back.dispose(); nap.dispose() }
  }, [face, front, back, nap])
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
        <meshStandardMaterial vertexColors roughness={0.96} bumpMap={nap} bumpScale={0.0025} />
      </mesh>
      <mesh name="CatPlush_OriginalFront" geometry={front} castShadow>
        <meshBasicMaterial map={face} toneMapped={false} />
      </mesh>
      </group>
    </group>
  )
}
