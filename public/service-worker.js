/* BulkText Web 0.20.5-r1 service worker.
 * Safety boundary: cache only the same-origin app shell and static assets.
 * Supabase/auth/queue/delivery/gateway requests are never cached or replayed.
 * The installed shell is immutable for this worker version so its hashed JS/CSS
 * always stays paired with the HTML that referenced it at installation time.
 */
const VERSION = '0.20.5-r1'
const CACHE_PREFIX = 'bulktext-pwa-'
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${VERSION}`
const APP_SHELL = '/'
const OFFLINE_FALLBACK = '/offline.html'
const PRECACHE_URLS = [
  APP_SHELL,
  OFFLINE_FALLBACK,
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/branding/bulktext-logo.png',
  '/asset-manifest.json',
]

async function requiredResponse(url) {
  const response = await fetch(url, { cache: 'reload' })
  if (!response.ok) throw new Error(`Required offline shell asset failed: ${url} (${response.status})`)
  return response
}

function buildManifestAssets(manifest) {
  const urls = []
  for (const entry of Object.values(manifest)) {
    if (typeof entry?.file === 'string') urls.push(`/${entry.file}`)
    if (Array.isArray(entry?.css)) urls.push(...entry.css.map((path) => `/${path}`))
    if (Array.isArray(entry?.assets)) urls.push(...entry.assets.map((path) => `/${path}`))
  }
  return urls
}

async function precacheAppShell() {
  const shellResponse = await requiredResponse(APP_SHELL)
  const shellHtml = await shellResponse.clone().text()
  const htmlAssets = [...shellHtml.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1])
  const manifestResponse = await requiredResponse('/asset-manifest.json')
  const manifest = await manifestResponse.clone().json()
  const buildAssets = buildManifestAssets(manifest)
  const urls = [...new Set([...PRECACHE_URLS.filter((url) => ![APP_SHELL, '/asset-manifest.json'].includes(url)), ...htmlAssets, ...buildAssets])]

  // Fetch and validate the complete build before mutating the versioned cache.
  // This includes lazy route chunks from the Vite manifest so an installed PWA
  // keeps the same cold-start offline route coverage after code splitting.
  const fetched = await Promise.all(urls.map(async (url) => [url, await requiredResponse(url)]))
  const cache = await caches.open(SHELL_CACHE)
  await cache.put(APP_SHELL, shellResponse)
  await cache.put('/asset-manifest.json', manifestResponse)
  await Promise.all(fetched.map(([url, response]) => cache.put(url, response)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

function isStaticAsset(url) {
  return url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/icons/')
    || url.pathname.startsWith('/branding/')
    || url.pathname === '/manifest.webmanifest'
    || url.pathname === '/favicon.ico'
    || url.pathname.startsWith('/favicon-')
    || url.pathname === '/apple-touch-icon.png'
}

async function installedShellNavigation(request) {
  const cache = await caches.open(SHELL_CACHE)
  const installedShell = await cache.match(APP_SHELL)

  // A controlled client stays pinned to the HTML/assets installed by its
  // active worker. A newer deployment may download a waiting worker, but the
  // running app does not switch builds until the user chooses Update now.
  if (installedShell) return installedShell

  // The shell cache should exist after a successful install. If it is missing
  // or damaged, recover from the network without treating HTTP 4xx/5xx as a
  // successful app-shell navigation. This also avoids surfacing a host 404 in
  // an installed app when an offline fallback is available.
  let networkResponse
  try {
    networkResponse = await fetch(request)
    if (networkResponse.ok) return networkResponse
  } catch {
    // Fall through to the offline fallback below.
  }

  return (await cache.match(OFFLINE_FALLBACK)) || networkResponse || Response.error()
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const cache = await caches.open(RUNTIME_CACHE)
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(installedShellNavigation(request))
    return
  }

  if (isStaticAsset(url)) event.respondWith(cacheFirstStatic(request))
})
