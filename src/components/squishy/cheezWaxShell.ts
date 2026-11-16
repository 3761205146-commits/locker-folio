import { BufferGeometry, Float32BufferAttribute, Group, MathUtils, Mesh, MeshPhysicalMaterial, Vector2, Vector3 } from 'three'
import type { WorkshopAudio } from './workshopAudio'
import type { WorkshopMotion } from './workshopState'

type Vertex = { p: Vector3; n: Vector3 }
type Piece = { mesh: Mesh; center: Vector2; damage: number; fall: number; hitFloor: boolean; area: number; angle: number }
const THICKNESS = 0.0045

// Deterministic, uneven Voronoi cells. Each cell clips the ORIGINAL surface
// triangles, preserving Cheez's curved silhouette instead of approximating it.
function seeds() {
  let state = 4917
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
  const points: Vector2[] = []
  for (let i = 0; i < 2200 && points.length < 72; i++) {
    const point = new Vector2((random() - 0.5) * 0.78, 0.04 + random() * 0.64)
    if (points.every((other) => point.distanceTo(other) > 0.046 + random() * 0.012)) points.push(point)
  }
  return points
}
function clip(vertices: Vertex[], normal: Vector2, limit: number) {
  const result: Vertex[] = []
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length]
    const da = a.p.x * normal.x + a.p.y * normal.y - limit, db = b.p.x * normal.x + b.p.y * normal.y - limit
    if (da <= 1e-9) result.push(a)
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db)
      result.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize() })
    }
  }
  return result
}
function fragment(source: BufferGeometry, seed: Vector2, points: Vector2[]) {
  const positions: number[] = [], normals: number[] = [], groups: { start: number; count: number; material: number }[] = []
  const p = source.getAttribute('position'), n = source.getAttribute('normal'), index = source.index!
  let area = 0
  const append = (a: Vector3, b: Vector3, c: Vector3, na: Vector3, nb: Vector3, nc: Vector3, material: number) => {
    const start = positions.length / 3
    for (const v of [a, b, c]) positions.push(v.x - seed.x, v.y - seed.y, v.z)
    for (const v of [na, nb, nc]) normals.push(v.x, v.y, v.z)
    const last = groups.at(-1)
    if (last && last.material === material) last.count += 3
    else groups.push({ start, count: 3, material })
  }
  const planes = points.filter((v) => v !== seed).map((v) => ({ normal: v.clone().sub(seed), limit: (v.lengthSq() - seed.lengthSq()) / 2 }))
  for (let i = 0; i < index.count; i += 3) {
    let polygon: Vertex[] = [0, 1, 2].map((j) => { const k = index.getX(i + j); return { p: new Vector3().fromBufferAttribute(p, k), n: new Vector3().fromBufferAttribute(n, k) } })
    for (const plane of planes) { polygon = clip(polygon, plane.normal, plane.limit); if (polygon.length < 3) break }
    if (polygon.length < 3) continue
    const top = polygon.map((v) => v.p.clone().addScaledVector(v.n, THICKNESS))
    for (let j = 1; j < polygon.length - 1; j++) {
      append(top[0], top[j], top[j + 1], polygon[0].n, polygon[j].n, polygon[j + 1].n, 0)
      append(polygon[0].p, polygon[j + 1].p, polygon[j].p, polygon[0].n.clone().negate(), polygon[j + 1].n.clone().negate(), polygon[j].n.clone().negate(), 2)
      area += new Vector3().subVectors(top[j], top[0]).cross(new Vector3().subVectors(top[j + 1], top[0])).length() / 2
    }
    // Only cut boundaries get walls. Internal tessellation stays continuous.
    for (let j = 0; j < polygon.length; j++) {
      const next = (j + 1) % polygon.length, a = polygon[j].p, b = polygon[next].p
      if (!planes.some(({ normal, limit }) => Math.abs(a.x * normal.x + a.y * normal.y - limit) < 1e-7 && Math.abs(b.x * normal.x + b.y * normal.y - limit) < 1e-7)) continue
      const normal = new Vector3().subVectors(b, a).cross(polygon[j].n).normalize()
      append(a, b, top[next], normal, normal, normal, 1); append(a, top[next], top[j], normal, normal, normal, 1)
    }
  }
  const geometry = new BufferGeometry()
  const orderedPositions: number[] = [], orderedNormals: number[] = []
  for (const material of [0, 1, 2]) {
    const start = orderedPositions.length / 3
    for (const group of groups) if (group.material === material) {
      for (let i = group.start * 3; i < (group.start + group.count) * 3; i++) { orderedPositions.push(positions[i]); orderedNormals.push(normals[i]) }
    }
    geometry.addGroup(start, orderedPositions.length / 3 - start, material)
  }
  geometry.setAttribute('position', new Float32BufferAttribute(orderedPositions, 3)); geometry.setAttribute('normal', new Float32BufferAttribute(orderedNormals, 3))
  geometry.computeBoundingSphere()
  return { geometry, area }
}

/** Persistent rigid shards, not a squash shader. No vertices move within a shard:
 * cracks open at cell boundaries, plates lever up, then fall under gravity. */
export class CheezWaxShell {
  readonly group = new Group()
  private pieces: Piece[] = []
  private lastSerial = 0
  private lastPulse = 0
  private totalArea = 0
  private top = new MeshPhysicalMaterial({ color: '#fff4cf', transparent: true, opacity: 0.24, roughness: 0.13, clearcoat: 1, clearcoatRoughness: 0.045, metalness: 0, depthWrite: false, envMapIntensity: 1.5 })
  private chipTop = new MeshPhysicalMaterial({ color: '#fff3cd', transparent: true, opacity: 0.72, roughness: 0.23, clearcoat: 0.8, clearcoatRoughness: 0.08 })
  private hiddenEdge = new MeshPhysicalMaterial({ visible: false })
  private edge = new MeshPhysicalMaterial({ color: '#c79f67', transparent: true, opacity: 0.72, roughness: 0.28, clearcoat: 1 })
  constructor(front: Mesh, back: Mesh) {
    this.group.name = 'Cheez_PersistentWaxShards'
    const points = seeds()
    for (const body of [front, back]) for (const seed of points) {
      const { geometry, area } = fragment(body.geometry, seed, points)
      if (area < 0.000001) { geometry.dispose(); continue }
      const mesh = new Mesh(geometry, [this.top, this.hiddenEdge, this.hiddenEdge])
      mesh.raycast = () => {}; mesh.name = `Cheez_WaxShard_${this.pieces.length}`; mesh.position.set(seed.x, seed.y, 0); mesh.renderOrder = 4
      this.group.add(mesh); this.totalArea += area
      this.pieces.push({ mesh, center: seed, area, damage: 0, fall: -1, hitFloor: false, angle: Math.sin(seed.x * 741 + seed.y * 977) })
    }
    front.parent!.add(this.group)
    this.group.visible = false
  }
  reset() {
    this.lastSerial = 0
    for (const piece of this.pieces) { piece.damage = 0; piece.fall = -1; piece.hitFloor = false; piece.mesh.material = [this.top, this.hiddenEdge, this.hiddenEdge]; piece.mesh.visible = true; piece.mesh.rotation.set(0, 0, 0); piece.mesh.scale.setScalar(1); piece.mesh.position.set(piece.center.x, piece.center.y, 0) }
  }
  update(motion: WorkshopMotion, audio: WorkshopAudio, dt: number) {
    const now = performance.now()
    if (motion.pressSerial !== this.lastSerial || (motion.pressed && now - this.lastPulse > 145)) {
      this.lastSerial = motion.pressSerial; this.lastPulse = now
      const active = this.pieces.filter((p) => p.damage < 3)
      // Expands into intact neighbours on repeated presses at the same place.
      const nearest = active.reduce((d, p) => Math.min(d, p.center.distanceTo(motion.pressPoint)), 1)
      const radius = Math.min(0.8, Math.max(0.075 + motion.pressure * 0.035, nearest + 0.035))
      let cracks = 0, detached = 0, lifted = 0
      for (const piece of active) {
        if (piece.center.distanceTo(motion.pressPoint) > radius) continue
        piece.damage++
        piece.mesh.material = [piece.damage === 3 ? this.chipTop : this.top, this.edge, piece.damage >= 2 ? this.chipTop : this.hiddenEdge]
        cracks++; if (piece.damage === 2) lifted++
        if (piece.damage === 3) { piece.fall = 0; detached++ }
      }
      if (cracks) motion.fractured = true
      if (cracks) audio.play(detached > 3 || cracks > 14 ? 'rapid' : detached || lifted ? 'crunch' : 'light', Math.min(1, 0.3 + cracks / 14))
    }
    let removed = 0
    for (const piece of this.pieces) {
      const { mesh, center, damage } = piece
      if (damage === 3) {
        removed += piece.area; piece.fall += dt
        const t = piece.fall
        mesh.position.set(center.x + piece.angle * t * 0.12, center.y + 0.10 * t - 0.9 * t * t, 0.06 * t + Math.abs(piece.angle) * t * 0.12)
        mesh.rotation.set(t * (2 + piece.angle), t * piece.angle * 3, t * piece.angle)
        if (!piece.hitFloor && mesh.position.y < -0.04) { piece.hitFloor = true; audio.play('chips', 0.22 + piece.area * 20) }
        if (piece.hitFloor) { mesh.position.y = -0.04; mesh.scale.setScalar(Math.max(0, 1 - Math.max(0, t - 0.85) * 2)); if (t > 1.4) mesh.visible = false }
      } else {
        const shrink = damage === 0 ? 1 : damage === 1 ? 0.974 : 0.945
        mesh.scale.setScalar(MathUtils.damp(mesh.scale.x, shrink, 24, dt))
        mesh.rotation.x = MathUtils.damp(mesh.rotation.x, damage === 2 ? piece.angle * 0.2 : 0, 22, dt)
        mesh.rotation.y = MathUtils.damp(mesh.rotation.y, damage === 2 ? 0.16 * Math.sign(center.x || 1) : 0, 22, dt)
        mesh.position.z = MathUtils.damp(mesh.position.z, damage === 2 ? 0.009 : damage === 1 ? 0.0015 : 0, 22, dt)
      }
      mesh.userData.damage = damage
    }
    motion.broken = Math.min(1, removed / this.totalArea)
    this.group.userData.broken = motion.broken
    this.group.userData.cracked = this.pieces.filter((p) => p.damage > 0).length
    this.group.userData.detached = this.pieces.filter((p) => p.damage === 3).length
  }
  dispose() { this.group.removeFromParent(); this.pieces.forEach((p) => p.mesh.geometry.dispose()); this.top.dispose(); this.edge.dispose(); this.hiddenEdge.dispose(); this.chipTop.dispose() }
}
