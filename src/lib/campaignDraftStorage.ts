import type { ParsedImportFile } from './importFiles'
import type { ImportColumnMapping } from './importMapping'
import type { PersonalizationSourceRow } from './messageComposer'
import { reportDiagnostic } from './observability'

export interface PreparedCampaignRecipients {
  importId: string
  previewId: string
  snapshotId: string
  includedRows: number
  eligibleRows: number
  suppressedRows: number
}

export interface CampaignLocalDraft {
  campaignName: string
  messageTemplate: string
  parsed: ParsedImportFile | null
  mapping: ImportColumnMapping
  evidenceReference: string
  prepared: PreparedCampaignRecipients | null
  draftId: string | null
  personalizationRows?: PersonalizationSourceRow[]
}

export interface PersistentCampaignDraft {
  draft: CampaignLocalDraft
  updatedAt: string
  revision: number
}

export interface SessionCampaignDraft {
  draft: CampaignLocalDraft
  updatedAt: string | null
  revision: number
}

export type PersistentDraftReadResult =
  | { status: 'found'; record: PersistentCampaignDraft }
  | { status: 'missing' }
  | { status: 'unavailable'; error: string }

export type PersistentDraftSaveResult =
  | { status: 'saved'; updatedAt: string; revision: number }
  | { status: 'conflict'; current: PersistentCampaignDraft | null }
  | { status: 'unavailable'; error: string }

const prefix = 'bulktext:campaign:0186:'
const databaseName = 'bulktext-offline-drafts'
const storeName = 'campaignDrafts'
const databaseVersion = 1
const persistentSchemaVersion = 1
const sessionSchemaVersion = 2
let persistentOperationQueue: Promise<unknown> = Promise.resolve()

function enqueuePersistentOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = persistentOperationQueue.then(operation, operation)
  persistentOperationQueue = result.then(() => undefined, () => undefined)
  return result
}

interface PersistentDraftRecord {
  key: string
  schemaVersion: number
  updatedAt: string
  revision?: number
  draft: CampaignLocalDraft
}

interface SessionDraftRecord {
  schemaVersion: number
  updatedAt: string | null
  revision: number
  draft: CampaignLocalDraft
}

export function campaignDraftKey(userId: string, workspaceId: string) {
  return `${prefix}${userId}:${workspaceId}`
}

function validMapping(mapping: unknown): mapping is ImportColumnMapping {
  if (!mapping || typeof mapping !== 'object') return false
  const value = mapping as Record<string, unknown>
  if (typeof value.phone !== 'string') return false
  return [value.firstName, value.lastName, value.displayName].every((item) => item === null || typeof item === 'string')
}

function validParsedFile(file: unknown): file is ParsedImportFile {
  if (!file || typeof file !== 'object') return false
  const value = file as Record<string, unknown>
  if (!Array.isArray(value.headers) || value.headers.length > 100 || !value.headers.every((header) => typeof header === 'string')) return false
  if (!Array.isArray(value.rows)) return false
  if (!value.rows.every((row) => {
    if (!row || typeof row !== 'object') return false
    const candidate = row as { sourceRowNumber?: unknown; values?: unknown }
    return Number.isInteger(candidate.sourceRowNumber)
      && Boolean(candidate.values)
      && typeof candidate.values === 'object'
      && Object.values(candidate.values as Record<string, unknown>).every((cell) => typeof cell === 'string')
  })) return false
  return typeof value.fileName === 'string'
    && typeof value.fileSha256 === 'string'
    && ['csv', 'xlsx'].includes(String(value.fileType))
    && typeof value.fileSizeBytes === 'number'
    && typeof value.sourceRowCount === 'number'
    && typeof value.truncated === 'boolean'
    && (value.sheetName === null || typeof value.sheetName === 'string')
}

function validPrepared(value: unknown): value is PreparedCampaignRecipients {
  if (!value || typeof value !== 'object') return false
  const prepared = value as Record<string, unknown>
  return typeof prepared.snapshotId === 'string'
    && typeof prepared.importId === 'string'
    && typeof prepared.previewId === 'string'
    && [prepared.includedRows, prepared.eligibleRows, prepared.suppressedRows].every((count) => Number.isInteger(count) && Number(count) >= 0)
}

function validPersonalizationRows(value: unknown): value is PersonalizationSourceRow[] {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every((row) => {
    if (!row || typeof row !== 'object') return false
    const candidate = row as Record<string, unknown>
    return Number.isInteger(candidate.eligibilityRowId)
      && Number.isInteger(candidate.previewRowId)
      && Number.isInteger(candidate.sourceRowNumber)
      && (candidate.displayName === null || typeof candidate.displayName === 'string')
      && (candidate.firstName === null || typeof candidate.firstName === 'string')
      && (candidate.lastName === null || typeof candidate.lastName === 'string')
      && typeof candidate.normalizedE164 === 'string'
      && Boolean(candidate.customFields)
      && typeof candidate.customFields === 'object'
      && !Array.isArray(candidate.customFields)
  })
}

export function validateCampaignDraft(value: unknown): CampaignLocalDraft | null {
  if (!value || typeof value !== 'object') return null
  const draft = value as Record<string, unknown>
  if (typeof draft.campaignName !== 'string' || typeof draft.messageTemplate !== 'string' || typeof draft.evidenceReference !== 'string') return null
  if (!validMapping(draft.mapping)) return null
  if (!(draft.draftId === null || typeof draft.draftId === 'string')) return null
  if (!(draft.parsed === null || validParsedFile(draft.parsed))) return null
  if (!(draft.prepared === null || validPrepared(draft.prepared))) return null
  if (!validPersonalizationRows(draft.personalizationRows)) return null
  return value as CampaignLocalDraft
}

function validRevision(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

export function campaignDraftsEqual(left: CampaignLocalDraft, right: CampaignLocalDraft) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function readCampaignDraftSession(key: string): SessionCampaignDraft | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? 'null') as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const envelope = parsed as Partial<SessionDraftRecord>
    if (envelope.schemaVersion === sessionSchemaVersion && validRevision(envelope.revision)) {
      const draft = validateCampaignDraft(envelope.draft)
      if (!draft) return null
      return {
        draft,
        revision: envelope.revision,
        updatedAt: typeof envelope.updatedAt === 'string' ? envelope.updatedAt : null,
      }
    }
    // 0.18.10 / 0.18.10-a1 stored the raw draft directly in sessionStorage.
    const legacyDraft = validateCampaignDraft(parsed)
    return legacyDraft ? { draft: legacyDraft, revision: 0, updatedAt: null } : null
  } catch {
    return null
  }
}

export function readCampaignDraft(key: string): CampaignLocalDraft | null {
  return readCampaignDraftSession(key)?.draft ?? null
}

export function writeCampaignDraft(key: string, value: CampaignLocalDraft, revision = 0, updatedAt: string | null = new Date().toISOString()): boolean {
  try {
    if (!validRevision(revision)) return false
    const record: SessionDraftRecord = { schemaVersion: sessionSchemaVersion, updatedAt, revision, draft: value }
    const json = JSON.stringify(record)
    if (json.length > 1_500_000) throw new Error('Draft exceeds tab storage budget')
    sessionStorage.setItem(key, json)
    return true
  } catch {
    // IndexedDB is the durable store. Never leave stale session data that could
    // be mistaken for a current local draft during reconciliation.
    try { sessionStorage.removeItem(key) } catch { /* storage unavailable */ }
    return false
  }
}

function openDraftDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another BulkText tab.'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (fallback: string) => {
      if (settled) return
      settled = true
      reject(transaction.error ?? new Error(fallback))
    }
    transaction.oncomplete = () => {
      if (settled) return
      settled = true
      resolve()
    }
    transaction.onabort = () => fail('IndexedDB transaction was aborted.')
    transaction.onerror = () => fail('IndexedDB transaction failed.')
  })
}

function parsePersistentRecord(value: unknown): PersistentCampaignDraft | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<PersistentDraftRecord>
  if (record.schemaVersion !== persistentSchemaVersion || typeof record.updatedAt !== 'string') return null
  const draft = validateCampaignDraft(record.draft)
  if (!draft) return null
  // 0.18.10 / a1 records had no revision. Treat that durable baseline as revision 0.
  const revision = record.revision === undefined ? 0 : record.revision
  if (!validRevision(revision)) return null
  return { draft, updatedAt: record.updatedAt, revision }
}

async function readCampaignDraftPersistentNow(key: string): Promise<PersistentDraftReadResult> {
  let database: IDBDatabase | null = null
  try {
    database = await openDraftDatabase()
    if (!database) return { status: 'unavailable', error: 'IndexedDB is unavailable in this browser.' }
    const transaction = database.transaction(storeName, 'readonly')
    const completion = transactionComplete(transaction)
    const raw = await requestResult(transaction.objectStore(storeName).get(key)) as PersistentDraftRecord | undefined
    await completion
    if (!raw) return { status: 'missing' }
    const record = parsePersistentRecord(raw)
    if (!record) return { status: 'unavailable', error: 'The saved device draft is invalid or uses an unsupported format.' }
    return { status: 'found', record }
  } catch (reason) {
    reportDiagnostic(reason, { source: 'handled-error', category: 'internal', severity: 'error' })
    return { status: 'unavailable', error: 'IndexedDB could not be read.' }
  } finally {
    database?.close()
  }
}

export function readCampaignDraftPersistentResult(key: string): Promise<PersistentDraftReadResult> {
  return enqueuePersistentOperation(() => readCampaignDraftPersistentNow(key))
}

export async function readCampaignDraftPersistent(key: string): Promise<PersistentCampaignDraft | null> {
  const result = await readCampaignDraftPersistentResult(key)
  return result.status === 'found' ? result.record : null
}

// Device-quota guard only: 0.20.4 intentionally has no fixed import-row or
// file-size product ceiling. When the Storage API is available, keep enough
// headroom so one unusually large local draft cannot exhaust the browser's
// origin quota. Browsers without quota estimates fall back to IndexedDB's own
// recoverable quota error.
async function persistentJsonBudget(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    const quota = estimate?.quota
    const usage = estimate?.usage ?? 0
    if (!quota || quota <= usage) return null
    return Math.floor((quota - usage) * 0.5)
  } catch {
    return null
  }
}

async function saveCampaignDraftPersistentNow(key: string, draft: CampaignLocalDraft, expectedRevision: number): Promise<PersistentDraftSaveResult> {
  let database: IDBDatabase | null = null
  try {
    if (!validateCampaignDraft(draft) || !validRevision(expectedRevision)) return { status: 'unavailable', error: 'The local campaign draft is invalid.' }
    const json = JSON.stringify(draft)
    const storageBudget = await persistentJsonBudget()
    if (storageBudget !== null && new Blob([json]).size > storageBudget) {
      return { status: 'unavailable', error: 'This device does not have enough local storage for the current offline draft.' }
    }
    // JSON cloning normalizes null-prototype import row objects before structured clone.
    const normalized = JSON.parse(json) as CampaignLocalDraft
    database = await openDraftDatabase()
    if (!database) return { status: 'unavailable', error: 'IndexedDB is unavailable in this browser.' }

    const transaction = database.transaction(storeName, 'readwrite')
    const completion = transactionComplete(transaction)
    const store = transaction.objectStore(storeName)
    type OperationResult =
      | { kind: 'saved'; updatedAt: string; revision: number }
      | { kind: 'conflict'; current: PersistentCampaignDraft | null }
      | { kind: 'invalid' }

    // Keep the compare-and-swap read and put in the same IndexedDB request
    // callback/task. This avoids transaction auto-close gaps in stricter
    // browsers while preserving atomic revision checking across tabs.
    const operation = new Promise<OperationResult>((resolve, reject) => {
      const getRequest = store.get(key)
      getRequest.onerror = () => reject(getRequest.error ?? new Error('IndexedDB request failed.'))
      getRequest.onsuccess = () => {
        const raw = getRequest.result as PersistentDraftRecord | undefined
        const current = raw ? parsePersistentRecord(raw) : null
        if (raw && !current) {
          resolve({ kind: 'invalid' })
          try { transaction.abort() } catch { /* transaction may already be closing */ }
          return
        }

        const currentRevision = current?.revision ?? 0
        if (currentRevision !== expectedRevision) {
          resolve({ kind: 'conflict', current })
          return
        }

        const updatedAt = new Date().toISOString()
        const revision = currentRevision + 1
        const putRequest = store.put({
          key,
          schemaVersion: persistentSchemaVersion,
          updatedAt,
          revision,
          draft: normalized,
        } satisfies PersistentDraftRecord)
        putRequest.onerror = () => reject(putRequest.error ?? new Error('IndexedDB request failed.'))
        putRequest.onsuccess = () => resolve({ kind: 'saved', updatedAt, revision })
      }
    })

    const [result] = await Promise.all([operation, completion])
    if (result.kind === 'saved') return { status: 'saved', updatedAt: result.updatedAt, revision: result.revision }
    if (result.kind === 'conflict') return { status: 'conflict', current: result.current }
    return { status: 'unavailable', error: 'The saved device draft is invalid or uses an unsupported format.' }
  } catch (reason) {
    reportDiagnostic(reason, { source: 'handled-error', category: 'internal', severity: 'error' })
    return { status: 'unavailable', error: 'IndexedDB could not save the draft.' }
  } finally {
    database?.close()
  }
}

export function saveCampaignDraftPersistent(key: string, draft: CampaignLocalDraft, expectedRevision: number): Promise<PersistentDraftSaveResult> {
  return enqueuePersistentOperation(() => saveCampaignDraftPersistentNow(key, draft, expectedRevision))
}

// Compatibility helper for older call sites/tests. It still uses a CAS write;
// callers that need conflict UI should use saveCampaignDraftPersistent directly.
export function writeCampaignDraftPersistent(key: string, draft: CampaignLocalDraft): Promise<string | null> {
  return enqueuePersistentOperation(async () => {
    const current = await readCampaignDraftPersistentNow(key)
    if (current.status === 'unavailable') return null
    const expectedRevision = current.status === 'found' ? current.record.revision : 0
    const result = await saveCampaignDraftPersistentNow(key, draft, expectedRevision)
    return result.status === 'saved' ? result.updatedAt : null
  })
}

async function removeCampaignDraftPersistentNow(key: string): Promise<boolean> {
  let database: IDBDatabase | null = null
  try {
    database = await openDraftDatabase()
    if (!database) return false
    const transaction = database.transaction(storeName, 'readwrite')
    const completion = transactionComplete(transaction)
    await requestResult(transaction.objectStore(storeName).delete(key))
    await completion
    return true
  } catch {
    return false
  } finally {
    database?.close()
  }
}

async function clearPersistentCampaignDraftsNow(): Promise<boolean> {
  let database: IDBDatabase | null = null
  try {
    database = await openDraftDatabase()
    if (!database) return false
    const transaction = database.transaction(storeName, 'readwrite')
    const completion = transactionComplete(transaction)
    await requestResult(transaction.objectStore(storeName).clear())
    await completion
    return true
  } catch {
    return false
  } finally {
    database?.close()
  }
}

function removeCampaignDraftPersistent(key: string) {
  return enqueuePersistentOperation(() => removeCampaignDraftPersistentNow(key))
}

function clearPersistentCampaignDrafts() {
  return enqueuePersistentOperation(() => clearPersistentCampaignDraftsNow())
}

export async function removeCampaignDraft(key: string): Promise<boolean> {
  try { sessionStorage.removeItem(key) } catch { /* storage unavailable */ }
  return removeCampaignDraftPersistent(key)
}

export async function clearCampaignDrafts(): Promise<boolean> {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key)
  } catch { /* storage unavailable */ }
  return clearPersistentCampaignDrafts()
}
