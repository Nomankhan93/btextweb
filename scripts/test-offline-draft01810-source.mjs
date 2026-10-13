import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [pkgText, storage, campaign, auth, serviceWorker, pwa, delivery, durableQueue] = await Promise.all([
  read('package.json'),
  read('src/lib/campaignDraftStorage.ts'),
  read('src/pages/SimpleCampaignPage.tsx'),
  read('src/auth/AuthProvider.tsx'),
  read('public/service-worker.js'),
  read('src/pwa/PwaProvider.tsx'),
  read('src/lib/deliveryContract.ts'),
  read('src/lib/durableQueue.ts'),
])
const pkg = JSON.parse(pkgText)
let assertions = 0
function check(condition, message) { assert.ok(condition, message); assertions += 1 }

check(pkg.version === '0.20.3', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(pkg.scripts?.['test:offline-draft-01810']?.includes('offlineDraftStorage01810.test.ts'), 'targeted offline draft test script must exist')
check(pkg.scripts?.['test:offline-draft-source-01810'] === 'node scripts/test-offline-draft01810-source.mjs', 'offline draft source contract script must exist')

check(storage.includes("const databaseName = 'bulktext-offline-drafts'"), 'IndexedDB database must be explicit')
check(storage.includes("const storeName = 'campaignDrafts'"), 'IndexedDB object store must be explicit')
check(storage.includes('indexedDB.open(databaseName, databaseVersion)'), 'persistent storage must use IndexedDB')
check(storage.includes('writeCampaignDraftPersistent'), 'durable draft writer must exist')
check(storage.includes('readCampaignDraftPersistent'), 'durable draft reader must exist')
check(storage.includes('personalizationRows?: PersonalizationSourceRow[]'), 'prepared personalization rows must be locally recoverable')
check(campaign.includes('setConsentConfirmed(Boolean(draft.prepared))'), 'unprepared local drafts must require consent reconfirmation after restore')
check(storage.includes("return `${prefix}${userId}:${workspaceId}`"), 'draft key must remain user/workspace scoped')
check(storage.includes('return clearPersistentCampaignDrafts()'), 'sign-out cleanup path must await persistent drafts')
check(storage.includes('return removeCampaignDraftPersistent(key)'), 'discard/confirmation cleanup must await persistent draft')
check(storage.includes('persistentJsonBudget'), 'durable storage must keep a local size guard')
check(storage.includes('enqueuePersistentOperation'), 'persistent writes and cleanup must be serialized to prevent discarded drafts from reappearing')

check(campaign.includes("const { online } = usePwa()"), 'campaign workspace must consume live online state')
check(campaign.includes('readCampaignDraftPersistentResult(storageKey)'), 'campaign workspace must hydrate from typed IndexedDB result')
check(campaign.includes('saveCampaignDraftPersistent(storageKey, value, revision.current)'), 'campaign workspace must persist edits with revision protection')
check(campaign.includes('Offline draft mode.'), 'offline draft mode must be visible')
check(campaign.includes("if (!online) { setError('Reconnect to prepare recipients."), 'recipient preparation must be network gated')
check(campaign.includes("if (!online) { setError('Reconnect to save this draft to your account"), 'server review save must be network gated')
check(campaign.includes('online && serverAuthorized && workspace && parsed'), 'prepare CTA must require online server authorization')
check(campaign.includes('online && serverAuthorized && !restoring && !restoreFailed && prepared'), 'review CTA must require online server authorization')
check(campaign.includes('getMessagePersonalizationSourceRows(workspace.id, prepared.snapshotId)'), 'prepared recipient details must reconcile after reconnect')
check(campaign.includes('Local message edits are not sent to the server until you choose Review campaign.'), 'local/server boundary must be explained')
check(campaign.includes('Discard draft'), 'local draft discard control must remain visible')

check(auth.includes('clearAccountScopedState') && auth.includes('await clearCampaignDrafts()'), 'auth sign-out cleanup must remain wired through the account boundary')
check(serviceWorker.includes("const VERSION = '0.20.3'"), 'PWA cache version must be 0.20.3')
check(!serviceWorker.includes('sync.add') && !serviceWorker.includes("addEventListener('sync'"), 'service worker must not add background send/sync replay')
check(serviceWorker.includes('if (request.method !== \'GET\') return'), 'service worker must still ignore mutation requests')
check(pwa.includes('Draft editing can continue') || pwa.includes('setOnline'), 'PWA online/offline foundation must remain present')
check(delivery.includes('UNKNOWN') || delivery.includes('unknown'), 'delivery contract implementation must remain present')
check(durableQueue.length > 100, 'durable queue implementation must remain present')

console.log(`Web 0.18.10 advanced offline draft source contract: PASS (${assertions} assertions)`)
