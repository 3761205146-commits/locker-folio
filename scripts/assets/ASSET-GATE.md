# Asset policy: measured startup, on-demand statistics and disk inventory

## Enforced rules

- **Startup cap: 1600 KiB (1,638,400 B), unchanged.** Count ALL browser-recorded startup transfers: HTML, JS, CSS, images, fonts, audio, APIs, retries and response overhead. Do not deduplicate by URL, substitute disk sums, or exempt a file because its catalog says on-demand/history. The previous image-only check is now a stricter all-request check; image/type subtotals remain visible.
- Require a matching production `dist` fingerprint, a fresh cold context with normal within-visit cache reuse, and a ready scene. Missing/stale/warm/incomplete evidence cannot pass. Mixed feature events inside a startup list are rejected.
- Local failed/pending requests fail validation; external incomplete resources are visible warnings, with incomplete external images still an error. A reported received total is the actual observed amount, not a claim that failed fonts/APIs completed. JSON records `fullNetworkCoverage: false` when applicable.
- Entry gzip cap remains 120 KiB. Critical image RGBA+mipmap estimate retains the 48 MiB warning threshold; it is not measured GPU allocation.
- Existing preload/path, atlas and manifest read-only consistency checks remain.

## Report-only rules

- Disk inventory is **not a startup budget**. Report `public/assets` independently (currently 139 files, 22,162,794 B = 21.136087 MiB), plus whole-public inventory. The former 8 MiB value remains a historical comparison with `enforced: false`, not a raised cap or a reason to fail builds.
- Photobooth, books, Workshop, records and piano have independent statistics. Profile and other work views are also separate. No arbitrary per-feature numeric limit is introduced.
- Each feature reports candidate/fallback file count and disk bytes, retained alternatives, startup-shared sources, and observed post-open traffic. Code requests observed during a feature window are separate from known data requests; unrelated API traffic is not attributed to the feature.
- Workshop's Cheez face is already a startup source: it has zero exclusive public-file bytes. Its shaders/fragments and Web Audio are generated. Lazy JS/CSS observed after opening are still reported.
- Range/aborted/pending media records are partial received-byte lower bounds, not whole-song download sizes. On-demand statistics never add post-open bytes to startup.
- If an on-demand frame, book image or music file actually appears in the startup record, it DOES count toward the 1600 KiB cap.

## Preserve assets and audited dispositions

`scripts/assets/audited-resources.json` persists all 19 findings with source/history evidence, size and SHA256:

- 17 `cleanup-candidate`: retired runtime assets retained on disk; **labels only, not deletion approval**. stk10/stk11 remain outputs of the historical text-sticker generator.
- `stk1.webp`: `offline-build-input`, still read by build-badge.mjs. Current cabinet uses only the resulting idcard2 ring crop; this is not a claim that the old avatar appears on the Liz card.
- `liz-id-photo.jpg`: `pending-review`. It resembles the current composite card portrait but no generator proves the relationship; no automatic deletion.

A hash/size change or a newly resolved active reference to a cleanup candidate requires re-review instead of blindly applying the old label. These tools never clean, compress, regenerate or delete assets. The audit is not shipped as a runtime dependency.

All **147 original JPG and 386 responsive WebP** remain. Original and derived files are real separate disk costs, but srcset choices are not all downloaded together. Books' retained variants are reported separately; profile is not double-counted as books. The 31 retained WebP files whose original JPG wins remain on disk. Current atlas source images remain necessary build inputs even though the browser loads the atlas alone. Per-feature tables overlap for shared sources, so do not add them together as a unique global inventory.

## Reproduce

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4192 --strictPort
# In a second terminal, leave preview running:
node scripts/assets/capture-network.mjs --url http://127.0.0.1:4192 --out /tmp/desktop-cold.json --features
node scripts/assets/capture-network.mjs --url http://127.0.0.1:4192 --out /tmp/mobile-cold.json --mobile
node scripts/check-assets.mjs dist --network /tmp/desktop-cold.json --network /tmp/mobile-cold.json --json /tmp/asset-report.json
ASSET_NETWORK_RECORD=/tmp/desktop-cold.json node --test scripts/assets/check-assets.test.mjs
```

Use a `--features` capture for integration tests that cover post-open traffic. `CHROMIUM_PATH` selects an installed Chromium. Approximate 45-second startup observation is no-interaction; feature samples occur later in a separate list. Test fixtures that deliberately inflate bytes are synthetic policy tests, not performance measurements.

The capture creates a fresh browser context, clears cache, leaves within-navigation HTTP cache enabled and bypasses service workers. Playwright network routing is avoided because it disables HTTP caching. Local Vite preview/SwiftShader/mobile viewport results are not production-CDN or real-phone measurements. Headers, keys and bodies are not stored. HTTP writes in page fetch/XHR/beacon APIs are blocked; no messages are sent and no camera/photo operation is started. Certificate errors are not bypassed.

CDP `loadingFinished.encodedDataLength` is actual browser-reported received bytes including overhead; `encodedBodyBytes` is encoded payload, used as a partial lower bound for unfinished transfers. `decodedBodyBytes` is decompressed HTTP body, NOT bitmap decode or GPU memory. Cache/revalidation requests can transfer headers without another full payload. Effective status and raw `networkStatus` are distinguished where captured.

Output schema v2 includes `startupBudget`, `onDemand`, `auditedResources`, `inventory`, complete requests and evidence. Running without `--network` deliberately fails as UNMEASURED; inventory existence cannot replace a real startup measurement. Application runtime, original media, environment and server configuration are untouched.
