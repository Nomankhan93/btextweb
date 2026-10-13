import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [pkgText, storage, campaign, workspace, requireWorkspace, locator, auth, serviceWorker, css, delivery] = await Promise.all([
  read('package.json'),
  read('src/lib/campaignDraftStorage.ts'),
  read('src/pages/SimpleCampaignPage.tsx'),
  read('src/workspace/WorkspaceProvider.tsx'),
  read('src/workspace/RequireWorkspace.tsx'),
  read('src/lib/offlineWorkspaceLocator.ts'),
  read('src/auth/AuthProvider.tsx'),
  read('public/service-worker.js'),
  read('src/styles/app.css'),
  read('src/lib/deliveryContract.ts'),
])
const pkg = JSON.parse(pkgText)
let assertions = 0
function check(condition, message) { assert.ok(condition, message); assertions += 1 }

check(pkg.version === '0.20.4', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(pkg.scripts?.['test:offline-reliability-01810r1']?.includes('offlineWorkspaceColdStart01810r1.test.tsx'), 'r1 targeted reliability test suite must exist')
check(pkg.scripts?.['test:pwa-shell-01810r1'] === 'node scripts/test-pwa-shell01810r1.mjs', 'service-worker integrity regression script must exist')

check(storage.includes('revision?: number'), 'persistent records must carry a revision')
check(storage.includes('sessionSchemaVersion = 2'), 'session drafts must use a revisioned envelope')
check(storage.includes('readCampaignDraftSession'), 'session draft reconciliation reader must exist')
check(storage.includes('readCampaignDraftPersistentResult'), 'typed persistent read result must distinguish unavailable from missing')
check(storage.includes("status: 'unavailable'"), 'persistent storage unavailability must be explicit')
check(storage.includes('transactionComplete(transaction)'), 'IndexedDB transaction completion must be awaited')
check(storage.includes('transaction.oncomplete'), 'transaction completion event must be observed')
check(storage.includes('transaction.onabort'), 'transaction abort event must be observed')
check(storage.includes('transaction.onerror'), 'transaction error event must be observed')
check(storage.includes('await completion'), 'request success alone must not report a durable save')
check(storage.includes('saveCampaignDraftPersistent'), 'revision-aware persistent save must exist')
check(storage.includes('currentRevision !== expectedRevision'), 'stale revisions must be rejected')
check(storage.includes("status: 'conflict'"), 'stale revision must produce an explicit conflict')
check(storage.includes('return removeCampaignDraftPersistent(key)'), 'discard must await persistent deletion')
check(storage.includes('return clearPersistentCampaignDrafts()'), 'sign-out cleanup must await persistent clear')
check(storage.includes('enqueuePersistentOperation'), 'same-context reads/writes/cleanup must remain serialized')

check(campaign.includes('readCampaignDraftPersistentResult(storageKey)'), 'campaign hydration must always inspect durable storage')
check(!campaign.includes('if (sessionRestored) return'), 'session draft must not bypass durable reconciliation')
check(campaign.includes("session.revision === persistent.revision && session.updatedAt !== null"), 'same-base session edits must be distinguished from stale legacy sessions')
check(campaign.includes('setDraftConflict({ current: persistent })'), 'startup conflict must be represented in UI state')
check(campaign.includes('Use saved device version'), 'conflict UI must allow restoring the saved device version')
check(campaign.includes('Keep this tab version'), 'conflict UI must require an explicit choice before replacing a newer version')
check(campaign.includes('persistenceEnabled.current = true'), 'StrictMode effect setup must re-enable persistence')
check(campaign.includes("return () => { persistenceEnabled.current = false }"), 'StrictMode effect cleanup must be symmetric')
check(campaign.includes('Checking saved device draft…'), 'editing must be gated while initial reconciliation runs')
check(campaign.includes("localSaveState === 'conflict'"), 'beforeunload protection must include unresolved conflicts')
check(campaign.includes('const removed = await removeCampaignDraft(storageKey)'), 'discard must await durable deletion before navigation')
check(campaign.includes('serverAuthorized = authority === \'server\''), 'server authority must be explicit')
check(campaign.includes('online && serverAuthorized && workspace && parsed'), 'recipient preparation must require verified server authority')
check(campaign.includes('online && serverAuthorized && !restoring'), 'review must require verified server authority')
check(campaign.includes('Local draft access only.'), 'local-only workspace state must be visible')
check(campaign.includes('does not authorize recipient preparation, review, devices or sending'), 'local/server authorization boundary must be explained')
check(campaign.includes('writeCampaignDraft(storageKey, finalLocalDraft, expectedRevision)'), 'server-saved review draft must be preserved synchronously in tab storage')
check(campaign.includes('void saveQueue.current.then(async () =>'), 'durable device sync after server save must be best-effort and non-blocking')
check(campaign.includes("}).catch(() => { /* server draft remains authoritative; local sync is best-effort */ })\n      navigate(`/campaigns/review/${savedId}`)"), 'review navigation must proceed without awaiting IndexedDB durable-save completion')

check(locator.includes("locatorPrefix = 'bulktext:workspace-locator:01810r1:'"), 'workspace locator must use an r1 account-scoped key namespace')
check(locator.includes('localStorage.getItem(key(userId))'), 'workspace locator lookup must be scoped by current user id')
check(locator.includes('workspaceId'), 'cached locator must contain only workspace identity metadata')
check(!locator.includes('token') && !locator.includes('permission') && !locator.includes('role'), 'cached locator must not persist authorization material')
check(workspace.includes("authority: 'server'"), 'server verified workspace authority must be represented')
check(workspace.includes("cached ? 'local' : null"), 'cached locator must be marked local-only')
check(workspace.includes('writeOfflineWorkspaceLocator'), 'successful server verification must refresh the local locator')
check(requireWorkspace.includes("localDraftRoute = location.pathname === '/campaigns/new'"), 'local authority must be restricted to the campaign draft route')
check(requireWorkspace.includes('Offline local-draft access only'), 'non-draft routes must be blocked when only local authority exists')
check(auth.includes('await clearCampaignDrafts()'), 'explicit sign-out must await local draft cleanup')
check(auth.includes('clearOfflineWorkspaceLocators()'), 'sign-out must clear cached workspace locators')

check(serviceWorker.includes("const VERSION = '0.20.4'"), 'service worker cache version must match r1')
check(serviceWorker.includes('requiredResponse(url)'), 'precache assets must pass a required-response gate')
check(serviceWorker.includes('if (!response.ok) throw new Error'), 'non-success required assets must fail installation')
check(serviceWorker.includes('Fetch and validate the complete build before mutating'), 'shell cache mutation must happen only after complete validation')
check(!serviceWorker.includes('await cache.put(APP_SHELL, response.clone())'), 'network navigation must not replace installed shell HTML')
check(serviceWorker.includes("if (request.method !== 'GET') return"), 'service worker must not replay mutation requests')
check(!serviceWorker.includes("addEventListener('sync'"), 'service worker must not introduce background send replay')

check(css.includes('/* 0.18.10-a1 — Phone & SIM mobile containment */'), '0.18.10-a1 Phone & SIM correction must be preserved')
check(delivery.includes('UNKNOWN') || delivery.includes('unknown'), 'delivery UNKNOWN safety contract must remain present')

console.log(`Web 0.20.3 Offline Draft & PWA Reliability source contract: PASS (${assertions} assertions)`)
