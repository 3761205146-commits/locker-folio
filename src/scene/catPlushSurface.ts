import { BufferGeometry, CanvasTexture, ClampToEdgeWrapping, Color, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'

const SEGMENTS = 512
const RINGS = 48
const FRONT_PROFILE = [[0, 0.13], [0.35, 0.125], [0.7, 0.105], [0.9, 0.065], [1, 0]]
const BACK_PROFILE = [[0, -0.14], [0.5, -0.125], [0.85, -0.085], [0.98, -0.03], [1, 0]]

/** Keep the original depth landmarks, interpolating in angle so the rim is round. */
function depthAt(angle: number, profile: number[][]) {
  const knots = profile.map(([radius, z]) => [Math.asin(radius), z])
  const slopes = knots.slice(1).map(([x, y], i) => (y - knots[i][1]) / (x - knots[i][0]))
  let i = 0
  while (i < knots.length - 2 && angle > knots[i + 1][0]) i++
  const span = knots[i + 1][0] - knots[i][0]
  const t = (angle - knots[i][0]) / span
  // Harmonic tangents keep the profile monotone and avoid overshooting the depth.
  const tangent = (j: number) => j === 0 ? 0 : j === slopes.length ? slopes[j - 1] : 2 / (1 / slopes[j - 1] + 1 / slopes[j])
  return (2 * t ** 3 - 3 * t ** 2 + 1) * knots[i][1]
    + (t ** 3 - 2 * t ** 2 + t) * span * tangent(i)
    + (-2 * t ** 3 + 3 * t ** 2) * knots[i + 1][1]
    + (t ** 3 - t ** 2) * span * tangent(i + 1)
}

/** Clean only cutout-fringe texels, extending nearby fabric
 * colour into transparent padding. Facial pixels and internal colour boundaries
 * are copied exactly; no image blur, resizing, or source asset rewrite occurs. */
function paddedTexture(source: ImageData, anisotropy: number, radii: number[], cx: number, cy: number) {
  const { width, height, data } = source
  const padded = new ImageData(new Uint8ClampedArray(data), width, height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x - cx, dy = cy - y, distance = Math.hypot(dx, dy)
    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)
    const index = angle / (Math.PI * 2) * SEGMENTS, lo = Math.floor(index), t = index - lo
    const edge = radii[lo] * (1 - t) + radii[(lo + 1) % SEGMENTS] * t
    const inset = edge - distance
    if (inset >= 9 || inset < -12) continue
    let from = 0
    for (let margin = 8; margin <= 16; margin++) {
      const sx = Math.max(0, Math.min(width - 1, Math.round(cx + dx / distance * (edge - margin))))
      const sy = Math.max(0, Math.min(height - 1, Math.round(cy - dy / distance * (edge - margin))))
      from = (sy * width + sx) * 4
      if (data[from + 3] === 255) break
    }
    const to = (y * width + x) * 4
    const rgb = [data[to], data[to + 1], data[to + 2]]
    // The old cutout has neutral grey checker residue in its outer rim.
    // Decontaminate those grey texels without recolouring yellow/white artwork.
    const greyFringe = Math.max(...rgb) - Math.min(...rgb) < 18 && Math.min(...rgb) < 240
    const blend = data[to + 3] < 128 ? 1 : greyFringe && inset < 8 ? 1 : Math.max(0, Math.min(1, (3 - inset) / 2.5))
    for (let channel = 0; channel < 3; channel++) padded.data[to + channel] = data[to + channel] * (1 - blend) + data[from + channel] * blend
    padded.data[to + 3] = 255
  }
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  canvas.getContext('2d')!.putImageData(padded, 0, 0)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = Math.min(8, anisotropy)
  return texture
}

export function createCatPlushSurface(image: HTMLImageElement, anisotropy: number) {
  const canvas = document.createElement('canvas')
  canvas.width = image.width; canvas.height = image.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0)
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { width, height, data } = source
  const cx = width / 2, cy = height * 0.425

  // The cutout has internal alpha gaps too. Follow the outermost crossing,
  // rather than mistaking a gap between hair and face for the outer silhouette.
  const alpha = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return 0
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
    const value = (p: number) => data[p * 4 + 3] / 255
    const p = iy * width + ix
    return value(p) * (1 - fx) * (1 - fy) + value(p + 1) * fx * (1 - fy)
      + value(p + width) * (1 - fx) * fy + value(p + width + 1) * fx * fy
  }
  const measured = Array.from({ length: SEGMENTS }, (_, i) => {
    const angle = i / SEGMENTS * Math.PI * 2, dx = Math.cos(angle), dy = -Math.sin(angle)
    let radius = 0, previous = 1
    for (let r = 0.25; r < width * 0.49; r += 0.25) {
      const next = alpha(cx + dx * r, cy + dy * r)
      if (previous >= 0.5 && next < 0.5) radius = r - 0.25 + 0.25 * (previous - 0.5) / (previous - next)
      previous = next
    }
    return radius
  })
  const at = (values: number[], i: number) => values[(i + SEGMENTS) % SEGMENTS]
  // Remove only pixel-scale spikes, then a short periodic smoothing kernel.
  // This does not resample or blur the facial artwork, and retains the ear lobes.
  const median = measured.map((_, i) => [-3, -2, -1, 0, 1, 2, 3].map((offset) => at(measured, i + offset)).sort((a, b) => a - b)[3])
  // A local quadratic fit keeps broad ear/cheek curvature while rejecting
  // short stair-steps. Limit correction to five source pixels; retain the broad original shape.
  const half = 10, count = half * 2 + 1
  let s2 = 0, s4 = 0
  for (let offset = -half; offset <= half; offset++) { s2 += offset ** 2; s4 += offset ** 4 }
  const denominator = count * s4 - s2 * s2
  const fitted = median.map((_, i) => {
    let radius = 0
    for (let offset = -half; offset <= half; offset++) radius += at(median, i + offset) * (s4 - s2 * offset ** 2) / denominator
    return radius
  })
  const radii = fitted.map((radius, i) => Math.max(measured[i] - 5, Math.min(measured[i] + 5, radius)))
  const edge = radii.map((radius, i) => {
    const angle = i / SEGMENTS * Math.PI * 2
    return [Math.cos(angle) * radius, Math.sin(angle) * radius]
  })

  function surface(profile: number[][], reverse = false) {
    // One vertex at the pole: no zero-area triangles or unstable pole normals.
    const points = [0, (0.5 - cy / height) * 0.8 + 0.3, profile[0][1]]
    const uvs = [cx / width, 1 - cy / height], indices: number[] = [], edgeBlend = [0]
    for (let ring = 1; ring <= RINGS; ring++) {
      const angle = ring / RINGS * Math.PI / 2
      const radius = ring === RINGS ? 1 : Math.sin(angle)
      const z = ring === RINGS ? 0 : depthAt(angle, profile)
      for (const [ex, ey] of edge) {
        const x = cx + ex * radius, y = cy - ey * radius
        points.push((x / width - 0.5) * 0.8, (0.5 - y / height) * 0.8 + 0.3, z)
        uvs.push(x / width, 1 - y / height)
        edgeBlend.push(Math.max(0, Math.min(1, 9 - (1 - radius) * Math.hypot(ex, ey))))
      }
    }
    const triangle = (a: number, b: number, c: number) => indices.push(...(reverse ? [a, c, b] : [a, b, c]))
    for (let i = 0; i < SEGMENTS; i++) triangle(0, 1 + i, 1 + (i + 1) % SEGMENTS)
    for (let ring = 0; ring < RINGS - 1; ring++) {
      for (let i = 0; i < SEGMENTS; i++) {
        const a = 1 + ring * SEGMENTS + i, b = 1 + ring * SEGMENTS + (i + 1) % SEGMENTS
        triangle(a, a + SEGMENTS, b + SEGMENTS); triangle(a, b + SEGMENTS, b)
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    if (!reverse) geometry.setAttribute('plushEdgeBlend', new Float32BufferAttribute(edgeBlend, 1))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    const normals = geometry.getAttribute('normal')
    normals.setXYZ(0, 0, 0, reverse ? -1 : 1)
    // Shared outward normals at the equator remove the front/back shading crease.
    for (let i = 0; i < SEGMENTS; i++) {
      const prev = edge[(i + SEGMENTS - 1) % SEGMENTS], next = edge[(i + 1) % SEGMENTS]
      const dx = next[0] - prev[0], dy = next[1] - prev[1], length = Math.hypot(dx, dy)
      normals.setXYZ(1 + (RINGS - 1) * SEGMENTS + i, dy / length, -dx / length, 0)
    }
    normals.needsUpdate = true
    return geometry
  }
  const front = surface(FRONT_PROFILE), back = surface(BACK_PROFILE, true)
  const colors: number[] = [], positions = back.getAttribute('position')
  const cream = new Color('#fffdf7'), yellow = new Color('#ffdb86')
  for (let i = 0; i < positions.count; i++) {
    const blend = Math.max(0, Math.min(1, (positions.getY(i) - 0.34) / 0.05))
    const color = cream.clone().lerp(yellow, blend)
    colors.push(color.r, color.g, color.b)
  }
  back.setAttribute('color', new Float32BufferAttribute(colors, 3))
  const fibres = document.createElement('canvas')
  fibres.width = fibres.height = 256
  const fctx = fibres.getContext('2d')!, pixels = fctx.createImageData(256, 256)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = 128 + Math.sin(i * 12.9898) * 14
    pixels.data.set([value, value, value, 255], i)
  }
  fctx.putImageData(pixels, 0, 0)
  return { front, back, face: paddedTexture(source, anisotropy, radii, cx, cy), nap: new CanvasTexture(fibres) }
}
