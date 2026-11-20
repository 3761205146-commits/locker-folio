#!/usr/bin/env node
/**
 * Asset gate: declarations/inventory are NEVER described as measured traffic.
 * node scripts/check-assets.mjs [dist] [--network /tmp/cold.json ...] [--json /tmp/report.json]
 * Capture matching production evidence with scripts/assets/capture-network.mjs.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, extname, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { ROOT, walk, inventory, fingerprint, FEATURES } from './assets/resource-inventory.mjs'

// Startup cap unchanged; disk inventory is informational, never a transfer gate.
export const BUDGET = {
  heroTransferKiB: 1600,
  heroDecodedMiB: 48,
  entryGzipKiB: 120,
}
const LEGACY_INVENTORY_REFERENCE_MIB = 8 // historical reference, NOT an enforced budget
const args = process.argv.slice(2), target = args.includes('dist') ? 'dist' : 'public'
const dir = join(ROOT, target), htmlPath = join(ROOT, target === 'dist' ? 'dist/index.html' : 'index.html')
const html = readFileSync(htmlPath, 'utf8'), errors = [], warnings = [], notes = []
const stock = inventory(), byUrl = new Map(stock.resources.map(r => [r.url, r]))
const networkFiles = args.flatMap((v, i) => v === '--network' ? [args[i + 1]] : [])
const jsonPath = args.includes('--json') ? args[args.indexOf('--json') + 1] : null
if (args.includes('--json') && (!jsonPath || jsonPath.startsWith('--'))) throw Error('--json requires a destination')
if (networkFiles.some(f => !f || f.startsWith('--'))) throw Error('--network requires a capture file')
const isLocal = u => u.startsWith('/') && !u.startsWith('//')
function checkPath(url, label) {
  if (!isLocal(url)) return
  let path
  try { path = decodeURIComponent(url.split(/[?#]/)[0]) } catch { errors.push(`${label}: invalid encoding ${url}`); return }
  if (!existsSync(join(dir, path))) errors.push(`${label}: missing or case mismatch ${path}`)
}
const tags = [...html.matchAll(/<link\b[^>]*>/g)].map(m => m[0])
const attr = (tag, key) => tag.match(new RegExp(`\\b${key}=["']([^"']+)["']`))?.[1]
const preloads = tags.filter(tag => attr(tag, 'rel') === 'preload').map(tag => ({ url: attr(tag, 'href'), as: attr(tag, 'as') }))
for (const p of preloads) {
  if (!p.as) errors.push(`preload lacks as: ${p.url}`)
  if (p.url) checkPath(p.url, 'preload')
}
for (const m of stock.missing) errors.push(`Declaration missing: ${m.url} (${m.evidence})`)
for (const row of stock.resources) if (row.categories.length || row.activeReferences.length) checkPath(row.url, 'Declared resource')
for (const a of stock.audits) if (!a.matches) warnings.push(`Audited asset requires re-review: ${a.url}; previous disposition not applied`)
for (const u of stock.unresolved) warnings.push(`Unknown dynamic/import declaration: ${u.file}: ${u.expression}`)
// Keep previous literal /assets checks, extended to Unicode and BASE_URL by inventory.
const srcFiles = walk(join(ROOT, 'src')).filter(f => ['.ts', '.tsx', '.css'].includes(extname(f)))
for (const f of srcFiles) for (const m of readFileSync(f, 'utf8').matchAll(/\/assets\/[A-Za-z0-9_\-/]+\.(?:webp|png|jpg|jpeg|avif|glb|gltf|ktx2|hdr)/g)) checkPath(m[0], relative(ROOT, f))

const sum = rows => rows.reduce((n, r) => n + r.diskBytes, 0)
const assetRows = stock.resources.filter(r => r.url.startsWith('/assets/'))
const critical = stock.resources.filter(r => r.categories.includes('critical-texture'))
const legacy = stock.resources.filter(r => /^\/assets\/(obj|obj2|fix)\//.test(r.url))
const inventoryPriority = ['critical-texture', 'loader-blocking-image', 'startup-nonblocking', ...FEATURES.map(f => f.category), 'atlas-build-input', 'legacy-spec-metadata-only', 'cleanup-candidate', 'offline-build-input', 'pending-review']
const inventoryBuckets = new Map()
for (const row of assetRows) {
  const role = inventoryPriority.find(c => row.categories.includes(c)) ?? 'other-or-unknown'
  if (!inventoryBuckets.has(role)) inventoryBuckets.set(role, [])
  inventoryBuckets.get(role).push(row)
}
const inventoryReport = { enforced: false, legacyReferenceMiB: LEGACY_INVENTORY_REFERENCE_MIB,
  excessOverLegacyReferenceBytes: Math.max(0, sum(assetRows) - LEGACY_INVENTORY_REFERENCE_MIB * 1024 ** 2), publicFiles: stock.resources.length, publicDiskBytes: sum(stock.resources),
  assetsFiles: assetRows.length, assetsDiskBytes: sum(assetRows),
  assetsByRole: [...inventoryBuckets].map(([role, rows]) => ({ role, files: rows.length, diskBytes: sum(rows), urls: rows.map(r => r.url) })),
  originalHeroDirectoryBytes: sum(legacy),
  criticalDeclaredFiles: critical.length, criticalDeclaredDiskBytes: sum(critical),
  caveat: 'All disk bytes include retained alternatives/inputs. None of these totals is network transfer or actual GPU memory.' }
let declaredRgbaMipBytes = null
try {
  const sharp = (await import('sharp')).default
  declaredRgbaMipBytes = 0
  for (const row of critical) {
    const { width, height } = await sharp(join(dir, row.url)).metadata()
    if (!width || !height) throw Error('unknown dimensions')
    declaredRgbaMipBytes += width * height * 4 * 4 / 3
  }
  if (declaredRgbaMipBytes / 1024 ** 2 > BUDGET.heroDecodedMiB) warnings.push(`Declared critical images RGBA+mips estimate ${(declaredRgbaMipBytes / 1024 ** 2).toFixed(2)}MiB > ${BUDGET.heroDecodedMiB}MiB; not measured GPU allocation, cropped/generated textures excluded`)
} catch { declaredRgbaMipBytes = null; warnings.push('Critical bitmap estimate unknown; no compressed-file multiplier substituted') }

// Read-only consistency checks; Node also works when Bun is unavailable.
const consistency = []
for (const script of ['scripts/assets/pack-decals.mjs', 'scripts/assets/sync-manifest.mjs']) {
  const result = spawnSync(process.execPath, [script, '--check'], { cwd: ROOT, encoding: 'utf8' })
  const passed = result.status === 0
  consistency.push({ script, passed, output: (result.stdout || result.stderr || result.error?.message || '').trim() })
  if (!passed) errors.push(`${script} --check failed (see JSON report)`)
}
const entryJs = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/g)].map(m => m[1])
const entryBudget = []
if (target === 'dist') {
  for (const tag of [...tags, ...html.matchAll(/<script\b[^>]*src=["'][^"']+["'][^>]*>/g)].map(t => typeof t === 'string' ? t : t[0])) {
    const url = attr(tag, 'src') ?? attr(tag, 'href')
    if (url && attr(tag, 'rel') !== 'preconnect') checkPath(url, 'HTML')
  }
  for (const url of entryJs.filter(isLocal)) {
    const file = join(dir, url)
    if (!existsSync(file)) continue
    const raw = readFileSync(file), gzipBytes = gzipSync(raw).length
    entryBudget.push({ url, diskBytes: raw.length, gzipBytes })
    if (raw.includes('WebGLRenderer')) errors.push(`Entry contains WebGLRenderer: ${url}`)
    if (gzipBytes / 1024 > BUDGET.entryGzipKiB) errors.push(`Entry gzip ${(gzipBytes / 1024).toFixed(1)}KiB > ${BUDGET.entryGzipKiB}KiB`)
  }
}

const measurements = [], currentDist = existsSync(join(ROOT, 'dist/index.html')) ? fingerprint(join(ROOT, 'dist')) : null
for (const file of networkFiles) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (data.schemaVersion !== 1 || data.scenario !== 'startup-no-interaction' || !Array.isArray(data.requests)) throw Error('unsupported capture schema/scenario')
    if (!currentDist || data.distFingerprint !== currentDist) throw Error('capture does not match current dist (rebuild/capture again)')
    if (data.cache !== 'cold' || data.cacheDisabled !== false || data.freshContext !== true || data.browserCacheCleared !== true || data.bypassServiceWorker !== true) throw Error('not a verified cold-cache capture')
    if (!data.complete) throw Error('scene not ready by end of observation; capture incomplete')
    const base = new URL(data.url), requests = data.requests.map(r => {
      if (r?.phase && r.phase !== 'startup') throw Error('non-startup event inside startup request list')
      if (!r || typeof r.url !== 'string' || !Number.isFinite(r.startMs) || (!Number.isFinite(r.encodedBodyBytes) || r.encodedBodyBytes < 0) || (r.transferBytes !== null && (!Number.isFinite(r.transferBytes) || r.transferBytes < 0))) throw Error('invalid request measurement')
      const url = new URL(r.url), local = url.origin === base.origin, path = decodeURI(url.pathname), declared = local ? byUrl.get(path) : null
      const categories = declared?.categories ?? []
      return { ...r, path, local, categories, firstScreenRole: categories.includes('critical-texture') ? 'critical-texture' : categories.includes('loader-blocking-image') ? 'loader-blocking' : categories.includes('startup-nonblocking') ? 'non-blocking' : categories.includes('html-shell') ? 'html-shell' : ['Document','Script','Stylesheet'].includes(r.type) ? 'bootstrap-or-font-stylesheet' : r.type === 'Font' ? 'font-stage-url-selected-by-browser' : 'unknown',
        transferStatus: r.failure ? 'failed-partial' : r.finished ? 'finished' : 'pending-partial' }
    })
    // Keep every request, including retries. Do not deduplicate traffic by URL.
    const transferred = list => list.reduce((n, r) => n + (r.transferBytes ?? r.encodedBodyBytes), 0)
    const images = requests.filter(r => r.type === 'Image' || r.mime?.startsWith('image/'))
    const typeTotals = {}
    for (const r of requests) {
      const type = r.type || 'Unknown'
      typeTotals[type] ??= { requests: 0, transferBytes: 0 }
      typeTotals[type].requests++; typeTotals[type].transferBytes += r.transferBytes ?? r.encodedBodyBytes
    }
    const unexpectedDemand = requests.filter(r => r.local && r.categories.some(c => /on-demand$/.test(c)) && !r.categories.includes('critical-texture'))
    const missingCritical = critical.filter(c => !requests.some(r => r.local && r.path === c.url && r.finished && r.status >= 200 && r.status < 300 && r.mime?.startsWith('image/'))).map(c => c.url)
    if (missingCritical.length) errors.push(`${data.device}: critical textures not successfully observed: ${missingCritical.join(', ')}`)
    if (unexpectedDemand.length) warnings.push(`${data.device}: ${unexpectedDemand.length} declared on-demand resources actually requested at startup (see report)`)
    const badLocal = requests.filter(r => r.local && (r.failure || r.status >= 400 || !r.finished))
    if (badLocal.length) errors.push(`${data.device}: ${badLocal.length} failed/pending local requests; measured total incomplete`)
    const externalIncomplete = requests.filter(r => !r.local && (r.failure || !r.finished || r.status >= 400))
    if (externalIncomplete.some(r => r.type === 'Image' || r.mime?.startsWith('image/'))) errors.push(`${data.device}: startup image measurement incomplete for external images`)
    if (externalIncomplete.length) warnings.push(`${data.device}: ${externalIncomplete.length} failed/pending external requests; transfer is observed bytes, not successful full external payload`)
    if (transferred(requests) / 1024 > BUDGET.heroTransferKiB) errors.push(`${data.device}: measured startup transfer ${transferred(requests)}B (${(transferred(requests) / 1024).toFixed(1)}KiB) > ${BUDGET.heroTransferKiB * 1024}B (${BUDGET.heroTransferKiB}KiB) (ALL observed types, including early on-demand requests)`)
    const featureRequests = (data.featureRequests ?? []).map(r => {
      const url = new URL(r.url), row = url.origin === base.origin ? byUrl.get(decodeURI(url.pathname)) : null
      return { ...r, categories: row?.categories ?? [] }
    })
    measurements.push({ file: resolve(file), origin: base.origin, device: data.device, capturedAt: data.capturedAt, observationMs: data.observationMs, environment: data.environment,
      networkRequestsWithBytes: requests.filter(r => (r.transferBytes ?? r.encodedBodyBytes) > 0).length, zeroTransferRequestCount: requests.filter(r => r.finished && r.transferBytes === 0).length,
      networkComplete: !badLocal.length && !externalIncomplete.length, transferBytes: transferred(requests), imageTransferBytes: transferred(images),
      measurement: data.measurement, typeTotals, missingCritical, unexpectedDemand: unexpectedDemand.map(r => r.path),
      externalIncomplete, requests, featureChecks: data.featureChecks ?? [], featureRequests })
  } catch (e) { errors.push(`Network evidence ${file}: ${e.message}`) }
}
if (!networkFiles.length) errors.push('Startup transfer UNMEASURED: provide --network <matching cold-browser record>; disk sizes cannot satisfy the network gate')
const categories = [...new Set(stock.resources.flatMap(r => r.categories))].map(category => {
  const rows = stock.resources.filter(r => r.categories.includes(category))
  return { category, files: rows.length, diskBytes: sum(rows), urls: rows.map(r => r.url), basis: 'source declaration, NOT all requested together' }
})
const onDemand = FEATURES.map(feature => {
  const candidates = stock.resources.filter(r => r.categories.includes(feature.category))
  const retained = stock.resources.filter(r => r.featureOwner === feature.id && r.categories.includes('responsive-retained-not-selected'))
  const shared = candidates.filter(r => r.categories.includes('critical-texture') || r.categories.includes('loader-blocking-image'))
  const exclusive = candidates.filter(r => !shared.includes(r))
  const samples = measurements.map(m => {
    const requests = m.featureRequests.filter(r => r.phase === feature.id)
    const urls = new Set(candidates.map(r => r.url))
    const local = r => new URL(r.url).origin === m.origin
    const knownDataRequests = requests.filter(r => local(r) && urls.has(decodeURI(new URL(r.url).pathname)))
    const windowCodeRequests = requests.filter(r => local(r) && ['Script', 'Stylesheet'].includes(r.type))
    const classified = new Set([...knownDataRequests, ...windowCodeRequests])
    const received = rs => rs.reduce((n, r) => n + (r.transferBytes ?? r.encodedBodyBytes ?? 0), 0)
    return { device: m.device, observation: m.featureChecks.find(c => c.name === feature.id)?.status ?? 'not-exercised',
      knownDataRequests, knownDataReceivedBytes: received(knownDataRequests), windowCodeRequests, windowCodeReceivedBytes: received(windowCodeRequests),
      unrelatedOrUnassignedRequests: requests.filter(r => !classified.has(r)),
      partial: [...knownDataRequests, ...windowCodeRequests].some(r => !r.finished || r.failure),
      note: 'Only observed phase window. Code may be shared; unrelated API traffic is not attributed to this feature. Range/aborted media bytes can be a partial lower bound.' }
  })
  return { ...feature, enforcement: 'report-only', declaredFiles: candidates.length, declaredDiskBytes: sum(candidates),
    sharedWithStartup: shared.map(r => r.url), sharedDiskBytes: sum(shared), exclusiveFiles: exclusive.length, exclusiveDiskBytes: sum(exclusive),
    retainedAlternativeFiles: retained.length, retainedAlternativeDiskBytes: sum(retained),
    storageDiskBytes: sum(candidates) + sum(retained), candidateUrls: candidates.map(r => r.url), retainedUrls: retained.map(r => r.url), samples,
    note: 'Candidate/fallback choices are disk inventory, not all-at-once download. Shared startup sources are not an additional download. Generated Workshop geometry/audio have no file bytes.' }
})
const auditDispositions = ['cleanup-candidate', 'offline-build-input', 'pending-review']
const auditedResources = { total: stock.audits.length, entries: stock.audits,
  dispositions: auditDispositions.map(disposition => ({ disposition, files: stock.audits.filter(a => a.matches && a.disposition === disposition).length,
    diskBytes: stock.audits.filter(a => a.matches && a.disposition === disposition).reduce((n, a) => n + a.diskBytes, 0) })),
  drift: stock.audits.filter(a => !a.matches), policy: 'Preserve all 19. No deletion or automatic cleanup. Hash drift requires re-review.' }
const report = { schemaVersion: 2, target, budgets: BUDGET, passed: errors.length === 0, errors, warnings, preloads, entryBudget,
  startupBudget: { limitBytes: BUDGET.heroTransferKiB * 1024, scope: 'all observed startup requests; no category exclusions',
    samples: measurements.map(m => ({ device: m.device, observedBytes: m.transferBytes, withinObservedLimit: m.transferBytes <= BUDGET.heroTransferKiB * 1024, fullNetworkCoverage: m.networkComplete })) },
  inventory: inventoryReport, onDemand, auditedResources, declaredRgbaMipBytes, categories, resources: stock.resources, unknownUnreferenced: stock.resources.filter(r => r.status === 'unknown-unreferenced-candidate'),
  atlasInputsNotDirectDownloads: stock.resources.filter(r => r.categories.includes('atlas-build-input') && !r.categories.includes('critical-texture')),
  unresolved: stock.unresolved, responsive: stock.responsive, consistency, measurements,
  notes: [stock.caveat, '1600KiB applies to ALL actual startup requests including JS/CSS/images/fonts/audio/API, retries and response overhead. Labels never exclude a startup request; image subtotal remains visible. Entry gzip cap unchanged.',
    'Disk inventory is informational. Previous 8MiB reference is retained only for comparison, not enforced. Legitimate on-demand files, build inputs and retained history do not fail the startup gate merely by existing on disk.',
    'Only individual requests prove startup presence. Absence in one run does not prove universally unused. No GPU upload or image decode timing inferred from HTTP bytes.', ...notes] }
if (jsonPath) {
  const output = resolve(jsonPath)
  if ([...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'public')), join(ROOT, '.env.production.local')].includes(output)) throw Error('Report destination must not overwrite source/assets/environment')
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
}
console.log(`Disk inventory (REPORT ONLY, does not block): public: ${stock.resources.length} files / ${(sum(stock.resources) / 1024 ** 2).toFixed(2)}MiB; /assets inventory: ${(sum(assetRows) / 1024 ** 2).toFixed(3)}MiB`)
console.log(`Critical texture declarations: ${critical.length} / ${(sum(critical) / 1024).toFixed(1)}KiB on disk (NOT network measurement)`)
for (const m of measurements) console.log(`${m.device}: ${m.requests.length} observed requests; total ${(m.transferBytes / 1024).toFixed(1)}KiB; images ${(m.imageTransferBytes / 1024).toFixed(1)}KiB`)
console.log(`Responsive variants: ${stock.responsive.derivedFiles}; unknown/unreferenced candidates: ${report.unknownUnreferenced.length}`)
for (const f of onDemand) console.log(`On-demand ${f.id}: ${f.exclusiveFiles} exclusive candidates / ${(f.exclusiveDiskBytes / 1024 ** 2).toFixed(3)}MiB; shared ${(f.sharedDiskBytes / 1024).toFixed(1)}KiB; retained alternatives ${f.retainedAlternativeFiles}`)
console.log(`Audited resources: ${auditedResources.dispositions.map(d => `${d.disposition}=${d.files}`).join(', ')}; no deletion`)
for (const w of warnings) console.warn(`  ! ${w}`)
for (const e of errors) console.error(`  ✗ ${e}`)
console.log(`Asset gate ${report.passed ? 'PASSED' : 'FAILED'}: ${errors.length} errors / ${warnings.length} warnings${jsonPath ? `; report ${jsonPath}` : ''}`)
process.exitCode = errors.length ? 1 : 0
