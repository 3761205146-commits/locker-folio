/** Read-only classification. Declarations are not network measurements. */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import ts from 'typescript'
export const ROOT = resolve(new URL('../..', import.meta.url).pathname)
export function walk(dir) {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]) : []
}
export function fingerprint(dir) {
  const hash = createHash('sha256')
  for (const file of walk(dir)) hash.update(relative(dir, file)).update('\0').update(readFileSync(file)).update('\0')
  return hash.digest('hex')
}
const read = path => readFileSync(join(ROOT, path), 'utf8')
const parse = file => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
function visit(node, fn) { fn(node); ts.forEachChild(node, child => visit(child, fn)) }
function strings(file) {
  const values = []
  visit(parse(file), n => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) values.push(n.text)
    if (ts.isTemplateExpression(n) && n.head.text === '' && n.templateSpans.length === 1
      && n.templateSpans[0].expression.getText() === 'import.meta.env.BASE_URL') values.push('/' + n.templateSpans[0].literal.text)
  })
  return values
}
function activeFiles() {
  const active = new Set(), unresolved = []
  function scan(file) {
    if (active.has(file) || !existsSync(join(ROOT, file))) return
    active.add(file)
    if (!/\.tsx?$/.test(file)) return
    visit(parse(file), n => {
      let spec
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) spec = n.moduleSpecifier.text
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (ts.isStringLiteral(n.arguments[0])) spec = n.arguments[0].text
        else unresolved.push({ file, expression: n.getText() })
      }
      if (!spec?.startsWith('.')) return
      const base = join(dirname(file), spec)
      const found = [base, ...['.ts', '.tsx', '.json', '.css', '/index.ts', '/index.tsx'].map(e => base + e)].find(f => existsSync(join(ROOT, f)) && statSync(join(ROOT, f)).isFile())
      if (found) scan(found)
      else unresolved.push({ file, expression: spec })
    })
  }
  scan('src/main.tsx')
  return { active, unresolved }
}
export const FEATURES = [
  { id: 'books', category: 'books-on-demand' },
  { id: 'profile', category: 'profile-on-demand' },
  { id: 'photobooth', category: 'photobooth-on-demand' },
  { id: 'workshop', category: 'workshop-on-demand' },
  { id: 'records', category: 'records-on-demand' },
  { id: 'piano', category: 'piano-on-demand' },
  { id: 'work', category: 'work-on-demand' },
]
export function inventory() {
  const rows = new Map(walk(join(ROOT, 'public')).map(file => {
    const url = '/' + relative(join(ROOT, 'public'), file)
    return [url, { url, diskBytes: statSync(file).size, categories: [], evidence: [], activeReferences: [] }]
  }))
  const missing = [], add = (url, category, evidence) => {
    const row = rows.get(url)
    if (!row) { missing.push({ url, category, evidence }); return }
    if (!row.categories.includes(category)) row.categories.push(category)
    if (!row.evidence.includes(evidence)) row.evidence.push(evidence)
  }
  const { active, unresolved } = activeFiles()
  for (const file of active) {
    if (!/\.tsx?$/.test(file)) continue
    for (const url of strings(file).filter(s => /^\/(assets|images|audio)\//.test(s) && !s.includes('${'))) {
      if (rows.has(url)) rows.get(url).activeReferences.push(file)
    }
  }
  const manifest = 'src/experience/assetManifest.ts'
  visit(parse(manifest), n => {
    if (!ts.isCallExpression(n) || !['prop', 'decal', 'lazyAsset'].includes(n.expression.getText())) return
    const url = n.arguments[1]
    if (url && ts.isStringLiteral(url) && url.text.startsWith('/')) add(url.text,
      n.expression.getText() === 'lazyAsset' ? 'work-on-demand' : 'loader-blocking-image', `${manifest}:${n.expression.getText()}`)
  })
  // Variants are alternatives selected by srcset, never summed as startup traffic.
  for (const url of strings(manifest).filter(s => /^\/assets\/(photo|posters|mag|cover)\//.test(s))) add(url, 'work-on-demand', manifest)
  const heroSource = 'src/scene/scenePreparation.ts'
  for (const url of strings(heroSource).filter(s => s.startsWith('/'))) add(url, 'critical-texture', `${heroSource}:HERO_TEXTURE_URLS`)
  const atlas = JSON.parse(read('scripts/assets/decal-atlas.json'))
  add(atlas.url, 'critical-texture', 'decalAtlas.ts / ScenePreparation.tsx')
  for (const url of Object.keys(atlas.entries)) add(url, 'atlas-build-input', 'decal-atlas.json: UV keys; not individual texture downloads')
  for (const url of strings('src/components/photobooth/frames.ts').filter(s => s.startsWith('/assets/'))) add(url, 'photobooth-on-demand', 'frames.ts / conditional PhotoboothModal in App.tsx')
  for (const url of strings('src/components/squishy/WorkshopScene.tsx').filter(s => s.startsWith('/images/'))) {
    add(url, 'workshop-shared', 'WorkshopScene.tsx; same URL already critical in cabinet')
    add(url, 'workshop-on-demand', 'WorkshopScene.tsx shared source, not an additional download')
  }
  for (const file of ['src/components/piano/PianoModal.tsx', 'src/components/records/recordCatalog.ts'])
    for (const url of strings(file).filter(s => s.startsWith('/audio/'))) add(url, file.includes('/piano/') ? 'piano-on-demand' : 'records-on-demand', file)
  const bookOriginals = new Set()
  // Read actual constructor count rather than hard-coding all files in a directory.
  const count = read('src/components/books/booksData.ts').match(/Array\.from\(\{\s*length:\s*(\d+)/)?.[1]
  if (!count) unresolved.push({ file: 'booksData.ts', expression: 'cover count unknown' })
  else for (let i = 1; i <= Number(count); i++) bookOriginals.add(`/images/albums/${i}.jpg`)
  for (const m of read('src/components/books/bookPages.ts').matchAll(/page\('([^']+)',\s*'([^']+)'\)/g)) bookOriginals.add(`/images/book-pages/${m[1]}/${m[2]}`)
  const profile = '/images/liz-ive-profile-detail.jpg'
  if (strings('src/components/overlays/AboutCard.tsx').includes(profile)) bookOriginals.add(profile)
  const photos = JSON.parse(read('src/components/images/responsive-photos.json'))
  for (const url of bookOriginals) {
    const category = url === profile ? 'profile-on-demand' : 'books-on-demand'
    add(url, category, 'booksData.ts / bookPages.ts / AboutCard.tsx; original fallback')
    const photo = photos[url]
    const featureOwner = url === profile ? 'profile' : 'books'
    if (rows.has(url)) rows.get(url).featureOwner = featureOwner
    for (const width of photo?.widths ?? []) {
      const derived = url.replace('/images/', '/images/responsive/').replace(/\.jpg$/i, `-${width}.webp`)
      if (rows.has(derived)) rows.get(derived).featureOwner = featureOwner
    }
    for (const width of photo?.widths ?? []) {
      if (photo.originalWidths?.includes(width)) continue
      add(url.replace('/images/', '/images/responsive/').replace(/\.jpg$/i, `-${width}.webp`), category, `responsive-photos.json: ${url}, ${width}w alternative`)
    }
  }
  // Retained generated files deliberately not selected when the original JPG is
  // smaller at that width. They are inventory, not srcset request candidates.
  for (const [url, photo] of Object.entries(photos)) for (const width of photo.originalWidths ?? []) {
    const derived = url.replace('/images/', '/images/responsive/').replace(/\.jpg$/i, `-${width}.webp`)
    if (rows.has(derived)) add(derived, 'responsive-retained-not-selected', `responsive-photos.json originalWidths + photoSource(): ${url} ${width}w uses JPG`)
  }
  for (const url of strings('src/components/messages/MessagesForLiz.tsx').filter(s => s.startsWith('/images/'))) add(url, 'startup-nonblocking', 'MessagesForLiz.tsx DOM image; outside critical texture and Loader manifests')
  for (const m of read('index.html').matchAll(/href=["'](\/[^"']+)["']/g)) if (rows.has(m[1]) && !rows.get(m[1]).categories.length) add(m[1], 'html-shell', 'index.html link')
  // Old sprite URLs survive in timing specs, but active PhysicalItem renders
  // children and reads timing/name only. The old spec.url consumer is unreachable.
  if (!active.has('src/scene/PropDecal.tsx') && !/\bspec\.url\b/.test(read('src/scene/Props.tsx'))) {
    for (const row of rows.values()) if (!row.categories.length && row.activeReferences.length
      && row.activeReferences.every(f => f === 'src/scene/propSpecs.ts')) add(row.url, 'legacy-spec-metadata-only', 'propSpecs.ts -> Props.tsx PhysicalItem/IntroPhysical: URL not consumed; PropDecal absent from entry graph')
  }
  const audits = JSON.parse(read('scripts/assets/audited-resources.json')).entries.map(entry => {
    const row = rows.get(entry.url)
    const hashMatches = !!row && row.diskBytes === entry.diskBytes
      && createHash('sha256').update(readFileSync(join(ROOT, 'public', entry.url))).digest('hex') === entry.sha256
    const referencesChanged = entry.disposition === 'cleanup-candidate' && !!row?.activeReferences.length
    const matches = hashMatches && !referencesChanged
    if (matches) {
      add(entry.url, entry.disposition, 'audited-resources.json: explicit reviewed disposition, never auto-delete')
      row.auditDisposition = entry.disposition
    } else if (row) add(entry.url, 'audit-recheck-required', 'audited resource bytes/hash changed; previous label is not applied')
    return { ...entry, matches, hashMatches, referencesChanged, currentDiskBytes: row?.diskBytes ?? null }
  })
  for (const row of rows.values()) {
    row.activeReferences = [...new Set(row.activeReferences)]
    // No reference found is not proof of unused: keep unresolved files explicit.
    row.status = row.auditDisposition ?? (row.categories.includes('audit-recheck-required') ? 'audit-recheck-required' : row.categories.length ? 'declared' : row.activeReferences.length ? 'referenced-timing-unknown' : 'unknown-unreferenced-candidate')
  }
  return { resources: [...rows.values()], audits, missing, unresolved, activeSourceCount: active.size,
    responsive: { originalEntries: Object.keys(photos).length,
      originalDiskBytes: Object.keys(photos).reduce((n, u) => n + (rows.get(u)?.diskBytes ?? 0), 0),
      derivedFiles: [...rows.keys()].filter(u => u.startsWith('/images/responsive/') && u.endsWith('.webp')).length,
      derivedDiskBytes: [...rows.values()].filter(r => r.url.startsWith('/images/responsive/') && r.url.endsWith('.webp')).reduce((n,r)=>n+r.diskBytes,0) },
    caveat: 'Categories may overlap. On-demand lists are possible choices/fallbacks, not all downloaded together. Atlas inputs are retained build sources. Unknown/unreferenced does not prove unused. Audited dispositions are labels only and never authorize cleanup.' }
}
