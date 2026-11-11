import { RoundedBox } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, MathUtils, SRGBColorSpace, type Group } from 'three'
import { ALBUM_BOOKS } from './booksData'
import { useBooksStore } from './booksStore'

/** 13 本书占满原书架 0.74 的净宽，仍为每本预留 3mm 的独立间隙。 */
const WIDTH = 0.054
const GAP = 0.002
const DEPTH = 0.16
const ROW_WIDTH = ALBUM_BOOKS.length * WIDTH + (ALBUM_BOOKS.length - 1) * GAP
const START_X = -ROW_WIDTH / 2 + WIDTH / 2
const SPINE_COLORS = [
  '#fffaf0', '#fafbf6', '#f4f9fa', '#edf6fa', '#e4f2f8', '#daedf6', '#cfe8f4',
  '#c2e2f0', '#b4daec', '#a6d2e6', '#97c8df', '#87bdd7', '#78b1ce',
] as const
const SPINE_LETTERS = [...'HAPPYBIRTHDAY'] as const
/**
 * 书架有效高度：上层隔板表面 2.175，顶部开口下沿 2.777，净高 0.602。
 * 最矮书 0.43、最高书 0.46，顶部保留至少 0.142 的安全净空；底部从 y=0
 * 起算，准确落在隔板上表面，绝不穿入板材的 0.05 厚度。
 */
const BOOK_HEIGHTS = [0.442, 0.452, 0.46, 0.447, 0.456, 0.438, 0.458, 0.45, 0.43, 0.455, 0.44, 0.46, 0.448] as const

function SpineLetter({ index, height }: { index: number; height: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')!
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#000000'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = '700 166px "Trebuchet MS", "Arial Rounded MT Bold", sans-serif'
    context.lineJoin = 'round'
    context.lineWidth = 2
    context.strokeStyle = context.fillStyle
    context.strokeText(SPINE_LETTERS[index], 128, 133)
    context.fillText(SPINE_LETTERS[index], 128, 133)
    const output = new CanvasTexture(canvas)
    output.colorSpace = SRGBColorSpace
    return output
  }, [index])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={[0, height / 2, DEPTH / 2 + 0.001]} renderOrder={2}>
      <planeGeometry args={[WIDTH * 0.72, height * 0.23]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

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
      <SpineLetter index={index} height={height} />
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
  // Bottoms start at the shelf's upper surface: no negative Y offset.
  return (
    <group name="LizAlbumBooks" position={[0, 0, 0]}>
      {ALBUM_BOOKS.map((book, index) => <AlbumBook key={book.id} index={index} />)}
    </group>
  )
}
