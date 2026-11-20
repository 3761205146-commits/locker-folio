#!/usr/bin/env node
/** Cold production-preview evidence, no source changes or database writes.
 * node scripts/assets/capture-network.mjs --url http://127.0.0.1:4192 --out /tmp/startup.json [--mobile]
 * Requires installed Chromium (CHROMIUM_PATH overrides executable). */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { ROOT, fingerprint } from './resource-inventory.mjs'
const args = process.argv.slice(2), option = key => args[args.indexOf(key) + 1]
if (!args.includes('--url') || !args.includes('--out')) throw Error('Required: --url <local-production-preview> --out <json>')
const base = new URL(option('--url'))
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw Error('Capture only a local production preview matching current dist')
const mobile = args.includes('--mobile'), windowMs = 45_000
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, serviceWorkers: 'block' })
const page = await context.newPage(), cdp = await context.newCDPSession(page)
await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: false }); await cdp.send('Network.setBypassServiceWorker', { bypass: true }); await cdp.send('Network.clearBrowserCache')
const requests = new Map(), extraInfo = new Map(), errors = [], sceneStates = []
let phase = 'startup'
let originTime
const clean = url => { try { const u = new URL(url); return u.origin + decodeURI(u.pathname) } catch { return '[invalid-url]' } }
const elapsed = time => originTime === undefined ? 0 : Math.max(0, (time - originTime) * 1000)
// Playwright routing disables HTTP cache. Block writes in the page APIs instead,
// preserving normal within-navigation preload/memory/HTTP cache reuse.
await context.addInitScript(() => {
  window.__assetAuditBlocked = []
  const safe = method => ['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase())
  const record = method => window.__assetAuditBlocked.push({method:String(method).toUpperCase()})
  const originalFetch = window.fetch
  window.fetch = function(input, init) {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (!safe(method)) { record(method); return Promise.reject(new TypeError('Audit blocked write')) }
    return originalFetch.call(this, input, init)
  }
  const methods = new WeakMap(), open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function(method, ...rest) { methods.set(this, method); return open.call(this, method, ...rest) }
  XMLHttpRequest.prototype.send = function(...args) { const method=methods.get(this) ?? 'GET'; if(!safe(method)) {record(method); throw new TypeError('Audit blocked write')} return send.apply(this,args) }
  navigator.sendBeacon = () => {record('POST');return false}
})
page.on('pageerror', e => errors.push(e.name)) // no messages/headers which could contain configuration
cdp.on('Network.requestWillBeSent', e => {
  if (originTime === undefined) originTime = e.timestamp
  const key = `${e.requestId}:${requests.has(e.requestId) ? 'redirect' : ''}`
  if (requests.has(e.requestId)) requests.set(key, requests.get(e.requestId))
  requests.set(e.requestId, { phase, url: clean(e.request.url), method: e.request.method, type: e.type, startMs: elapsed(e.timestamp), status: null,
    transferBytes: null, encodedBodyBytes: 0, decodedBodyBytes: 0, fromDiskCache: false, fromMemoryCache: false, fromServiceWorker: false, networkStatus: extraInfo.get(e.requestId) ?? null, finished: false })
})
cdp.on('Network.responseReceivedExtraInfo', e => {
  const r = requests.get(e.requestId)
  if (r) r.networkStatus = e.statusCode
  else extraInfo.set(e.requestId, e.statusCode)
})
cdp.on('Network.requestServedFromCache' , e => { const r = requests.get(e.requestId); if (r) r.fromMemoryCache = true })
cdp.on('Network.responseReceived', e => {
  const r = requests.get(e.requestId); if (r) Object.assign(r, { status: e.response.status, mime: e.response.mimeType,
    responseMs: elapsed(e.timestamp), fromDiskCache: !!e.response.fromDiskCache, fromServiceWorker: !!e.response.fromServiceWorker,
    contentEncoding: e.response.headers['content-encoding'] ?? e.response.headers['Content-Encoding'] ?? null })
})
cdp.on('Network.dataReceived', e => { const r = requests.get(e.requestId); if (r) { r.encodedBodyBytes += e.encodedDataLength; r.decodedBodyBytes += e.dataLength } })
cdp.on('Network.loadingFinished', e => { const r = requests.get(e.requestId); if (r) Object.assign(r, { endMs: elapsed(e.timestamp), transferBytes: e.encodedDataLength, finished: true }) })
cdp.on('Network.loadingFailed', e => { const r = requests.get(e.requestId); if (r) Object.assign(r, { endMs: elapsed(e.timestamp), failure: e.errorText, finished: false }) })
const started = Date.now(), distFingerprint = fingerprint(join(ROOT, 'dist'))
try {
  await page.goto(base.href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  // Read already-exported stores; imports reuse the same module URL and module cache.
  await page.evaluate(async () => {
    const entry = document.querySelector('script[type="module"][src]')?.src
    if (!entry) return
    const mod = await import(entry)
    window.__assetAuditStores = Object.values(mod).filter(v => typeof v?.getState === 'function')
  })
  while (Date.now() - started < windowMs) {
    const snapshot = await page.evaluate(() => {
      const values = (window.__assetAuditStores ?? []).map(s => s.getState())
      const prep = values.find(s => typeof s.sceneRenderable === 'boolean'), app = values.find(s => s.scene && s.phase)
      return { atMs: performance.now(), phase: app?.phase ?? null, state: app?.scene?.state ?? null,
        sceneRenderable: prep?.sceneRenderable ?? false, resourcesAcquired: prep?.resourcesAcquired ?? false,
        texturesPrepared: prep?.texturesPrepared ?? false, failures: prep?.failures?.length ?? null,
        loaderPresent: !!document.querySelector('.loader'), canvasPresent: !!document.querySelector('.hero canvas') }
    })
    sceneStates.push(snapshot)
    await page.waitForTimeout(500)
  }
  const last = sceneStates.at(-1), complete = !!last?.sceneRenderable && last.phase === 'scene' && !last.loaderPresent
  const observationMs = Date.now() - started, windowEndMs = await page.evaluate(()=>performance.now())
  const startupRequests = structuredClone([...requests.values()]), featureChecks = []
  requests.clear()
  if (args.includes('--features') && complete) {
    const action = async (method, value) => page.evaluate(({method,value}) => {
      const store = window.__assetAuditStores.find(s => typeof s.getState()[method] === 'function')
      if (!store) throw Error('Store method not exported: ' + method)
      store.getState()[method](value)
    }, {method,value})
    const check = async (name, fn) => {
      phase = name
      try { await fn(); featureChecks.push({name, status: 'observed'}) }
      catch (e) { featureChecks.push({name, status: 'unverified', error: e.name}) }
    }
    await check('books', async () => { await action('openBook',1); await page.waitForTimeout(1500); await action('startReading'); await page.waitForTimeout(2000); await action('closeBook') })
    await check('profile', async () => { await action('openOverlay','about'); await page.waitForTimeout(2500); await action('closeOverlay'); await page.waitForTimeout(600) })
    await check('photobooth', async () => { await action('openBooth'); await page.locator('.pb-dialog').waitFor({timeout:15000}); await page.waitForTimeout(1500); await action('closeBooth') })
    await check('workshop', async () => { await action('openWorkshop'); await page.locator('.sw-workshop').waitFor({timeout:15000}); await page.waitForTimeout(3000); await page.getByRole('button',{name:'关闭脆皮捏捏工坊',exact:true}).click(); await page.waitForTimeout(500) })
    await check('records', async () => { await action('openOverlay','skills'); await page.locator('.record-card__disc').first().waitFor({timeout:15000}); for (const disc of await page.locator('.record-card__disc').all()) { await disc.hover(); await page.waitForTimeout(1500) } await action('closeOverlay'); await page.waitForTimeout(600) })
    await check('piano', async () => { const store = await page.evaluate(() => { const v=window.__assetAuditStores.find(s=>'melodyState' in s.getState()); if(!v)return false;v.getState().setOpen(true);return true }); if(!store)throw Error('piano store missing'); await page.locator('.piano-close').waitFor({timeout:15000}); await page.waitForTimeout(2500); await page.locator('.piano-close').click() })
  }
  const record = { schemaVersion: 1, scenario: 'startup-no-interaction', device: mobile ? 'mobile-viewport-emulation' : 'desktop',
    url: base.origin, capturedAt: new Date().toISOString(), distFingerprint, entryScripts: await page.locator('script[type="module"][src]').evaluateAll(es => es.map(e => new URL(e.src).pathname)),
    cache: 'cold', cacheDisabled: false, freshContext: true, browserCacheCleared: true, bypassServiceWorker: true, serviceWorkers: 'blocked',
    observationMs, windowEndMs, requestedWindowMs: windowMs, complete, sceneStates, requests: startupRequests, featureRequests: [...requests.values()], featureChecks, pageErrors: errors, blockedWrites: await page.evaluate(()=>window.__assetAuditBlocked),
    environment: 'Local Vite production preview; Chromium/SwiftShader. Not production CDN/Nginx or real phone. No camera/audio interaction.',
    measurement: 'CDP loadingFinished.encodedDataLength = browser-reported received bytes including response overhead; encodedBodyBytes = dataReceived encoded payload; decodedBodyBytes = decompressed HTTP body, NOT image bitmap decode or GPU memory. Failed/pending transfers are incomplete.' }
  writeFileSync(option('--out'), JSON.stringify(record, null, 2))
  console.log(JSON.stringify({ output: option('--out'), device: record.device, complete, requests: record.requests.length, scene: last, failed: record.requests.filter(r => r.failure).map(r => ({ url: r.url, failure: r.failure })) }))
} finally { await context.close(); await browser.close() }
