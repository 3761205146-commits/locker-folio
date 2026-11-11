import { RoundedBox, useTexture } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MathUtils, SRGBColorSpace, type Group, type Texture } from 'three'
import { ALBUM_BOOKS } from './booksData'
import { useBooksStore } from './booksStore'

const WIDTH = 0.049
const GAP = 0.003
const START_X = -0.34

function AlbumBook({ index, texture }: { index: number; texture: Texture }) {
  const root = useRef<Group>(null)
  const [hovered, setHovered] = useState(false)
  const openBook = useBooksStore((state) => state.openBook)
  const height = 0.3 + ((index * 7) % 5) * 0.025
  const x = START_X + index * (WIDTH + GAP)
  const image = texture.image as { width?: number; height?: number } | undefined
  const aspect = image?.width && image?.height ? image.width / image.height : 1
  const coverHeight = Math.min(height * 0.74, WIDTH * 0.8 / aspect)
  const coverWidth = coverHeight * aspect

  useFrame((_, delta) => {
    const group = root.current
    if (!group) return
    const target = hovered ? 1.1 : 1
    const next = MathUtils.damp(group.scale.x, target, 13, delta)
    group.scale.setScalar(next)
    group.position.z = MathUtils.damp(group.position.z, hovered ? 0.038 : 0, 13, delta)
    group.position.y = MathUtils.damp(group.position.y, hovered ? 0.012 : 0, 13, delta)
    group.rotation.y = MathUtils.damp(group.rotation.y, hovered ? -0.075 : 0, 13, delta)
  })

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
  }, [texture])

  const enter = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }
  const leave = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    setHovered(false)
    document.body.style.cursor = ''
  }
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    openBook(index + 1)
  }

  return (
    <group ref={root} position={[x, 0, 0]} name={`AlbumBook_${index + 1}`}>
      <RoundedBox
        args={[WIDTH, height, 0.075]}
        position={[0, height / 2, 0]}
        radius={0.006}
        smoothness={3}
        onPointerOver={enter}
        onPointerOut={leave}
        onClick={select}
      >
        <meshStandardMaterial color="#eaf5fb" roughness={0.66} metalness={0} />
      </RoundedBox>
      <mesh
        position={[0, height / 2, 0.039]}
        onPointerOver={enter}
        onPointerOut={leave}
        onClick={select}
      >
        <planeGeometry args={[coverWidth, coverHeight]} />
        <meshStandardMaterial map={texture} roughness={0.72} />
      </mesh>
      <mesh position={[-WIDTH / 2 - 0.0007, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.075, height * 0.9]} />
        <meshStandardMaterial color="#8ec5e5" roughness={0.64} />
      </mesh>
    </group>
  )
}

export default function AlbumBooks() {
  const textures = useTexture(ALBUM_BOOKS.map((book) => book.cover)) as Texture[]
  const items = useMemo(() => ALBUM_BOOKS.map((book, index) => ({ ...book, texture: textures[index] })), [textures])

  return (
    <group name="LizAlbumBooks" position={[0, -0.09, 0.135]}>
      {items.map((book, index) => <AlbumBook key={book.id} index={index} texture={book.texture} />)}
    </group>
  )
}
