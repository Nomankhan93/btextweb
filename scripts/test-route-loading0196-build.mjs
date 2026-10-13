import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve('dist')
const MANIFEST = path.join(DIST, 'asset-manifest.json')
const INITIAL_JS_BUDGET_BYTES = 500 * 1024
const MAX_CHUNK_BYTES = 500_000

assert.ok(fs.existsSync(MANIFEST), 'dist/asset-manifest.json must exist; run npm run build first')
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const entries = Object.entries(manifest)
const appEntry = entries.find(([key, value]) => key === 'src/main.tsx' || value?.isEntry)
assert.ok(appEntry, 'Vite manifest must expose the application entry')
const bootstrapEntry = entries.find(
  ([key, value]) =>
    value?.name === 'AppBootstrap' &&
    value?.isDynamicEntry === true &&
    appEntry[1]?.dynamicImports?.includes(key),
)

assert.ok(
  bootstrapEntry,
  'Vite manifest must expose AppBootstrap as a dynamic entry from the application entry',
)

const byFile = new Map(entries.map(([, value]) => [value.file, value]))
const initialFiles = new Set()
function collectStatic(file) {
  if (!file || initialFiles.has(file)) return
  initialFiles.add(file)
  const entry = byFile.get(file)
  for (const imported of entry?.imports ?? []) {
    const importedEntry = manifest[imported]
    if (importedEntry?.file) collectStatic(importedEntry.file)
  }
}
collectStatic(appEntry[1].file)

assert.ok(!initialFiles.has(bootstrapEntry[1].file), 'AppBootstrap must not be part of the initial static dependency graph')

const initialJsFiles = [...initialFiles].filter((file) => file.endsWith('.js'))
const initialJsBytes = initialJsFiles.reduce((sum, file) => sum + fs.statSync(path.join(DIST, file)).size, 0)
const dynamicEntries = entries.filter(([, value]) => value?.isDynamicEntry)
const emittedJs = entries.map(([, value]) => value?.file).filter((file) => typeof file === 'string' && file.endsWith('.js'))
const uniqueJs = [...new Set(emittedJs)]
const largestJs = uniqueJs
  .map((file) => ({ file, bytes: fs.statSync(path.join(DIST, file)).size }))
  .sort((a, b) => b.bytes - a.bytes)[0]

assert.ok(dynamicEntries.length >= 11, `expected at least 11 dynamic entries including AppBootstrap, found ${dynamicEntries.length}`)
assert.ok(initialJsBytes < INITIAL_JS_BUDGET_BYTES, `initial static JS is ${initialJsBytes} bytes; budget is ${INITIAL_JS_BUDGET_BYTES}`)
assert.ok(largestJs && largestJs.bytes < MAX_CHUNK_BYTES, `largest emitted JS chunk exceeds 500,000 bytes: ${largestJs?.file} (${largestJs?.bytes ?? 0} bytes)`)

for (const [, value] of entries) {
  if (typeof value?.file === 'string') assert.ok(fs.existsSync(path.join(DIST, value.file)), `manifest file missing: ${value.file}`)
}

console.log(`Web 0.20.0 bundle budget: PASS (initial JS ${initialJsBytes} bytes across ${initialJsFiles.length} file(s); ${dynamicEntries.length} dynamic entries; largest ${largestJs.file} ${largestJs.bytes} bytes)`)
