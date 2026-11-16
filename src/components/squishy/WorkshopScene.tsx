import { Environment, Lightformer, Sparkles, useTexture } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useLayoutEffect, useRef, type RefObject } from 'react'
import { AdditiveBlending, BufferGeometry, Group, MathUtils, Mesh, MeshPhysicalMaterial, Vector2, type Material, type MeshStandardMaterial } from 'three'
import { CatPlushHeadModel } from '../../scene/CatPlushCharm'
import { beginPress, endPress } from './workshopActions'
import type { WorkshopAudio } from './workshopAudio'
import type { WorkshopMotion, WorkshopStage } from './workshopState'

type Props = {
  stage: WorkshopStage
  motion: RefObject<WorkshopMotion>
  audio: WorkshopAudio
  onProgress: (value: number) => void
  onStage: (stage: WorkshopStage) => void
}
const CENTER_Y = 0.36
const VERTEX_UNIFORMS = `
uniform vec2 uWorkshopPoint;
uniform float uWorkshopDepth;
uniform float uWorkshopCoat;
uniform float uWorkshopFill;
uniform float uWorkshopShell;
varying vec3 vWorkshopPosition;
vec3 workshopSquash(vec3 p) {
  vec2 delta = p.xy - uWorkshopPoint;
  float influence = exp(-dot(delta, delta) / 0.018);
  float front = smoothstep(-0.14, 0.07, p.z);
  p.z -= uWorkshopDepth * influence * front;
  p.x *= 1.0 + uWorkshopDepth * 0.20;
  p.y = 0.36 + (p.y - 0.36) * (1.0 - uWorkshopDepth * 0.52);
  return p;
}
`

/** Index-only LOD for the workshop copy: retain the exact original vertex
 * positions, UVs and smooth normals; draw every second ring/angle. Four wax/body
 * passes then cost ~48k triangles instead of ~195k. Cabinet geometry is untouched. */
function interactionGeometry(source: BufferGeometry, reverse: boolean) {
  if (source.getAttribute('position').count !== 24577) return source
  const geometry = new BufferGeometry()
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute)
  const indices: number[] = [], columns = 256, rows = 24
  const index = (ring: number, angle: number) => 1 + (ring * 2 - 1) * 512 + (angle % columns) * 2
  const triangle = (a: number, b: number, c: number) => indices.push(...(reverse ? [a, c, b] : [a, b, c]))
  for (let i = 0; i < columns; i++) triangle(0, index(1, i), index(1, i + 1))
  for (let ring = 1; ring < rows; ring++) for (let i = 0; i < columns; i++) {
    const a = index(ring, i), b = index(ring, i + 1), c = index(ring + 1, i), d = index(ring + 1, i + 1)
    triangle(a, c, d); triangle(a, d, b)
  }
  geometry.setIndex(indices)
  return geometry
}

/** Every mesh and material here belongs to this independent Canvas instance.
 * The cabinet's head, textures and geometry are never mutated. Deformation is
 * GPU-only, bounded, reversible, and identical on the body and its wax shell. */
function InteractiveCat({ stage, motion: motionRef, audio, onProgress, onStage }: Props) {
  useTexture(`${import.meta.env.BASE_URL}images/cheez-plush-face.png`)
  const pose = useRef<Group>(null)
  const drips = useRef<Group>(null)
  const strings = useRef<Group>(null)
  const meshes = useRef<{ front: Mesh; shells: Mesh[]; materials: MeshPhysicalMaterial[] } | null>(null)
  const gesture = useRef<{ id: number; x: number; y: number; yaw: number; tilt: number; dragY: number } | null>(null)
  const { size, viewport } = useThree()
  const sceneScale = Math.min(1, viewport.width / 2.2)
  const uniformsRef = useRef({
    point: { value: new Vector2(0, CENTER_Y) }, depth: { value: 0 }, coat: { value: 0 }, fill: { value: 0.1 },
  })
  const reportAt = useRef(0)
  const phase = useRef(stage)
  useLayoutEffect(() => { phase.current = stage }, [stage])

  useLayoutEffect(() => {
    const uniforms = uniformsRef.current
    const root = pose.current!
    // The head is the existing component, with its mounting hardware hidden only
    // in this workshop copy. All cabinet hardware remains visible and untouched.
    root.traverse((object) => {
      if (/^CatPlush_(CabinetMount|Chain_|KeyRing|FabricLoop)/.test(object.name)) object.visible = false
    })
    const front = root.getObjectByName('CatPlush_OriginalFront') as Mesh
    const back = root.getObjectByName('CatPlush_RoundedBack') as Mesh
    const materials: MeshPhysicalMaterial[] = [], shells: Mesh[] = []
    const restore: (() => void)[] = []
    const patch = (material: Material, shell: boolean) => {
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer)
        Object.assign(shader.uniforms, { uWorkshopPoint: uniforms.point, uWorkshopDepth: uniforms.depth, uWorkshopCoat: uniforms.coat, uWorkshopFill: uniforms.fill, uWorkshopShell: { value: shell ? 1 : 0 } })
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${VERTEX_UNIFORMS}`)
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorkshopPosition = position;\ntransformed += normal * uWorkshopShell * uWorkshopCoat * 0.003;\ntransformed = workshopSquash(transformed);')
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
            vec2 workshopDelta = position.xy - uWorkshopPoint;
            float workshopFalloff = exp(-dot(workshopDelta, workshopDelta) / 0.018);
            objectNormal.xy -= 2.0 * uWorkshopDepth * workshopFalloff * smoothstep(-0.14, 0.07, position.z) * workshopDelta / 0.018;
            objectNormal = normalize(objectNormal);`)
        if (shell) shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uWorkshopFill;\nuniform vec2 uWorkshopPoint;\nuniform float uWorkshopDepth;\nvarying vec3 vWorkshopPosition;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            diffuseColor.rgb = vec3(0.0);
            float coverage = smoothstep(vWorkshopPosition.y - 0.025, vWorkshopPosition.y + 0.025, uWorkshopFill);
            diffuseColor.a *= coverage;
            vec2 crackDelta = vWorkshopPosition.xy - uWorkshopPoint;
            float crackRadius = length(crackDelta);
            float crackAngle = atan(crackDelta.y, crackDelta.x);
            float crack = pow(max(0.0, cos(crackAngle * 7.0 + sin(crackRadius * 90.0) * 0.35)), 55.0);
            crack *= smoothstep(0.015, 0.035, crackRadius) * (1.0 - smoothstep(0.09, 0.16, crackRadius));
            diffuseColor.a = min(0.6, diffuseColor.a + crack * coverage * uWorkshopDepth * 4.0);`)
      }
      const baseKey = key.call(material)
      material.customProgramCacheKey = () => `${baseKey}-workshop-squash-${shell ? 'shell' : 'body'}-v1`
      material.needsUpdate = true
      restore.push(() => { material.onBeforeCompile = compile; material.customProgramCacheKey = key })
    }
    for (const body of [front, back]) {
      const dense = body.geometry, lightweight = interactionGeometry(dense, body === back)
      body.geometry = lightweight
      if (lightweight !== dense) restore.push(() => { body.geometry = dense; lightweight.dispose() })
      patch(body.material as Material, false)
      const material = new MeshPhysicalMaterial({ color: '#fffdf4', transparent: true, opacity: 0.48, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.22, envMapIntensity: 1.4, blending: AdditiveBlending, depthWrite: false })
      patch(material, true)
      const shell = new Mesh(body.geometry, material)
      shell.name = body === front ? 'Workshop_WaxFront' : 'Workshop_WaxBack'
      shell.position.copy(body.position); shell.renderOrder = 3; shell.visible = false
      body.parent!.add(shell); shells.push(shell); materials.push(material)
    }
    meshes.current = { front, shells, materials }
    return () => {
      meshes.current = null
      restore.forEach((fn) => fn()); shells.forEach((shell) => shell.removeFromParent()); materials.forEach((material) => material.dispose())
    }
  }, [uniformsRef])

  useFrame((state, delta) => {
    const motion = motionRef.current, uniforms = uniformsRef.current
    const dt = Math.min(delta, 0.08), elapsed = Math.min(delta, 0.25), root = pose.current
    if (!root) return
    let targetY = stage === 'wax' ? motion.dragY : 0.18
    if (stage === 'wax' && motion.autoDip && motion.coating < 1) { motion.dragY = -0.23; targetY = -0.23 }
    if (stage === 'wax' && motion.coating >= 1) {
      motion.autoDip = false; motion.dragging = false; motion.liftTime += elapsed
      targetY = 0.38
      if (motion.liftTime > 1.25) onStage('cool')
    }
    root.position.y = MathUtils.damp(root.position.y, targetY, 7, dt)
    root.rotation.y = MathUtils.damp(root.rotation.y, motion.yaw, 8, dt)
    root.rotation.x = MathUtils.damp(root.rotation.x, motion.tilt, 8, dt)
    root.scale.setScalar(MathUtils.damp(root.scale.x, 3.1 * (motion.hovered && stage !== 'wax' ? 1.012 : 1), 9, dt))
    if (stage === 'wax' && motion.coating < 1) {
      // The lowest part reaches the liquid before the head can reach the bowl
      // base. Soaking is continuous while submerged; no repeated clicks needed.
      const immersion = Math.max(0, Math.min(1, (-0.06 - root.position.y) / 0.14))
      if (immersion > 0) motion.coating = Math.min(1, motion.coating + elapsed * 0.5 * immersion)
    }
    if (stage === 'cool') {
      motion.cooling = Math.min(1, motion.cooling + elapsed / 4.2)
      if (motion.cooling >= 1) onStage('squeeze')
    }
    if (state.clock.elapsedTime - reportAt.current > 0.08) {
      reportAt.current = state.clock.elapsedTime
      if (stage === 'wax') onProgress(motion.coating)
      if (stage === 'cool') onProgress(motion.cooling)
    }
    const held = motion.pressed && stage === 'squeeze'
    const age = (performance.now() - motion.pressStart) / 1000
    const strength = held ? Math.min(1, motion.pressure * 0.65 + Math.min(0.6, age * 0.8)) : 0
    const targetDepth = held ? 0.025 + strength * 0.06 : 0
    motion.depth = MathUtils.damp(motion.depth, targetDepth, held ? 18 : 5.2, elapsed)
    if (motion.depth < 0.00005) motion.depth = 0
    uniforms.point.value.lerp(motion.pressPoint, 1 - Math.exp(-dt * 25))
    uniforms.depth.value = motion.depth
    uniforms.coat.value = motion.coating
    uniforms.fill.value = 0.13 + motion.coating * 0.5
    meshes.current?.shells.forEach((shell) => { shell.visible = motion.coating > 0.005 })
    meshes.current?.materials.forEach((material) => {
      material.roughness = 0.43 - motion.cooling * 0.31
      material.clearcoatRoughness = 0.23 - motion.cooling * 0.18
      material.opacity = 0.48 - motion.cooling * 0.06
    })
    if (drips.current) {
      const lifted = stage === 'wax' && motion.coating > 0.1 && root.position.y > -0.16
      drips.current.visible = lifted
      drips.current.children.forEach((drop, i) => {
        const t = (state.clock.elapsedTime * 0.75 + i * 0.23) % 1
        drop.position.set((i - 1) * 0.25, root.position.y - 0.62 - t * 0.5, 0.15)
        drop.scale.setScalar(Math.max(0.1, (1 - t) * 0.7))
      })
    }
    if (strings.current) {
      const top = root.position.y - 0.6, gap = top + 0.72
      strings.current.visible = stage === 'wax' && motion.coating > 0.2 && gap > 0.02 && gap < 0.45
      strings.current.position.y = -0.72 + gap / 2
      strings.current.scale.y = Math.max(0.001, gap)
    }
  })

  const down = (event: ThreeEvent<PointerEvent>) => {
    const motion = motionRef.current
    event.stopPropagation()
    if (gesture.current) return
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: motion.yaw, tilt: motion.tilt, dragY: motion.dragY }
    const capture = event.target as unknown as { setPointerCapture: (id: number) => void }
    capture.setPointerCapture(event.pointerId)
    if (phase.current === 'wax' && motion.coating < 1) { motion.autoDip = false; motion.dragging = true }
    if (phase.current === 'squeeze' && meshes.current) {
      const local = meshes.current.front.worldToLocal(event.point.clone())
      beginPress(motion, audio, local.x, local.y, event.pressure)
    }
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    const motion = motionRef.current
    const gestureNow = gesture.current
    if (!gestureNow || gestureNow.id !== event.pointerId) return
    event.stopPropagation()
    if (phase.current === 'prepare') {
      motion.yaw = MathUtils.clamp(gestureNow.yaw + (event.clientX - gestureNow.x) * 0.007, -0.5, 0.5)
      motion.tilt = MathUtils.clamp(gestureNow.tilt + (event.clientY - gestureNow.y) * 0.003, -0.14, 0.14)
    } else if (phase.current === 'wax' && motion.coating < 1) {
      motion.dragY = MathUtils.clamp(gestureNow.dragY - (event.clientY - gestureNow.y) / size.height * viewport.height / sceneScale, -0.23, 0.4)
    } else if (phase.current === 'squeeze' && meshes.current) {
      const local = meshes.current.front.worldToLocal(event.point.clone())
      const distance = motion.pressPoint.distanceTo(new Vector2(local.x, local.y))
      motion.pressPoint.set(local.x, local.y)
      if (distance > 0.025 && performance.now() - motion.lastCrack > 90) { audio.play('light', 0.4); motion.lastCrack = performance.now() }
    }
  }
  const up = (event: ThreeEvent<PointerEvent>) => {
    const motion = motionRef.current
    if (gesture.current?.id !== event.pointerId) return
    event.stopPropagation(); gesture.current = null; motion.dragging = false
    if (phase.current === 'wax' && motion.coating < 1) motion.dragY = 0.3
    endPress(motion, audio)
    const target = event.target as unknown as { releasePointerCapture?: (id: number) => void }
    target.releasePointerCapture?.(event.pointerId)
  }
  return <>
    <group ref={pose} name="Workshop_Cat" position={[0, 0.18, 0]} scale={3.1}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onLostPointerCapture={up} onPointerOver={(e) => { e.stopPropagation(); motionRef.current.hovered = true }} onPointerOut={() => { motionRef.current.hovered = false }}>
      <group position={[0, 0.345, 0]}><CatPlushHeadModel /></group>
    </group>
    <group ref={drips} visible={false}>{[0, 1, 2].map((i) => <mesh key={i} scale={[0.7, 1.6, 0.7]}><sphereGeometry args={[0.035, 12, 10]} /><meshPhysicalMaterial color="#ffe9ae" transparent opacity={0.72} roughness={0.2} /></mesh>)}</group>
    <group ref={strings} visible={false}>{[-0.25, 0.25].map((x) => <mesh key={x} position={[x, 0, 0.12]}><cylinderGeometry args={[0.007, 0.014, 1, 10]} /><meshPhysicalMaterial color="#ffe9ae" transparent opacity={0.52} roughness={0.2} /></mesh>)}</group>
  </>
}

function WaxBowl() {
  const material = useRef<MeshStandardMaterial>(null)
  useFrame((state) => { if (material.current) material.current.opacity = 0.35 + Math.sin(state.clock.elapsedTime * 2) * 0.015 })
  return <group name="Workshop_WaxBowl">
    <mesh position={[0, -0.875, 0]}><cylinderGeometry args={[0.98, 0.87, 0.33, 72, 1, true]} /><meshPhysicalMaterial color="#bddde8" transparent opacity={0.38} roughness={0.16} side={2} depthWrite={false} /></mesh>
    <mesh position={[0, -1.045, 0]}><cylinderGeometry args={[0.87, 0.87, 0.025, 72]} /><meshStandardMaterial color="#d6ebf1" roughness={0.4} /></mesh>
    <mesh position={[0, -0.71, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.98, 0.018, 12, 80]} /><meshStandardMaterial color="#d2e9ef" roughness={0.27} /></mesh>
    <mesh name="Workshop_LiquidWax" position={[0, -0.725, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.955, 80]} /><meshStandardMaterial ref={material} color="#ffe5a5" transparent opacity={0.35} roughness={0.22} metalness={0.05} side={2} depthWrite={false} /></mesh>
    <mesh position={[0, -0.82, 0.94]}><sphereGeometry args={[0.065, 16, 12]} /><meshStandardMaterial color="#fff8e8" roughness={0.4} /></mesh>
  </group>
}

function WorkshopScene(props: Props) {
  const { viewport, camera } = useThree()
  const scale = Math.min(1, viewport.width / 2.2)
  useLayoutEffect(() => { camera.lookAt(0, -0.1, 0) }, [camera])
  return <>
    <StudioLighting />
    <group scale={scale}>
      <InteractiveCat {...props} />
      {props.stage === 'wax' && <WaxBowl />}
      {props.stage === 'cool' && <Sparkles count={14} position={[0, 0.25, 0.25]} scale={[2.2, 1.5, 0.8]} size={2.5} speed={0.35} opacity={0.7} color="#a9d8ee" />}
      <mesh position={[0, -1.1, 0]}><cylinderGeometry args={[1.3, 1.32, 0.045, 80]} /><meshStandardMaterial color="#f8f7ed" roughness={0.8} /></mesh>
    </group>
  </>
}

const StudioLighting = memo(function StudioLighting() {
  return <>
    <ambientLight intensity={1.6} /><directionalLight position={[-3, 4, 5]} intensity={2.3} /><directionalLight position={[3, 1, -2]} intensity={1} />
    <Environment resolution={64} frames={1}>
      <Lightformer position={[-2, 2, 3]} scale={[0.45, 3, 1]} intensity={3} />
      <Lightformer position={[2, 1, 2]} scale={[1.5, 0.35, 1]} intensity={2} />
    </Environment>
  </>
})
export default memo(WorkshopScene)
