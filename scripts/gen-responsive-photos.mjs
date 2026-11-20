/** Additive photo derivatives only: original JPGs and all PNGs remain untouched.
 * Run: node scripts/gen-responsive-photos.mjs
 * Audit: node scripts/gen-responsive-photos.mjs --check
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url))
const publicDir = path.join(root, 'public')
const manifestPath = path.join(root, 'src/components/images/responsive-photos.json')
const auditPath = path.join(root, 'scripts/assets/responsive-photos.audit.json')
const check = process.argv.includes('--check')
sharp.cache(false)
sharp.concurrency(2)
async function walk(dir) {
  const items = await fs.readdir(dir, { withFileTypes: true })
  return (await Promise.all(items.map((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat()
}
const sources = [...await walk(path.join(publicDir, 'images/book-pages')), ...await walk(path.join(publicDir, 'images/albums')), path.join(publicDir, 'images/liz-ive-profile-detail.jpg')].filter((file) => /\.jpg$/i.test(file)).sort()
const existing = check ? JSON.parse(await fs.readFile(auditPath, 'utf8')) : null
const manifest = {}
let originalBytes = 0, derivativeBytes = 0, count = 0
for (const file of sources) {
  const original = await fs.readFile(file)
  const sourceHash = createHash('sha256').update(original).digest('hex')
  const meta = await sharp(original).metadata()
  const width = meta.width, height = meta.height
  if (!width || !height || (meta.orientation && meta.orientation !== 1)) throw new Error(`Review orientation before converting ${file}`)
  const relative = path.relative(publicDir, file).split(path.sep).join('/')
  const url = '/' + relative
  const profile = relative === 'images/liz-ive-profile-detail.jpg'
  const widths = [...new Set((profile ? [480, 960, 1440, 2000] : [480, 960, 1440]).map((value) => Math.min(width, value)))].sort((a, b) => a - b)
  const variants = []
  originalBytes += original.length
  for (const targetWidth of widths) {
    const targetUrl = '/images/responsive/' + relative.replace(/^images\//, '').replace(/\.jpg$/i, `-${targetWidth}.webp`)
    const output = path.join(publicDir, targetUrl)
    if (!check) {
      await fs.mkdir(path.dirname(output), { recursive: true })
      // Convert ICC-tagged JPEGs to display sRGB; no crop, padding or upscaling.
      await sharp(original).resize({ width: targetWidth, withoutEnlargement: true, fastShrinkOnLoad: false }).toColourspace('srgb')
        .webp({ quality: profile ? 94 : 90, effort: 5, smartSubsample: true }).toFile(output)
    }
    const buffer = await fs.readFile(output)
    const actual = await sharp(buffer).metadata()
    if (actual.format !== 'webp' || actual.width !== targetWidth || Math.abs(actual.height - height * targetWidth / width) > 1) throw new Error(`Invalid derivative ${targetUrl}`)
    const variant = { url: targetUrl, width: actual.width, height: actual.height, bytes: buffer.length }
    variants.push(variant); derivativeBytes += buffer.length; count++
  }
  manifest[url] = { width, height, bytes: original.length, sha256: sourceHash, variants }
  if (check && JSON.stringify(existing[url]) !== JSON.stringify(manifest[url])) throw new Error(`Manifest mismatch: ${url}`)
  if (!check && Object.keys(manifest).length % 20 === 0) console.log(`Saved ${Object.keys(manifest).length}/${sources.length} photos`)
}
if (check) {
  if (Object.keys(existing).length !== sources.length) throw new Error('Manifest contains missing or extra sources')
} else await fs.writeFile(auditPath, JSON.stringify(manifest, null, 2) + '\n')
const clientManifest = Object.fromEntries(Object.entries(manifest).map(([url, photo]) => [url, { width: photo.width, height: photo.height, widths: photo.variants.map((variant) => variant.width), ...((photo.variants.some((variant) => variant.width === photo.width && variant.bytes >= photo.bytes)) ? { originalWidths: [photo.width] } : {}) }]))
if (check) {
  if (JSON.stringify(JSON.parse(await fs.readFile(manifestPath, 'utf8'))) !== JSON.stringify(clientManifest)) throw new Error('Client manifest mismatch')
} else await fs.writeFile(manifestPath, JSON.stringify(clientManifest, null, 2) + '\n')
console.log(JSON.stringify({ mode: check ? 'check' : 'generate', originals: sources.length, variants: count, originalBytes, derivativeBytes }))
