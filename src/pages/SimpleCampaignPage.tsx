import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { errorMessage } from '../lib/errors'
import { MAX_IMPORT_ROWS, parseSpreadsheetFile, type ParsedImportFile } from '../lib/importFiles'
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
import { analyzeMessageTemplate } from '../lib/messageComposer'
import { estimatePersonalizedSmsUsage } from '../lib/smsSegments'
import { useWorkspace } from '../workspace/WorkspaceProvider'

interface PreparedCampaignRecipients {
  importId: string
  previewId: string
  snapshotId: string
  includedRows: number
  eligibleRows: number
  suppressedRows: number
}

const emptyMapping: ImportColumnMapping = { phone: '', firstName: null, lastName: null, displayName: null }

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function optionalHeader(value: string): string | null {
  return value || null
}

export function SimpleCampaignPage() {
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [campaignName, setCampaignName] = useState('')
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null)
  const [detection, setDetection] = useState<SmartImportDetection | null>(null)
  const [mapping, setMapping] = useState<ImportColumnMapping>(emptyMapping)
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [evidenceReference, setEvidenceReference] = useState('')
  const [prepared, setPrepared] = useState<PreparedCampaignRecipients | null>(null)
  const [messageTemplate, setMessageTemplate] = useState('')
  const [personalizationRows, setPersonalizationRows] = useState<Awaited<ReturnType<typeof getMessagePersonalizationSourceRows>>>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const preview = useMemo(() => parsed ? buildImportPreview(parsed, mapping) : null, [parsed, mapping])
  const uniqueReady = preview ? Math.max(0, preview.summary.validPhoneRows - preview.summary.duplicatePhoneRows) : 0
  const templateAnalysis = useMemo(() => analyzeMessageTemplate(messageTemplate), [messageTemplate])
  const usage = useMemo(() => estimatePersonalizedSmsUsage(messageTemplate, personalizationRows), [messageTemplate, personalizationRows])
  const canPrepare = Boolean(
    workspace && parsed && mapping.phone && !parsed.truncated && uniqueReady > 0 && consentConfirmed && campaignName.trim(),
  )
  const canReview = Boolean(
    prepared && campaignName.trim() && messageTemplate.trim() && !templateAnalysis.malformed && templateAnalysis.unsupportedTokens.length === 0 && usage.readyRecipients > 0 && usage.blockedRecipients === 0,
  )

  async function selectFile(file: File | null) {
    setError(null)
    setNotice(null)
    setPrepared(null)
    setPersonalizationRows([])
    setParsed(null)
    setDetection(null)
    setMapping(emptyMapping)
    if (!file) return
    setBusy(true)
    try {
      const next = await parseSpreadsheetFile(file)
      const smart = detectSmartImportMapping(next)
      setParsed(next)
      setDetection(smart)
      setMapping(smart.mapping)
      setEvidenceReference(`Imported list: ${file.name}`)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not read the recipient file.'))
      if (fileRef.current) fileRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  async function prepareRecipients() {
    if (!workspace || !parsed || !preview || !canPrepare) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const importId = await createContactImport(workspace.id, parsed, mapping, preview.rows)
      const validationRows = await listImportValidationRows(workspace.id, importId)
      const selected = [...defaultRecipientSelection(validationRows)].sort((a, b) => a - b)
      if (selected.length === 0) throw new Error('No unique valid Pakistan mobile numbers were found in this file.')

      const previewId = await createRecipientPreview(workspace.id, importId, selected)
      const evidenceNote = `Bulk consent declaration for campaign “${campaignName.trim()}”. The account owner confirmed that recipients in the uploaded list may receive this campaign.`
      const bulkConsent = await recordRecipientPreviewBulkConsent({
        organizationId: workspace.id,
        previewId,
        source: 'import',
        evidenceNote,
        evidenceReference: evidenceReference.trim() || `Imported list: ${parsed.fileName}`,
      })
      const snapshotId = await createRecipientEligibilitySnapshot(workspace.id, previewId)
      const [snapshotRows, sourceRows] = await Promise.all([
        getRecipientEligibilitySnapshotRows(workspace.id, snapshotId),
        getMessagePersonalizationSourceRows(workspace.id, snapshotId),
      ])
      const eligibleRows = snapshotRows.filter((row) => row.eligibilityState === 'eligible').length
      const suppressedRows = snapshotRows.filter((row) => row.suppressionState === 'suppressed').length
      if (eligibleRows === 0) throw new Error('No recipients are eligible after the do-not-send and consent checks.')
      setPrepared({ importId, previewId, snapshotId, includedRows: selected.length, eligibleRows, suppressedRows })
      setPersonalizationRows(sourceRows)
      setNotice(`${eligibleRows.toLocaleString()} recipient${eligibleRows === 1 ? '' : 's'} ready for this campaign. ${bulkConsent.newGrantEvents.toLocaleString()} consent grant${bulkConsent.newGrantEvents === 1 ? '' : 's'} recorded; ${suppressedRows.toLocaleString()} suppressed.`)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not prepare campaign recipients.'))
    } finally {
      setBusy(false)
    }
  }

  async function reviewCampaign() {
    if (!workspace || !prepared || !canReview) return
    setBusy(true)
    setError(null)
    try {
      const draftId = await saveMessageComposerDraft({
        organizationId: workspace.id,
        draftId: null,
        eligibilitySnapshotId: prepared.snapshotId,
        title: campaignName.trim(),
        messageTemplate: messageTemplate.trim(),
      })
      navigate(`/campaigns/review/${draftId}`)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not save the campaign draft.'))
    } finally {
      setBusy(false)
    }
  }

  if (!workspace) return null

  return (
    <div className="page-stack simple-campaign-page">
      <section className="page-heading recipient-heading">
        <div>
          <p className="eyebrow">New campaign</p>
          <h1>Create campaign</h1>
          <p>Name it, upload almost any CSV/XLSX list, write the message and review. BulkText handles number detection, normalization, duplicates, consent declaration and suppression checks behind the scenes.</p>
        </div>
        <Link className="secondary-button" to="/campaigns">Cancel</Link>
      </section>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {notice ? <div className="notice success-notice">{notice}</div> : null}

      <ol className="simple-stepper" aria-label="Campaign steps">
        <li className="active"><span>1</span>Campaign</li>
        <li className={parsed ? 'active' : ''}><span>2</span>Recipients</li>
        <li className={prepared ? 'active' : ''}><span>3</span>Message</li>
        <li><span>4</span>Review &amp; send</li>
      </ol>

      <section className="panel simple-campaign-section">
        <div className="panel-heading"><div><p className="eyebrow">Step 1</p><h2>Campaign name</h2></div></div>
        <label className="field"><span>Name</span><input value={campaignName} maxLength={120} onChange={(event) => setCampaignName(event.target.value)} placeholder="October customer update" /></label>
      </section>

      <section className="panel simple-campaign-section">
        <div className="panel-heading"><div><p className="eyebrow">Step 2</p><h2>Upload recipient list</h2><p className="muted-copy">We primarily need the mobile-number column. Names and other fields are optional.</p></div><span className="badge badge-muted">CSV · XLSX · max 5 MB / {MAX_IMPORT_ROWS.toLocaleString()} rows</span></div>
        <div className="import-upload-zone">
          <label className="import-file-label">
            <strong>{busy && !parsed ? 'Reading file…' : 'Choose CSV or XLSX'}</strong>
            <span>BulkText looks at both the column name and the actual values to find Pakistan mobile numbers.</span>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy || Boolean(prepared)} onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
          </label>
        </div>

        {parsed && preview && detection ? <>
          <div className="metric-grid import-metrics simple-import-summary">
            <article className="metric-card"><span>Rows</span><h2>{parsed.sourceRowCount.toLocaleString()}</h2><p>{parsed.fileName} · {bytesLabel(parsed.fileSizeBytes)}{parsed.sheetName ? ` · ${parsed.sheetName}` : ''}</p></article>
            <article className="metric-card"><span>Numbers found</span><h2>{preview.summary.validPhoneRows.toLocaleString()}</h2><p>{uniqueReady.toLocaleString()} unique valid recipient{uniqueReady === 1 ? '' : 's'}.</p></article>
            <article className="metric-card"><span>Auto-cleaned</span><h2>{preview.summary.duplicatePhoneRows.toLocaleString()}</h2><p>Duplicate rows excluded automatically.</p></article>
            <article className="metric-card"><span>Invalid</span><h2>{preview.summary.invalidPhoneRows.toLocaleString()}</h2><p>Invalid/non-mobile values will not be selected.</p></article>
          </div>
          <div className={detection.confidence === 'low' ? 'notice warning-notice' : 'notice success-notice'}>
            <strong>Smart detection:</strong> {detection.message}
          </div>
          {parsed.truncated ? <div className="notice error-notice">This file has more than {MAX_IMPORT_ROWS.toLocaleString()} data rows. Split it before continuing.</div> : null}

          <details className="advanced-mapping">
            <summary>Advanced column mapping</summary>
            <div className="import-mapping-grid">
              <label><span>Phone number *</span><select value={mapping.phone} disabled={Boolean(prepared)} onChange={(event) => setMapping((current) => ({ ...current, phone: event.target.value }))}><option value="">Select column…</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>Full / display name</span><select value={mapping.displayName ?? ''} disabled={Boolean(prepared)} onChange={(event) => setMapping((current) => ({ ...current, displayName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>First name</span><select value={mapping.firstName ?? ''} disabled={Boolean(prepared)} onChange={(event) => setMapping((current) => ({ ...current, firstName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>Last name</span><select value={mapping.lastName ?? ''} disabled={Boolean(prepared)} onChange={(event) => setMapping((current) => ({ ...current, lastName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
            </div>
            {detection.phoneCandidates.length > 1 ? <p className="muted-copy">Other possible number columns: {detection.phoneCandidates.slice(1).map((item) => item.header).join(', ')}.</p> : null}
          </details>

          <div className="bulk-consent-declaration">
            <label className="consent-check"><input type="checkbox" checked={consentConfirmed} disabled={Boolean(prepared)} onChange={(event) => setConsentConfirmed(event.target.checked)} /><span><strong>I confirm these recipients have agreed to receive this campaign.</strong><small>This records one auditable bulk declaration against the included recipient snapshot. Existing do-not-send blocks still win.</small></span></label>
            <label className="field"><span>Evidence / list reference (optional)</span><input value={evidenceReference} disabled={Boolean(prepared)} maxLength={500} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="CRM export, customer list, signup form batch…" /></label>
          </div>

          {!prepared ? <div className="button-row"><button className="primary-button" type="button" disabled={busy || !canPrepare} onClick={() => void prepareRecipients()}>{busy ? 'Preparing…' : `Continue with ${uniqueReady.toLocaleString()} unique numbers`}</button></div> : null}
        </> : null}
      </section>

      {prepared ? <section className="panel simple-campaign-section">
        <div className="panel-heading"><div><p className="eyebrow">Step 3</p><h2>Write message</h2></div><span className="badge badge-success">{prepared.eligibleRows.toLocaleString()} ready</span></div>
        {prepared.suppressedRows > 0 ? <div className="notice warning-notice">{prepared.suppressedRows.toLocaleString()} recipient{prepared.suppressedRows === 1 ? ' is' : 's are'} on the do-not-send list and will not receive this campaign.</div> : null}
        <label className="field"><span>SMS message</span><textarea rows={8} maxLength={4000} value={messageTemplate} onChange={(event) => setMessageTemplate(event.target.value)} placeholder="Type your message…" /><small>Personalization is optional. Use <code>{'{{name}}'}</code> only when the uploaded file contains names.</small></label>
        {templateAnalysis.malformed ? <div className="notice error-notice">Message contains malformed <code>{'{{…}}'}</code> braces.</div> : null}
        {templateAnalysis.unsupportedTokens.length ? <div className="notice error-notice">Unsupported variables: {templateAnalysis.unsupportedTokens.join(', ')}</div> : null}
        <div className="metric-grid simple-message-metrics">
          <article className="metric-card"><span>Recipients</span><h2>{usage.readyRecipients.toLocaleString()}</h2><p>Complete personalized messages.</p></article>
          <article className="metric-card"><span>Estimated SMS units</span><h2>{usage.estimatedSmsUnits.toLocaleString()}</h2><p>{usage.encodingSummary}</p></article>
          <article className="metric-card"><span>Segments</span><h2>{usage.maximumSegments || 0}</h2><p>Maximum per recipient in the current message.</p></article>
        </div>
        {usage.blockedRecipients > 0 ? <div className="notice warning-notice">{usage.blockedRecipients.toLocaleString()} recipient{usage.blockedRecipients === 1 ? '' : 's'} cannot render the selected personalization variables. Remove the variable or provide that data.</div> : null}
        <div className="button-row"><button className="primary-button" type="button" disabled={busy || !canReview} onClick={() => void reviewCampaign()}>{busy ? 'Saving…' : 'Review campaign'}</button></div>
      </section> : null}

      <section className="notice warning-notice"><strong>Safety stays automatic:</strong> invalid/duplicate numbers are excluded, do-not-send always overrides the bulk consent declaration, and final confirmation still freezes the recipient/message/SIM snapshot before queueing.</section>
    </div>
  )
}
