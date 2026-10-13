import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
const origin = 'https://bulktext.test'
const installShell = '<!doctype html><html><head><link rel="stylesheet" href="/assets/main.css"></head><body><script type="module" src="/assets/main.js"></script></body></html>'
const buildManifest = JSON.stringify({
  'src/main.tsx': { file: 'assets/main.js', isEntry: true, dynamicImports: ['src/pages/CampaignsPage.tsx'] },
  'src/pages/CampaignsPage.tsx': { file: 'assets/CampaignsPage-lazy.js', isDynamicEntry: true },
})

function createHarness({ failUrl = null } = {}) {
  const listeners = new Map()
  const stores = new Map()

  function normalize(input) {
    if (typeof input === 'string') return new URL(input, origin).pathname
    return new URL(input.url, origin).pathname
  }

  function cacheFor(name) {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)
    return {
      async put(key, response) { store.set(normalize(key), response.clone()) },
      async match(key) { return store.get(normalize(key))?.clone() },
    }
  }

  const caches = {
    open: async (name) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (key) => {
      for (const name of stores.keys()) {
        const found = await cacheFor(name).match(key)
        if (found) return found
      }
      return undefined
    },
  }

  const fetch = async (input) => {
    const path = normalize(input)
    if (path === failUrl) return new Response('missing', { status: 404 })
    if (path === '/') return new Response(installShell, { status: 200, headers: { 'content-type': 'text/html' } })
    if (path === '/asset-manifest.json') return new Response(buildManifest, { status: 200, headers: { 'content-type': 'application/json' } })
    if (path === '/campaigns/new') return new Response('<html>network-new-build</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    return new Response(`asset:${path}`, { status: 200 })
  }

  const self = {
    location: { origin },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, handler) { listeners.set(type, handler) },
  }

  vm.runInNewContext(source, { self, caches, fetch, Response, URL, console, Promise, Set, Error })
  return { listeners, stores, caches }
}

async function runInstall(harness) {
  let pending
  harness.listeners.get('install')({ waitUntil(value) { pending = value } })
  assert.ok(pending, 'install handler must register waitUntil')
  return pending
}

{
  const harness = createHarness({ failUrl: '/assets/main.js' })
  await assert.rejects(runInstall(harness), /Required offline shell asset failed/)
  assert.equal([...harness.stores.keys()].some((name) => name.includes('shell-0.20.1')), false, 'failed required asset must not commit a shell cache')
}

{
  const harness = createHarness()
  await runInstall(harness)
  const shellName = [...harness.stores.keys()].find((name) => name.includes('shell-0.20.1'))
  assert.ok(shellName, 'successful install must create the versioned shell cache')
  const shellStore = harness.stores.get(shellName)
  assert.ok(shellStore.has('/'), 'installed shell HTML must be cached')
  assert.ok(shellStore.has('/assets/main.js'), 'referenced build JavaScript must be cached')
  assert.ok(shellStore.has('/assets/main.css'), 'referenced build CSS must be cached')
  assert.ok(shellStore.has('/assets/CampaignsPage-lazy.js'), 'manifest-discovered lazy route JavaScript must be cached')
  assert.ok(shellStore.has('/asset-manifest.json'), 'build asset manifest must be cached with the installed shell')

  let responsePromise
  harness.listeners.get('fetch')({
    request: { method: 'GET', mode: 'navigate', url: `${origin}/campaigns/new` },
    respondWith(value) { responsePromise = value },
  })
  const response = await responsePromise
  assert.match(await response.text(), /network-new-build/, 'online navigation should use the network response')
  assert.match(await shellStore.get('/').clone().text(), /main\.js/, 'online navigation must not replace the immutable installed shell')
}

console.log('Web 0.20.1 service-worker shell integrity: PASS (10 assertions)')
