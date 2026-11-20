import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { inventory, ROOT } from './resource-inventory.mjs'

// Modified capture fixtures below are synthetic policy tests, NEVER field measurements.
const temp = mkdtempSync(join(tmpdir(), 'asset-policy-tests-'))
let seq = 0
function run(extra = []) {
  const report = join(temp, `report-${seq++}.json`)
  const result = spawnSync(process.execPath, ['scripts/check-assets.mjs', 'dist', ...extra, '--json', report], { cwd: ROOT, encoding: 'utf8' })
  assert.ok([0, 1].includes(result.status), result.stderr)
  const data = JSON.parse(readFileSync(report, 'utf8'))
  assert.equal(result.status, data.passed ? 0 : 1)
  return data
}
function save(data) {
  const path = join(temp, `synthetic-${seq++}.json`)
  writeFileSync(path, JSON.stringify(data))
  return path
}
const stock = inventory()
test('all originals/variants remain; 19 audits label candidates, offline input and unresolved portrait separately', () => {
  assert.equal(stock.responsive.originalEntries, 147)
  assert.equal(stock.responsive.derivedFiles, 386)
  assert.equal(stock.responsive.originalDiskBytes, 75155397)
  assert.equal(stock.responsive.derivedDiskBytes, 54588448)
  assert.equal(stock.missing.length, 0)
  assert.equal(stock.audits.length, 19)
  assert.ok(stock.audits.every(a => a.matches))
  assert.equal(stock.audits.filter(a => a.disposition === 'cleanup-candidate').length, 17)
  const offline = stock.audits.filter(a => a.disposition === 'offline-build-input')
  assert.deepEqual(offline.map(a => a.url), ['/assets/obj2/stk1.webp'])
  const pending = stock.audits.filter(a => a.disposition === 'pending-review')
  assert.deepEqual(pending.map(a => a.url), ['/assets/obj/liz/liz-id-photo.jpg'])
  assert.equal(stock.resources.filter(r => r.categories.includes('critical-texture')).length, 9)
  assert.equal(stock.resources.filter(r => r.categories.includes('responsive-retained-not-selected')).length, 31)
  const face = stock.resources.find(r => r.url === '/images/cheez-plush-face.png')
  assert.ok(face.categories.includes('workshop-on-demand') && face.categories.includes('critical-texture'))
})
test('inventory >8MiB is informational; missing real network evidence still fails and limits remain strict', () => {
  const r = run()
  assert.equal(r.passed, false)
  assert.equal(r.measurements.length, 0)
  assert.ok(r.errors.some(e => e.includes('UNMEASURED')))
  assert.deepEqual(r.budgets, { heroTransferKiB: 1600, heroDecodedMiB: 48, entryGzipKiB: 120 })
  assert.equal(r.inventory.enforced, false)
  assert.equal(r.inventory.legacyReferenceMiB, 8)
  assert.equal(r.inventory.assetsDiskBytes, 22162794)
  assert.equal(r.inventory.assetsByRole.reduce((n,g)=>n+g.diskBytes,0), r.inventory.assetsDiskBytes)
  assert.equal(new Set(r.inventory.assetsByRole.flatMap(g=>g.urls)).size, r.inventory.assetsFiles)
  assert.ok(r.inventory.excessOverLegacyReferenceBytes > 0)
  assert.ok(!r.errors.some(e => e.includes('Disk inventory')))
  for (const [id, count] of [['books',497],['profile',5],['photobooth',2],['records',3],['piano',2]]) {
    const f = r.onDemand.find(f => f.id === id)
    assert.equal(f.exclusiveFiles, count)
    assert.equal(f.enforcement, 'report-only')
  }
  const workshop = r.onDemand.find(f => f.id === 'workshop')
  assert.equal(workshop.exclusiveFiles, 0)
  assert.deepEqual(workshop.sharedWithStartup, ['/images/cheez-plush-face.png'])
})
const evidence = process.env.ASSET_NETWORK_RECORD
if (evidence) {
  const readTrace = () => JSON.parse(readFileSync(evidence, 'utf8'))
  test('matching real capture passes despite retained inventory and on-demand frame size; counts all requests/types', () => {
    const trace = readTrace(), r = run(['--network', evidence])
    assert.equal(r.passed, true)
    assert.equal(r.measurements.length, 1)
    const m = r.measurements[0]
    assert.equal(m.requests.length, trace.requests.length)
    assert.equal(m.transferBytes, trace.requests.reduce((n,x) => n + (x.transferBytes ?? x.encodedBodyBytes), 0))
    assert.equal(m.missingCritical.length, 0)
    assert.equal(m.unexpectedDemand.length, 0)
    assert.equal(m.requests.filter(r => r.url.endsWith('/assets/obj2/doorDecals.webp')).length, trace.requests.filter(r => r.url.endsWith('/assets/obj2/doorDecals.webp')).length)
    assert.ok(r.onDemand.find(f => f.id === 'photobooth').exclusiveDiskBytes > 8 * 1024 ** 2)
    assert.equal(r.startupBudget.limitBytes, 1600 * 1024)
    assert.equal(r.startupBudget.samples[0].observedBytes, m.transferBytes)
  })
  test('large legitimate post-open traffic stays separate from startup; data and code are independently reported', () => {
    const trace = readTrace(), originalTotal = trace.requests.reduce((n,r) => n + (r.transferBytes ?? r.encodedBodyBytes),0)
    const frame = trace.featureRequests.find(r => r.phase === 'photobooth' && r.type === 'Image')
    assert.ok(frame, 'use a real --features capture for this test')
    frame.transferBytes = 64 * 1024 ** 2
    frame.encodedBodyBytes = frame.transferBytes
    const media = trace.featureRequests.find(r => r.phase === 'records' && r.type === 'Media')
    assert.ok(media)
    Object.assign(media, { finished: false, transferBytes: null, encodedBodyBytes: 1234, failure: 'net::ERR_ABORTED' })
    const r = run(['--network', save(trace)])
    assert.equal(r.passed, true)
    assert.equal(r.measurements[0].transferBytes, originalTotal)
    const booth = r.onDemand.find(f => f.id === 'photobooth').samples[0]
    assert.ok(booth.knownDataReceivedBytes >= 64 * 1024 ** 2)
    assert.ok(booth.windowCodeRequests.length > 0)
    assert.ok(r.onDemand.find(f => f.id === 'records').samples[0].partial)
  })
  test('early on-demand image is never exempt from the real startup cap', () => {
    const trace = readTrace(), frame = structuredClone(trace.featureRequests.find(r => r.phase === 'photobooth' && r.type === 'Image'))
    Object.assign(frame, { phase: 'startup', transferBytes: 2 * 1024 ** 2, encodedBodyBytes: 2 * 1024 ** 2 })
    trace.requests.push(frame)
    const r = run(['--network', save(trace)])
    assert.equal(r.passed, false)
    assert.ok(r.errors.some(e => e.includes('measured startup transfer')))
    assert.ok(r.measurements[0].unexpectedDemand.includes('/assets/photobooth/人生四宫格1.png'))
  })
  test('non-image JS also counts; exact 1600KiB boundary passes, one byte over fails', () => {
    const trace = readTrace(), total = trace.requests.reduce((n,r)=>n+(r.transferBytes??r.encodedBodyBytes),0)
    const script = trace.requests.find(r => r.type === 'Script')
    script.transferBytes += 1600 * 1024 - total
    assert.equal(run(['--network', save(trace)]).passed, true)
    script.transferBytes++
    const over = run(['--network', save(trace)])
    assert.equal(over.passed, false)
    assert.ok(over.errors.some(e => e.includes('measured startup transfer')))
  })
  test('warm, fully-disabled-cache, stale-build and mixed feature/startup evidence cannot pass', () => {
    for (const change of [{ cache: 'warm' }, { cacheDisabled: true }, { distFingerprint: 'stale' }, { complete: false }]) {
      const r = run(['--network', save({ ...readTrace(), ...change })])
      assert.equal(r.measurements.length, 0)
      assert.ok(r.errors.some(e => e.startsWith('Network evidence')))
    }
    const trace = readTrace(); trace.requests[0].phase = 'photobooth'
    const r = run(['--network', save(trace)])
    assert.ok(r.errors.some(e => e.includes('non-startup event')))
  })
}
process.on('exit', () => rmSync(temp, { recursive: true, force: true }))
