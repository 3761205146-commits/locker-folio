import { RoundedBox } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { MathUtils, type Group } from 'three'
import { ALBUM_BOOKS } from './booksData'
import { useBooksStore } from './booksStore'

/** 13 本书占满原书架 0.74 的净宽，仍为每本预留 3mm 的独立间隙。 */
const WIDTH = 0.052
const GAP = 0.003
const DEPTH = 0.16
const ROW_WIDTH = ALBUM_BOOKS.length * WIDTH + (ALBUM_BOOKS.length - 1) * GAP
const START_X = -ROW_WIDTH / 2 + WIDTH / 2
const SPINE_COLORS = [
  '#94c9e8', '#f4d6ad', '#b9dce9', '#f4c6cf', '#d8e7b3', '#a9d5cf', '#f1d4a9',
  '#b8ccef', '#efd0dc', '#c5e4df', '#f5dfab', '#b4d7ec', '#d4c5ea',
] as const
const BOOK_HEIGHTS = [0.43, 0.455, 0.475, 0.442, 0.465, 0.435, 0.47, 0.45, 0.425, 0.462, 0.44, 0.475, 0.448] as const

function AlbumBook({ index }: { index: number }) {
  const root = useRef<Group>(null)
  const [hovered, setHovered] = useState(false)
  const openBook = useBooksStore((state) => state.openBook)
  const height = BOOK_HEIGHTS[index]
  const x = START_X + index * (WIDTH + GAP)

  useFrame((_, delta) => {
    const group = root.current
    if (!group) return
    const target = hovered ? 1.055 : 1
    const next = MathUtils.damp(group.scale.x, target, 13, delta)
    group.scale.setScalar(next)
    group.position.z = MathUtils.damp(group.position.z, hovered ? 0.026 : 0, 13, delta)
    group.position.y = MathUtils.damp(group.position.y, hovered ? 0.008 : 0, 13, delta)
    group.rotation.y = MathUtils.damp(group.rotation.y, hovered ? -0.035 : 0, 13, delta)
  })

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
        args={[WIDTH, height, DEPTH]}
        position={[0, height / 2, 0]}
        radius={0.006}
        smoothness={3}
        onPointerOver={enter}
        onPointerOut={leave}
        onClick={select}
      >
        <meshStandardMaterial color={SPINE_COLORS[index]} roughness={0.76} metalness={0} />
      </RoundedBox>
      <RoundedBox args={[WIDTH * 0.7, 0.009, DEPTH + 0.003]} position={[0, height * 0.17, 0]} radius={0.002} smoothness={2}>
        <meshStandardMaterial color="#fff8e9" roughness={0.88} />
      </RoundedBox>
      <RoundedBox args={[WIDTH * 0.7, 0.009, DEPTH + 0.003]} position={[0, -height * 0.17, 0]} radius={0.002} smoothness={2}>
        <meshStandardMaterial color="#fff8e9" roughness={0.88} />
      </RoundedBox>
    </group>
  )
}

export default function AlbumBooks() {
  return (
    <group name="LizAlbumBooks" position={[0, -0.09, 0]}>
      {ALBUM_BOOKS.map((book, index) => <AlbumBook key={book.id} index={index} />)}
    </group>
  )
}
