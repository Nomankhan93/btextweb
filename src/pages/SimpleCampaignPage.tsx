import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ActionDialog } from '../components/ActionDialog'
import { errorMessage } from '../lib/errors'
import { parseSpreadsheetFile, type ParsedImportFile } from '../lib/importFiles'
import {
  buildImportPreview,
  detectSmartImportMapping,
  type ImportColumnMapping,
  type SmartImportDetection,
} from '../lib/importMapping'
import { createContactImport } from '../lib/importsApi'
import { createRecipientPreview, listImportValidationRows } from '../lib/recipientPreviewApi'
import { defaultRecipientSelection } from '../lib/recipientPreview'
import {
  createRecipientEligibilitySnapshot,
  getRecipientEligibilitySnapshotRows,
  recordRecipientPreviewBulkConsent,
} from '../lib/consentSuppressionApi'
import { getMessagePersonalizationSourceRows, saveMessageComposerDraft } from '../lib/messageComposerApi'
import { analyzeMessageTemplate, availablePersonalizationTokens } from '../lib/messageComposer'
import { estimatePersonalizedSmsUsage } from '../lib/smsSegments'
import { maskRecipientNumber } from '../lib/recipientDisplay'
import { useWorkspace } from '../workspace/WorkspaceProvider'

import { useAuth } from '../auth/AuthProvider'
import { campaignDraftKey, campaignDraftsEqual, readCampaignDraftPersistentResult, readCampaignDraftSession, removeCampaignDraft, saveCampaignDraftPersistent, writeCampaignDraft, type CampaignLocalDraft, type PersistentCampaignDraft, type PreparedCampaignRecipients } from '../lib/campaignDraftStorage'
import { useOperationGuard } from '../lib/useOperationGuard'
import { usePwa } from '../pwa/PwaProvider'

const emptyMapping: ImportColumnMapping = { phone: '', firstName: null, lastName: null, displayName: null }

type WizardStep = 1 | 2 | 3

function wizardStepForDraft(draft: CampaignLocalDraft | null): WizardStep {
  if (!draft?.campaignName.trim()) return 1
  if (draft.prepared) return 3
  if (draft.parsed) return 2
  return 1
}

function optionalHeader(value: string): string | null {
  return value || null
}

function localTimeLabel(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function SimpleCampaignPage() {
  const { user } = useAuth()
  const { workspace } = useWorkspace()
  if (!user || !workspace) return null
  const storageKey = campaignDraftKey(user.id, workspace.id)
  return <CampaignForm key={storageKey} storageKey={storageKey} />
}

function CampaignForm({ storageKey }: { storageKey: string }) {
  const { workspace, authority, loading: workspaceLoading, error: workspaceError, refresh: refreshWorkspace } = useWorkspace()
  const { online } = usePwa()
  const serverAuthorized = authority === 'server'
  const navigate = useNavigate()
  const [sessionRestored] = useState(() => readCampaignDraftSession(storageKey))
  const initialDraft = sessionRestored?.draft ?? null
  const [wizardStep, setWizardStep] = useState<WizardStep>(() => wizardStepForDraft(initialDraft))
  const operation = useOperationGuard()
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const saveGeneration = useRef(0)
  const revision = useRef(sessionRestored?.revision ?? 0)
  const persistenceEnabled = useRef(true)
  const skipNextAutosave = useRef(false)
  const [localHydrated, setLocalHydrated] = useState(false)
  const [localSaveState, setLocalSaveState] = useState<'loading' | 'saving' | 'saved' | 'failed' | 'conflict'>('loading')
  const [localSavedAt, setLocalSavedAt] = useState<string | null>(sessionRestored?.updatedAt ?? null)
  const [draftConflict, setDraftConflict] = useState<{ current: PersistentCampaignDraft | null } | null>(null)
  const [reconciledAt, setReconciledAt] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.draftId ?? null)
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const [restoreFailed, setRestoreFailed] = useState(false)
  const [restoring, setRestoring] = useState(Boolean(initialDraft?.prepared && online && serverAuthorized))
  const preparation = useRef<{ signature: string; importId?: string; previewId?: string; snapshotId?: string; grants?: number }>({ signature: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const stepRef = useRef<HTMLElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [campaignName, setCampaignName] = useState(initialDraft?.campaignName ?? '')
  const [parsed, setParsed] = useState<ParsedImportFile | null>(initialDraft?.parsed ?? null)
  const [detection, setDetection] = useState<SmartImportDetection | null>(() => initialDraft?.parsed ? detectSmartImportMapping(initialDraft.parsed) : null)
  const [mapping, setMapping] = useState<ImportColumnMapping>(initialDraft?.mapping ?? emptyMapping)
  const [consentConfirmed, setConsentConfirmed] = useState(Boolean(initialDraft?.prepared))
  const [evidenceReference, setEvidenceReference] = useState(initialDraft?.evidenceReference ?? '')
  const [prepared, setPrepared] = useState<PreparedCampaignRecipients | null>(initialDraft?.prepared ?? null)
  const [messageTemplate, setMessageTemplate] = useState(initialDraft?.messageTemplate ?? '')
  const [personalizationRows, setPersonalizationRows] = useState<Awaited<ReturnType<typeof getMessagePersonalizationSourceRows>>>(initialDraft?.personalizationRows ?? [])
  const [busy, setBusy] = useState(false)
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [workProgress, setWorkProgress] = useState<{ label: string; completed: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(sessionRestored ? 'Checking this tab draft against the durable device copy before editing.' : null)

  useEffect(() => () => abortRef.current?.abort(), [])

  function cancelCurrentWork() {
    abortRef.current?.abort()
  }

  function localDraftValue(): CampaignLocalDraft {
    return {
      campaignName,
      parsed,
      mapping,
      evidenceReference,
      prepared,
      personalizationRows,
      messageTemplate,
      draftId,
    }
  }

  function applyLocalDraft(draft: CampaignLocalDraft) {
    setCampaignName(draft.campaignName)
    setParsed(draft.parsed)
    setDetection(draft.parsed ? detectSmartImportMapping(draft.parsed) : null)
    setMapping(draft.mapping)
    setConsentConfirmed(Boolean(draft.prepared))
    setEvidenceReference(draft.evidenceReference)
    setPrepared(draft.prepared)
    setMessageTemplate(draft.messageTemplate)
    setPersonalizationRows(draft.personalizationRows ?? [])
    setDraftId(draft.draftId)
    setWizardStep(wizardStepForDraft(draft))
  }

  useEffect(() => {
    let cancelled = false
    setLocalSaveState('loading')
    void readCampaignDraftPersistentResult(storageKey).then((result) => {
      if (cancelled) return
      const session = sessionRestored

      if (result.status === 'unavailable') {
        if (session) {
          applyLocalDraft(session.draft)
          revision.current = session.revision
          setLocalSavedAt(session.updatedAt)
          setNotice('Recovered the tab copy, but durable device storage could not be checked. BulkText will not silently replace an unknown saved device version.')
        }
        setLocalSaveState('failed')
        setLocalHydrated(true)
        return
      }

      if (result.status === 'missing') {
        if (session) {
          applyLocalDraft(session.draft)
          revision.current = session.revision
          setLocalSavedAt(session.updatedAt)
          setNotice('Recovered unsaved work from this browser tab. It will be committed to durable device storage before it is reported as saved.')
        } else {
          revision.current = 0
          setNotice(null)
        }
        setLocalSaveState('saving')
        setLocalHydrated(true)
        return
      }

      const persistent = result.record
      if (!session || campaignDraftsEqual(session.draft, persistent.draft)) {
        applyLocalDraft(persistent.draft)
        revision.current = persistent.revision
        setLocalSavedAt(persistent.updatedAt)
        writeCampaignDraft(storageKey, persistent.draft, persistent.revision, persistent.updatedAt)
        skipNextAutosave.current = true
        setLocalSaveState('saved')
        setNotice(session ? 'Reconciled this tab with the saved device draft.' : 'Recovered your campaign from this device. Reconnect before recipient preparation, review or sending.')
      } else if (session.revision === persistent.revision && session.updatedAt !== null) {
        // Same durable base revision: the session copy contains unsaved same-tab edits.
        applyLocalDraft(session.draft)
        revision.current = persistent.revision
        setLocalSavedAt(persistent.updatedAt)
        setLocalSaveState('saving')
        setNotice('Recovered unsaved edits from this browser tab. They will save only if the durable device revision is still current.')
      } else {
        // A different tab/device-local context advanced the durable revision.
        applyLocalDraft(session.draft)
        revision.current = session.revision
        setLocalSavedAt(persistent.updatedAt)
        setDraftConflict({ current: persistent })
        setLocalSaveState('conflict')
        setNotice('A newer saved device draft exists. Choose which copy to keep; BulkText will not overwrite it automatically.')
      }
      setLocalHydrated(true)
    })
    return () => { cancelled = true }
  // CampaignForm remounts when the account/workspace storage key changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  useEffect(() => {
    persistenceEnabled.current = true
    return () => { persistenceEnabled.current = false }
  }, [])

  useEffect(() => {
    if (!localHydrated || !persistenceEnabled.current || draftConflict) return
    const value = localDraftValue()
    // Same-tab recovery is synchronous; the revision records which durable
    // version these edits were based on so a stale tab cannot silently win.
    writeCampaignDraft(storageKey, value, revision.current)
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false
      return
    }
    const generation = ++saveGeneration.current
    setLocalSaveState('saving')
    const timer = window.setTimeout(() => {
      if (!persistenceEnabled.current) return
      saveQueue.current = saveQueue.current.then(async () => {
        if (!persistenceEnabled.current || generation !== saveGeneration.current) return
        const result = await saveCampaignDraftPersistent(storageKey, value, revision.current)
        if (!persistenceEnabled.current || generation !== saveGeneration.current) return
        if (result.status === 'saved') {
          revision.current = result.revision
          writeCampaignDraft(storageKey, value, result.revision, result.updatedAt)
          setLocalSavedAt(result.updatedAt)
          setLocalSaveState('saved')
          return
        }
        if (result.status === 'conflict') {
          setDraftConflict({ current: result.current })
          setLocalSaveState('conflict')
          setNotice('Another tab changed this device draft first. Choose the saved device version or explicitly keep this tab copy.')
          return
        }
        setLocalSaveState('failed')
      })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [localHydrated, storageKey, campaignName, parsed, mapping, evidenceReference, prepared, personalizationRows, messageTemplate, draftId, draftConflict])

  useEffect(() => {
    if (!localHydrated || !prepared || !workspace || !serverAuthorized) return
    if (!online) {
      setRestoring(false)
      setRestoreFailed(false)
      return
    }
    let cancelled = false
    setRestoring(true)
    setRestoreFailed(false)
    void getMessagePersonalizationSourceRows(workspace.id, prepared.snapshotId)
      .then((rows) => {
        if (cancelled) return
        setPersonalizationRows(rows)
        setReconciledAt(new Date().toISOString())
      })
      .catch((reason) => {
        if (cancelled) return
        setRestoreFailed(true)
        if (personalizationRows.length === 0) setError(errorMessage(reason, 'Could not refresh prepared recipients. Retry when you are online.'))
      })
      .finally(() => { if (!cancelled) setRestoring(false) })
    return () => { cancelled = true }
  // Re-run after reconnect, server workspace verification or an explicit retry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localHydrated, prepared?.snapshotId, workspace?.id, online, restoreAttempt, serverAuthorized])

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (busy || localSaveState === 'saving' || localSaveState === 'conflict' || (localSaveState === 'failed' && (campaignName || messageTemplate || parsed))) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy, localSaveState, campaignName, messageTemplate, parsed])

  async function discard() {
    if (discarding) return
    const value = localDraftValue()
    setDiscarding(true)
    persistenceEnabled.current = false
    saveGeneration.current += 1
    await saveQueue.current
    const removed = await removeCampaignDraft(storageKey)
    if (!removed) {
      persistenceEnabled.current = true
      writeCampaignDraft(storageKey, value, revision.current)
      setLocalSaveState('failed')
      setDiscardDialogOpen(false)
      setDiscarding(false)
      setError('Could not confirm durable device-draft deletion. The draft was not treated as discarded; keep this page open and try again.')
      return
    }
    navigate('/campaigns')
  }

  async function useSavedDeviceVersion() {
    const current = draftConflict?.current
    if (!draftConflict) return
    if (!current) {
      const removed = await removeCampaignDraft(storageKey)
      if (removed) navigate('/campaigns')
      else setError('Could not confirm local draft deletion. Try again before leaving this page.')
      return
    }
    skipNextAutosave.current = true
    applyLocalDraft(current.draft)
    revision.current = current.revision
    writeCampaignDraft(storageKey, current.draft, current.revision, current.updatedAt)
    setLocalSavedAt(current.updatedAt)
    setDraftConflict(null)
    setLocalSaveState('saved')
    setNotice('Using the newer saved device version. The stale tab copy was not written.')
  }

  async function keepThisTabVersion() {
    if (!draftConflict) return
    const value = localDraftValue()
    setLocalSaveState('saving')
    const expectedRevision = draftConflict.current?.revision ?? 0
    const result = await saveCampaignDraftPersistent(storageKey, value, expectedRevision)
    if (result.status === 'saved') {
      revision.current = result.revision
      writeCampaignDraft(storageKey, value, result.revision, result.updatedAt)
      setLocalSavedAt(result.updatedAt)
      skipNextAutosave.current = true
      setDraftConflict(null)
      setLocalSaveState('saved')
      setNotice('This tab copy was explicitly saved as the newest device draft.')
      return
    }
    if (result.status === 'conflict') {
      setDraftConflict({ current: result.current })
      setLocalSaveState('conflict')
      setNotice('The saved device draft changed again before your choice committed. Review the conflict again.')
      return
    }
    setLocalSaveState('failed')
    setError('Could not commit this tab copy to durable device storage. No saved device version was overwritten.')
  }

  function changeRecipients() {
    preparation.current = { signature: '' }
    setPrepared(null); setPersonalizationRows([]); setDraftId(null); setConsentConfirmed(false)
    setWizardStep(2)
    setNotice('Choose or remap your recipient list, then confirm consent again. Your message is preserved.')
    if (fileRef.current) fileRef.current.value = ''
  }

  const preview = useMemo(() => parsed ? buildImportPreview(parsed, mapping) : null, [parsed, mapping])
  const uniqueReady = preview ? Math.max(0, preview.summary.validPhoneRows - preview.summary.duplicatePhoneRows) : 0
  const templateAnalysis = useMemo(() => analyzeMessageTemplate(messageTemplate), [messageTemplate])
  const usage = useMemo(() => estimatePersonalizedSmsUsage(messageTemplate, personalizationRows), [messageTemplate, personalizationRows])
  const personalizationTokens = useMemo(() => availablePersonalizationTokens(personalizationRows), [personalizationRows])
  const messageCharacters = useMemo(() => Array.from(messageTemplate).length, [messageTemplate])
  const segmentSummary = usage.readyRecipients === 0
    ? '—'
    : usage.minimumSegments === usage.maximumSegments
      ? `${usage.maximumSegments} segment${usage.maximumSegments === 1 ? '' : 's'} each`
      : `${usage.minimumSegments}–${usage.maximumSegments} segments per recipient`
  useEffect(() => {
    if (!localHydrated) return
    stepRef.current?.focus({ preventScroll: true })
    stepRef.current?.scrollIntoView?.({ block: "start" })
  }, [wizardStep, localHydrated])
  const canPrepare = Boolean(
    online && serverAuthorized && workspace && parsed && mapping.phone && uniqueReady > 0 && consentConfirmed && campaignName.trim(),
  )
  const canReview = Boolean(
    online && serverAuthorized && !restoring && !restoreFailed && prepared && campaignName.trim() && messageTemplate.trim() && !templateAnalysis.malformed && templateAnalysis.unsupportedTokens.length === 0 && usage.readyRecipients > 0 && usage.blockedRecipients === 0,
  )

  if (!localHydrated) {
    return <div className="page-stack simple-campaign-page"><div className="campaign-wizard-mobile-header" aria-label="Campaign creation navigation"><Link className="campaign-wizard-back" to="/campaigns">← Campaigns</Link><strong>New campaign</strong><span /></div><section className="panel" role="status"><p className="eyebrow">New campaign</p><h1>Checking saved device draft…</h1><p>BulkText is reconciling this tab with durable browser storage before editing is enabled.</p></section></div>
  }

  function insertPersonalizationToken(token: string) {
    const insertion = `{{${token}}}`
    const textarea = messageRef.current
    const start = textarea?.selectionStart ?? messageTemplate.length
    const end = textarea?.selectionEnd ?? start
    const next = `${messageTemplate.slice(0, start)}${insertion}${messageTemplate.slice(end)}`
    setMessageTemplate(next)
    const caret = start + insertion.length
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(caret, caret)
    })
  }

  async function selectFile(file: File | null) {
    if (!file || !operation.start()) return
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setNotice(null)
    setBusy(true)
    setWorkProgress({ label: 'Reading file…', completed: 0, total: Math.max(file.size, 1) })
    try {
      const next = await parseSpreadsheetFile(file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!operation.active.current) return
          const label = progress.phase === 'reading' ? 'Reading file…' : progress.phase === 'hashing' ? 'Checking file…' : 'Reading spreadsheet…'
          setWorkProgress({ label, completed: progress.loadedBytes, total: Math.max(progress.totalBytes, 1) })
        },
      })
      operation.check()
      preparation.current = { signature: '' }
      setPrepared(null); setDraftId(null); setPersonalizationRows([]); setConsentConfirmed(false)
      const smart = detectSmartImportMapping(next)
      setParsed(next)
      setDetection(smart)
      setMapping(smart.mapping)
      setEvidenceReference('')
    } catch (reason) {
      if (!operation.active.current) return
      if (reason instanceof Error && reason.name === 'AbortError') setNotice('File processing was cancelled.')
      else setError(errorMessage(reason, 'Could not read the recipient file.'))
      if (fileRef.current) fileRef.current.value = ''
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setWorkProgress(null)
      operation.finish()
      if (operation.active.current) setBusy(false)
    }
  }

  async function prepareRecipients() {
    if (!online) { setError('Reconnect to prepare recipients. Imports and edits can stay local while offline.'); return }
    if (!serverAuthorized) { setError('Verify this workspace with the server before preparing recipients. Local draft access never grants send authorization.'); return }
    if (!workspace || !parsed || !preview || !canPrepare || !operation.start()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const signature = JSON.stringify([parsed.fileSha256, mapping, campaignName, evidenceReference])
      if (preparation.current.signature !== signature) preparation.current = { signature }
      const progress = preparation.current
      let importId = progress.importId
      if (!importId) {
        const controller = new AbortController()
        abortRef.current = controller
        setWorkProgress({ label: 'Starting recipient import…', completed: 0, total: Math.max(preview.rows.length, 1) })
        try {
          importId = await createContactImport(workspace.id, parsed, mapping, preview.rows, {
            signal: controller.signal,
            onProgress: (state) => {
              if (!operation.active.current) return
              const label = state.phase === 'starting' ? 'Starting recipient import…' : state.phase === 'finalizing' ? 'Finalizing recipient import…' : `Staging ${state.completedRows.toLocaleString()} of ${state.totalRows.toLocaleString()} rows…`
              setWorkProgress({ label, completed: state.completedRows, total: Math.max(state.totalRows, 1) })
            },
          })
          progress.importId = importId
        } finally {
          if (abortRef.current === controller) abortRef.current = null
        }
      }
      if (!importId) throw new Error('Recipient import did not return an identifier.')
      operation.check()
      setWorkProgress({ label: 'Validating recipients…', completed: 0, total: Math.max(preview.rows.length, 1) })
      const validationRows = await listImportValidationRows(workspace.id, importId)
      operation.check()
      const selected = [...defaultRecipientSelection(validationRows)].sort((a, b) => a - b)
      if (selected.length === 0) throw new Error('No unique valid Pakistan mobile numbers were found in this file.')

      const previewId = progress.previewId ?? await createRecipientPreview(workspace.id, importId, selected)
      progress.previewId = previewId
      operation.check()
      const evidenceNote = `Bulk consent declaration for campaign “${campaignName.trim()}”. The account owner confirmed that recipients in the uploaded list may receive this campaign.`
      if (progress.grants === undefined) {
        const bulkConsent = await recordRecipientPreviewBulkConsent({
        organizationId: workspace.id,
        previewId,
        source: 'import',
        evidenceNote,
        evidenceReference: evidenceReference.trim() || `Imported list: ${parsed.fileName}`,
      })
      operation.check()
      progress.grants = bulkConsent.newGrantEvents
      }
      const snapshotId = progress.snapshotId ?? await createRecipientEligibilitySnapshot(workspace.id, previewId)
      progress.snapshotId = snapshotId
      operation.check()
      const [snapshotRows, sourceRows] = await Promise.all([
        getRecipientEligibilitySnapshotRows(workspace.id, snapshotId),
        getMessagePersonalizationSourceRows(workspace.id, snapshotId),
      ])
      operation.check()
      const eligibleRows = snapshotRows.filter((row) => row.eligibilityState === 'eligible').length
      const suppressedRows = snapshotRows.filter((row) => row.suppressionState === 'suppressed').length
      if (eligibleRows === 0) throw new Error('No recipients are eligible after the do-not-send and consent checks.')
      setPrepared({ importId, previewId, snapshotId, includedRows: selected.length, eligibleRows, suppressedRows })
      setPersonalizationRows(sourceRows)
      setReconciledAt(new Date().toISOString())
      setWizardStep(3)
      setNotice(`${eligibleRows.toLocaleString()} recipient${eligibleRows === 1 ? '' : 's'} ready for this campaign. ${suppressedRows.toLocaleString()} blocked by do-not-send.`)
    } catch (reason) {
      if (!operation.active.current) return
      if (reason instanceof Error && reason.name === 'AbortError') setNotice('Recipient import was cancelled; incomplete staged rows were discarded.')
      else setError(errorMessage(reason, 'Could not prepare campaign recipients.'))
    } finally {
      setWorkProgress(null)
      operation.finish()
      if (operation.active.current) setBusy(false)
    }
  }

  async function reviewCampaign() {
    if (!online) { setError('Reconnect to save this draft to your account and continue to review.'); return }
    if (!serverAuthorized) { setError('Verify this workspace with the server before review. Local draft access never grants review or send authorization.'); return }
    if (!workspace || !prepared || !canReview || !operation.start()) return
    setBusy(true)
    setError(null)
    try {
      const savedId = await saveMessageComposerDraft({
        organizationId: workspace.id,
        draftId,
        eligibilitySnapshotId: prepared.snapshotId,
        title: campaignName.trim(),
        messageTemplate,
      })
      operation.check()
      setDraftId(savedId)
      const finalLocalDraft: CampaignLocalDraft = {
        campaignName,
        parsed,
        mapping,
        evidenceReference,
        prepared,
        personalizationRows,
        messageTemplate,
        draftId: savedId,
      }
      const expectedRevision = revision.current
      // Once the server draft exists, review authorization must not depend on
      // IndexedDB availability or commit latency. Preserve the exact server-saved
      // draft synchronously in this tab, then reconcile the durable device copy
      // in the background with the same CAS protection used by autosave.
      writeCampaignDraft(storageKey, finalLocalDraft, expectedRevision)
      void saveQueue.current.then(async () => {
        const localResult = await saveCampaignDraftPersistent(storageKey, finalLocalDraft, revision.current)
        if (localResult.status !== 'saved') return
        revision.current = localResult.revision
        writeCampaignDraft(storageKey, finalLocalDraft, localResult.revision, localResult.updatedAt)
      }).catch(() => { /* server draft remains authoritative; local sync is best-effort */ })
      navigate(`/campaigns/review/${savedId}`)
    } catch (reason) {
      if (!operation.active.current) return
      setError(errorMessage(reason, 'Could not save the campaign draft.'))
    } finally {
      operation.finish()
      if (operation.active.current) setBusy(false)
    }
  }

  if (!workspace) return null

  const savedTime = localTimeLabel(localSavedAt)
  const reconciledTime = localTimeLabel(reconciledAt)

  return (
    <div className="page-stack simple-campaign-page">
      <div className="campaign-wizard-mobile-header" aria-label="Campaign creation navigation">
        <Link className="campaign-wizard-back" to="/campaigns">← Campaigns</Link>
        <strong>New campaign</strong>
        <button className="danger-link campaign-wizard-discard" type="button" disabled={busy || restoring || discarding} onClick={() => setDiscardDialogOpen(true)}>Discard</button>
      </div>

      <section className="page-heading recipient-heading campaign-wizard-heading">
        <div>
          <p className="eyebrow">New campaign</p>
          <h1>Create campaign</h1>
          <p>Name your campaign, add recipients, write your message and review before sending.</p>
        </div>
        <div className="button-row"><Link className="secondary-button" to="/campaigns">Back to campaigns</Link><button type="button" className="danger-link" disabled={busy || restoring || discarding} onClick={() => setDiscardDialogOpen(true)}>Discard draft</button></div>
      </section>

      <section className="draft-storage-status draft-storage-status-compact" aria-label="Draft status">
        <div>
          <strong>{localSaveState === 'failed' ? 'Draft storage unavailable' : localSaveState === 'conflict' ? 'Draft conflict needs a choice' : localSaveState === 'saving' ? 'Saving draft…' : 'Draft saved'}</strong>
          <span>{localSaveState === 'saved' && savedTime ? `Saved ${savedTime}. ` : ''}{localSaveState === 'failed' ? 'Keep this tab open until browser storage is available.' : localSaveState === 'conflict' ? 'Choose which browser copy to keep.' : 'Available on this browser.'}</span>
        </div>
        <span className={`badge ${localSaveState === 'failed' || localSaveState === 'conflict' ? 'badge-warning' : 'badge-muted'}`}>{localSaveState === 'failed' ? 'Tab only' : localSaveState === 'conflict' ? 'Conflict' : online ? 'Browser draft' : 'Offline draft'}</span>
      </section>
      {localSaveState === 'failed' ? <div role="alert" className="notice warning-notice">Browser draft storage is unavailable. BulkText will not overwrite an unknown saved browser copy; keep this tab open and try again when storage is available.</div> : null}
      {draftConflict ? <div role="alert" className="notice warning-notice draft-conflict-notice"><strong>Another saved browser version exists.</strong> This tab will not overwrite it automatically. <div className="button-row"><button className="secondary-button" type="button" onClick={() => void useSavedDeviceVersion()}>{draftConflict.current ? 'Use saved device version' : 'Discard this tab copy'}</button><button className="primary-button" type="button" onClick={() => void keepThisTabVersion()}>Keep this tab version</button></div></div> : null}
      {authority === 'local' ? <div className="notice warning-notice" role="status"><strong>Local draft access only.</strong> This cached workspace locator does not authorize recipient preparation, review, devices or sending. Reconnect and verify this workspace before continuing. {online ? <button className="text-button" type="button" disabled={workspaceLoading} onClick={() => void refreshWorkspace()}>{workspaceLoading ? 'Verifying…' : 'Verify workspace now'}</button> : null}{workspaceError ? <span> {workspaceError}</span> : null}</div> : null}
      {!online ? <div className="notice warning-notice" role="status"><strong>Offline draft mode.</strong> You can keep editing local campaign details. Reconnect before recipient preparation, review or sending.</div> : null}
      {reconciledTime ? <p className="muted-copy draft-reconciled-copy">Prepared recipients last refreshed from the server at {reconciledTime}. Local message edits are not sent to the server until you choose Review campaign.</p> : null}
      {restoreFailed && prepared && online ? <button className="secondary-button" type="button" disabled={restoring} onClick={() => { setError(null); setRestoreAttempt((value) => value + 1) }}>Retry prepared recipients</button> : null}
      {restoring ? <div role="status" className="notice">Refreshing prepared recipients from the server…</div> : null}
      {error ? <div className="notice error-notice" role="alert">{error}</div> : null}
      {notice ? <div className="notice success-notice" role="status">{notice}</div> : null}

      <ol className="simple-stepper campaign-wizard-stepper" aria-label="Campaign progress">
        <li className={wizardStep === 1 ? 'active' : wizardStep > 1 ? 'completed' : ''} aria-current={wizardStep === 1 ? 'step' : undefined}><span>{wizardStep > 1 ? '✓' : '1'}</span><strong>Campaign</strong></li>
        <li className={wizardStep === 2 ? 'active' : wizardStep > 2 ? 'completed' : ''} aria-current={wizardStep === 2 ? 'step' : undefined}><span>{wizardStep > 2 ? '✓' : '2'}</span><strong>Recipients</strong></li>
        <li className={wizardStep === 3 ? 'active' : ''} aria-current={wizardStep === 3 ? 'step' : undefined}><span>3</span><strong>Message</strong></li>
        <li><span>4</span><strong>Review</strong></li>
      </ol>

      {wizardStep === 1 ? <section ref={stepRef} tabIndex={-1} className="panel simple-campaign-section simple-wizard-step" aria-labelledby="campaign-name-title">
        <div className="panel-heading"><div><p className="eyebrow">Step 1 of 4</p><h2 id="campaign-name-title">Campaign name</h2></div></div>
        <label className="field simple-campaign-name-field"><span className="sr-only">Campaign name</span><input aria-label="Campaign name" aria-required="true" disabled={busy || restoring} value={campaignName} maxLength={120} onChange={(event) => setCampaignName(event.target.value)} placeholder="October customer update" /></label>
        <div className="simple-wizard-actions simple-wizard-actions-end"><button className="primary-button" type="button" disabled={busy || restoring || !campaignName.trim()} onClick={() => setWizardStep(2)}>Continue to recipients</button></div>
      </section> : null}

      {wizardStep === 2 ? <section ref={stepRef} tabIndex={-1} className="panel simple-campaign-section simple-wizard-step" aria-labelledby="recipient-upload-title">
        <div className="simple-wizard-context"><span>Campaign</span><strong>{campaignName.trim() || 'Untitled campaign'}</strong><button className="text-button" type="button" disabled={busy || restoring} onClick={() => setWizardStep(1)}>Edit</button></div>
        <div className="panel-heading"><div><p className="eyebrow">Step 2 of 4</p><h2 id="recipient-upload-title">Upload recipients</h2><p className="muted-copy">CSV or XLSX with a mobile-number column. Names are optional.</p></div>{parsed ? <span className="badge badge-muted">CSV · XLSX</span> : null}</div>

        {!parsed ? <div className="import-upload-zone" aria-busy={busy}>
          <label className="import-file-label simple-import-picker">
            <strong>{busy ? 'Reading file…' : 'Upload recipient list'}</strong>
            <span id="simple-import-file-help">CSV or XLSX · Mobile number column required</span>
            <span className="secondary-button simple-file-picker-action">Choose file</span>
            <input className="sr-only" ref={fileRef} aria-describedby="simple-import-file-help" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy || restoring} onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
          </label>
        </div> : null}

        {workProgress ? <div className="import-work-progress" role="status" aria-live="polite">
          <div><strong>{workProgress.label}</strong><span>{Math.min(workProgress.completed, workProgress.total).toLocaleString()} / {workProgress.total.toLocaleString()}</span></div>
          <progress max={workProgress.total} value={Math.min(workProgress.completed, workProgress.total)} />
          {abortRef.current ? <button type="button" className="secondary-button compact-button" onClick={cancelCurrentWork}>Cancel</button> : null}
        </div> : null}

        {parsed && preview && detection ? <>
          <section className="simple-import-file-card simple-import-file-card-compact" aria-label="Imported recipient file summary">
            <div className="simple-import-file-heading">
              <div><p className="eyebrow">Recipient file</p><h3>{parsed.fileName}</h3>{parsed.sheetName ? <p>{parsed.sheetName}</p> : null}</div>
              <span className={`badge ${uniqueReady > 0 ? 'badge-success' : 'badge-warning'}`}>{uniqueReady.toLocaleString()} ready</span>
            </div>
            <p className="simple-import-summary-line"><strong>{parsed.sourceRowCount.toLocaleString()} rows</strong><span>·</span><strong>{preview.summary.validPhoneRows.toLocaleString()} valid</strong><span>·</span><span>{preview.summary.duplicatePhoneRows.toLocaleString()} duplicates</span><span>·</span><span>{preview.summary.invalidPhoneRows.toLocaleString()} invalid</span></p>
            {!prepared ? <label className="simple-file-replace-action"><span>Replace file</span><input className="sr-only" ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy || restoring} onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} /></label> : null}
          </section>

          {detection.confidence === 'low' ? <div className="notice warning-notice" role="status"><strong>Check the phone column.</strong> BulkText is not confident which column contains mobile numbers. Open Advanced column mapping below.</div> : <p className="simple-detection-status" role="status"><strong>✓ Phone column detected</strong><span>{mapping.phone || 'Detected column'} · {preview.summary.validPhoneRows.toLocaleString()}/{parsed.sourceRowCount.toLocaleString()} rows recognized</span></p>}
          {parsed.sheetName ? <p className="muted-copy simple-sheet-note">Only worksheet “{parsed.sheetName}” is imported.</p> : null}

          <details className="mobile-data-details simple-recipient-preview"><summary>Recipient preview · {uniqueReady.toLocaleString()} ready</summary><div className="table-wrap"><table className="data-table"><thead><tr><th>Row</th><th>Name</th><th>Number</th><th>Status</th></tr></thead><tbody>{preview.rows.slice(0, 10).map((row) => <tr key={row.sourceRowNumber}><td>{row.sourceRowNumber}</td><td>{row.displayName ?? '—'}</td><td>{maskRecipientNumber(row.normalization.normalizedE164 ?? row.rawPhone)}</td><td>{row.duplicateInFile ? 'Duplicate — excluded' : row.normalization.validationStatus}</td></tr>)}</tbody></table></div></details>

          {prepared ? <button type="button" className="secondary-button" disabled={busy || restoring} onClick={changeRecipients}>Change recipient list</button> : null}

          {!prepared ? <details className="advanced-mapping" open={!mapping.phone || detection.confidence === 'low'}>
            <summary>Advanced column mapping</summary>
            <div className="import-mapping-grid">
              <label><span>Phone number *</span><select aria-required="true" value={mapping.phone} disabled={busy || restoring} onChange={(event) => { setConsentConfirmed(false); setMapping((current) => ({ ...current, phone: event.target.value })) }}><option value="">Select column…</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>Full / display name</span><select value={mapping.displayName ?? ''} disabled={busy || restoring} onChange={(event) => setMapping((current) => ({ ...current, displayName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>First name</span><select value={mapping.firstName ?? ''} disabled={busy || restoring} onChange={(event) => setMapping((current) => ({ ...current, firstName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>Last name</span><select value={mapping.lastName ?? ''} disabled={busy || restoring} onChange={(event) => setMapping((current) => ({ ...current, lastName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
            </div>
            {detection.phoneCandidates.length > 1 ? <p className="muted-copy">Other possible number columns: {detection.phoneCandidates.slice(1).map((item) => item.header).join(', ')}.</p> : null}
          </details> : null}

          {!prepared ? <div className="bulk-consent-declaration bulk-consent-declaration-compact">
            <label className="consent-check"><input type="checkbox" checked={consentConfirmed} disabled={busy || restoring} onChange={(event) => setConsentConfirmed(event.target.checked)} /><span><strong>I confirm these recipients have agreed to receive this campaign.</strong><small>Blocked/do-not-send numbers will still be excluded automatically.</small></span></label>
            <details className="consent-reference-details"><summary>Add consent reference (optional)</summary><label className="field"><span className="sr-only">Consent reference</span><input aria-label="Consent reference" value={evidenceReference} disabled={busy || restoring} maxLength={500} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="CRM export 14 Oct, event signup list…" /></label></details>
          </div> : null}

          <p className="simple-safety-note">✓ Invalid, duplicate and blocked numbers are excluded automatically.</p>
        </> : null}

        <div className="simple-wizard-actions">
          <button className="secondary-button" type="button" disabled={busy || restoring} onClick={() => setWizardStep(1)}>Back</button>
          {prepared ? <button className="primary-button" type="button" disabled={busy || restoring} onClick={() => setWizardStep(3)}>Continue to message</button> : <button className="primary-button" type="button" disabled={busy || !canPrepare} onClick={() => void prepareRecipients()}>{busy ? 'Preparing…' : 'Continue to message'}</button>}
        </div>
      </section> : null}

      {wizardStep === 3 && prepared ? <section ref={stepRef} tabIndex={-1} className="panel simple-campaign-section simple-wizard-step" aria-labelledby="campaign-message-title">
        <div className="simple-wizard-context"><span>Campaign</span><strong>{campaignName.trim()}</strong><span>{prepared.eligibleRows.toLocaleString()} recipients</span></div>
        <div className="panel-heading"><div><p className="eyebrow">Step 3 of 4</p><h2 id="campaign-message-title">Write message</h2></div><span className="badge badge-success">{prepared.eligibleRows.toLocaleString()} ready</span></div>
        {prepared.suppressedRows > 0 ? <div className="notice warning-notice" role="status">{prepared.suppressedRows.toLocaleString()} recipient{prepared.suppressedRows === 1 ? ' is' : 's are'} on the do-not-send list and will not receive this campaign.</div> : null}
        <label className="field simple-message-field"><span>SMS message</span><textarea aria-label="SMS message" ref={messageRef} rows={8} maxLength={4000} disabled={busy || restoring} value={messageTemplate} aria-required="true" aria-invalid={(templateAnalysis.malformed || templateAnalysis.unsupportedTokens.length > 0) || undefined} aria-describedby={['simple-message-help', templateAnalysis.malformed ? 'simple-message-malformed' : null, templateAnalysis.unsupportedTokens.length ? 'simple-message-unsupported' : null].filter(Boolean).join(' ')} onChange={(event) => setMessageTemplate(event.target.value)} placeholder="Type your message…" /><small id="simple-message-help">Use the personalization buttons below when recipient fields are available.</small></label>
        {personalizationTokens.length > 0 ? <section className="personalization-controls" aria-label="Personalization fields">
          <div><strong>Personalize</strong><span>Insert a field that is available for every prepared recipient.</span></div>
          <div className="personalization-token-list">{personalizationTokens.map((option) => <button key={option.token} className="personalization-token" type="button" disabled={busy || restoring} onClick={() => insertPersonalizationToken(option.token)}>+ {option.label}</button>)}</div>
        </section> : null}
        {templateAnalysis.malformed ? <div id="simple-message-malformed" className="notice error-notice" role="alert">Message contains malformed <code>{'{{…}}'}</code> braces.</div> : null}
        {templateAnalysis.unsupportedTokens.length ? <div id="simple-message-unsupported" className="notice error-notice" role="alert">Unsupported variables: {templateAnalysis.unsupportedTokens.join(', ')}</div> : null}
        <div className="message-live-summary" role="status" aria-live="polite">
          <strong>{messageCharacters.toLocaleString()} characters</strong><span>·</span><span>{usage.encodingSummary}</span><span>·</span><span>{segmentSummary}</span><span>·</span><strong>~{usage.estimatedSmsUnits.toLocaleString()} SMS</strong>
        </div>
        {messageTemplate.trim() && (usage.encodingSummary === 'Unicode' || usage.encodingSummary === 'Mixed') ? <div className="notice warning-notice message-encoding-notice" role="status"><strong>Unicode detected.</strong> Some recipient messages may use fewer characters per SMS segment.</div> : null}
        {usage.blockedRecipients > 0 ? <div className="notice warning-notice" role="status">{usage.blockedRecipients.toLocaleString()} recipient{usage.blockedRecipients === 1 ? '' : 's'} cannot render the selected personalization fields. Remove the field or provide that data.</div> : null}
        <div className="simple-wizard-actions"><button className="secondary-button" type="button" disabled={busy || restoring} onClick={() => setWizardStep(2)}>Back</button><button className="primary-button" type="button" disabled={busy || !canReview} onClick={() => void reviewCampaign()}>{busy ? 'Saving…' : 'Review campaign'}</button></div>
      </section> : null}

      <ActionDialog
        open={discardDialogOpen}
        eyebrow="Draft"
        title="Discard this draft?"
        description="This removes the browser draft. Saved imports, consent records and server drafts are retained."
        confirmLabel="Discard draft"
        busyLabel="Discarding…"
        cancelLabel="Keep draft"
        busy={discarding}
        tone="danger"
        onCancel={() => setDiscardDialogOpen(false)}
        onConfirm={discard}
      />
    </div>
  )
}
