import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { errorMessage } from '../lib/errors'
import { listContactImports } from '../lib/importsApi'
import {
  classifyRecipientRows,
  defaultRecipientSelection,
  summarizeRecipientDecisions,
  toggleRecipientSelection,
  type RecipientDecision,
  type RecipientValidationRow,
} from '../lib/recipientPreview'
import {
  createRecipientPreview,
  getRecipientPreviewRows,
  listImportValidationRows,
  listRecipientPreviews,
  type RecipientPreviewSummary,
  type StoredRecipientPreviewRow,
} from '../lib/recipientPreviewApi'
import { useWorkspace } from '../workspace/WorkspaceProvider'

type Filter = 'all' | RecipientDecision

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function decisionLabel(decision: RecipientDecision) {
  if (decision === 'included') return 'Included'
  if (decision === 'invalid_phone') return 'Invalid phone'
  if (decision === 'duplicate_in_file') return 'Duplicate'
  return 'Excluded'
}

function decisionBadge(decision: RecipientDecision) {
  if (decision === 'included') return 'badge badge-success'
  if (decision === 'invalid_phone') return 'badge badge-warning'
  if (decision === 'duplicate_in_file') return 'badge badge-warning'
  return 'badge badge-muted'
}

export function RecipientValidationPage() {
  const { importId = '' } = useParams()
  const { workspace } = useWorkspace()
  const [rows, setRows] = useState<RecipientValidationRow[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [previews, setPreviews] = useState<RecipientPreviewSummary[]>([])
  const [sourceFilename, setSourceFilename] = useState('')
  const [storedRows, setStoredRows] = useState<StoredRecipientPreviewRow[]>([])
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const canCreate = true

  const decisions = useMemo(() => classifyRecipientRows(rows, selected), [rows, selected])
  const summary = useMemo(() => summarizeRecipientDecisions(decisions), [decisions])
  const visibleRows = useMemo(
    () => filter === 'all' ? decisions : decisions.filter((row) => row.decision === filter),
    [decisions, filter],
  )

  const refresh = useCallback(async () => {
    if (!workspace || !importId) return
    setLoading(true)
    setError(null)
    try {
      const [nextRows, nextPreviews, imports] = await Promise.all([
        listImportValidationRows(workspace.id, importId),
        listRecipientPreviews(workspace.id, importId),
        listContactImports(workspace.id),
      ])
      setRows(nextRows)
      setSourceFilename(imports.find((item) => item.importId === importId)?.sourceFilename ?? '')
      setSelected(defaultRecipientSelection(nextRows))
      setPreviews(nextPreviews)
      setStoredRows([])
      setActivePreviewId(null)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not load recipient validation data.'))
    } finally {
      setLoading(false)
    }
  }, [workspace, importId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function savePreview() {
    if (!workspace || !importId) return
    if (selected.size === 0) {
      setError('Select at least one valid recipient before creating a preview snapshot.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const previewId = await createRecipientPreview(workspace.id, importId, [...selected].sort((a, b) => a - b))
      const [nextPreviews, nextStoredRows] = await Promise.all([
        listRecipientPreviews(workspace.id, importId),
        getRecipientPreviewRows(workspace.id, previewId),
      ])
      setPreviews(nextPreviews)
      setStoredRows(nextStoredRows)
      setActivePreviewId(previewId)
      setMessage('Recipient preview snapshot created. Continue to Consent & Suppression Gate to evaluate send eligibility.')
    } catch (reason) {
      setError(errorMessage(reason, 'Could not create recipient preview.'))
    } finally {
      setBusy(false)
    }
  }

  async function viewPreview(previewId: string) {
    if (!workspace) return
    setBusy(true)
    setError(null)
    try {
      setStoredRows(await getRecipientPreviewRows(workspace.id, previewId))
      setActivePreviewId(previewId)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not load recipient preview rows.'))
    } finally {
      setBusy(false)
    }
  }

  if (!workspace) return null

  if (loading) return <LoadingState label="Loading recipient validation…" />

  if (!rows.length && !error) {
    return (
      <div className="page-stack">
        <section className="page-heading"><div><p className="eyebrow">Recipient review</p><h1>Recipient Validation & Preview</h1></div></section>
        <EmptyState title="No staged rows">This import has no staged rows available for validation.</EmptyState>
        <Link className="secondary-button compact-button inline-action" to="/imports">Back to imports</Link>
      </div>
    )
  }

  const displayFilename = sourceFilename || previews[0]?.sourceFilename || `Import ${importId.slice(0, 8)}`

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading">
        <div>
          <p className="eyebrow">Recipient review</p>
          <h1>Recipient Validation & Preview</h1>
          <p>Review canonical Pakistan mobile numbers, resolve duplicates by choosing one source row per number, exclude unwanted rows, then create a server-authoritative preview snapshot.</p>
        </div>
        <Link className="secondary-button compact-button" to="/imports">Back to imports</Link>
      </section>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Source import</p><h2>{displayFilename}</h2></div>
          <span className="badge badge-muted">recipient-validation-v1</span>
        </div>
        <p className="muted-copy">A checked row is structurally included in this validation snapshot only. It is not consent-approved, suppression-cleared or send-authorized.</p>
      </section>

      <section className="metric-grid recipient-metrics">
        <article className="metric-card"><span>Source rows</span><h2>{summary.totalRows}</h2><p>All staged rows remain reviewable.</p></article>
        <article className="metric-card"><span>Included</span><h2>{summary.includedRows}</h2><p>Unique valid numbers selected for this preview.</p></article>
        <article className="metric-card"><span>Invalid</span><h2>{summary.invalidPhoneRows}</h2><p>Cannot be selected until corrected in a later import.</p></article>
        <article className="metric-card"><span>Excluded</span><h2>{summary.duplicateRows + summary.manuallyExcludedRows}</h2><p>{summary.duplicateRows} duplicate · {summary.manuallyExcludedRows} manual</p></article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Selection workspace</p><h2>Resolve recipients</h2></div>
          <div className="recipient-actions">
            <button className="secondary-button compact-button" type="button" disabled={busy || !canCreate} onClick={() => setSelected(defaultRecipientSelection(rows))}>Reset defaults</button>
            <button className="secondary-button compact-button" type="button" disabled={busy || !canCreate} onClick={() => setSelected(new Set())}>Clear</button>
            {canCreate ? <button className="primary-button compact-button" type="button" disabled={busy || selected.size === 0} onClick={() => void savePreview()}>{busy ? 'Saving…' : 'Create preview snapshot'}</button> : null}
          </div>
        </div>


        <div className="recipient-filter-row" role="group" aria-label="Recipient filters">
          {([
            ['all', `All ${summary.totalRows}`],
            ['included', `Included ${summary.includedRows}`],
            ['invalid_phone', `Invalid ${summary.invalidPhoneRows}`],
            ['duplicate_in_file', `Duplicates ${summary.duplicateRows}`],
            ['manually_excluded', `Excluded ${summary.manuallyExcludedRows}`],
          ] as Array<[Filter, string]>).map(([value, label]) => (
            <button key={value} type="button" className={filter === value ? 'filter-chip active' : 'filter-chip'} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>

        <div className="table-wrap">
          <table className="data-table recipient-validation-table">
            <thead><tr><th>Use</th><th>Row</th><th>Name</th><th>Raw phone</th><th>Canonical</th><th>Decision</th><th>Why</th></tr></thead>
            <tbody>{visibleRows.map((row) => {
              const selectable = row.phoneValidationStatus === 'valid' && Boolean(row.normalizedE164)
              return (
                <tr key={row.importRowId} className={row.decision === 'included' ? 'recipient-row-included' : ''}>
                  <td><input type="checkbox" aria-label={`Select source row ${row.sourceRowNumber}`} checked={selected.has(row.importRowId)} disabled={!selectable || busy || !canCreate} onChange={() => setSelected((current) => toggleRecipientSelection(rows, current, row.importRowId))} /></td>
                  <td>{row.sourceRowNumber}</td>
                  <td>{row.displayName ?? ([row.firstName, row.lastName].filter(Boolean).join(' ') || '—')}</td>
                  <td><code>{row.rawPhone || '—'}</code></td>
                  <td><code>{row.normalizedE164 ?? '—'}</code>{row.duplicateGroupSize > 1 ? <small>Group of {row.duplicateGroupSize}</small> : null}</td>
                  <td><span className={decisionBadge(row.decision)}>{decisionLabel(row.decision)}</span></td>
                  <td><small>{row.decision === 'invalid_phone' ? row.phoneValidationReason : row.decision === 'duplicate_in_file' ? 'Another row with this canonical number is selected.' : row.decision === 'manually_excluded' ? 'No row for this number is currently selected.' : 'Valid unique selection.'}</small></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Snapshot history</p><h2>Recipient previews</h2></div><span className="badge badge-muted">Immutable revisions</span></div>
        {previews.length === 0 ? <EmptyState title="No recipient previews">Resolve the staged rows above and create the first validation snapshot.</EmptyState> : (
          <div className="table-wrap">
            <table className="data-table recipient-preview-history-table">
              <thead><tr><th>Revision</th><th>Included</th><th>Excluded breakdown</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>{previews.map((preview) => (
                <tr key={preview.previewId}>
                  <td><strong>#{preview.revision}</strong><small>{preview.validationVersion}</small></td>
                  <td><span className="badge badge-success">{preview.includedRows} included</span></td>
                  <td>{preview.invalidPhoneRows} invalid · {preview.duplicateRows} duplicate · {preview.manuallyExcludedRows} manual</td>
                  <td>{dateTime(preview.createdAt)}</td>
                  <td><div className="import-row-actions"><button className="secondary-button compact-button" disabled={busy} type="button" onClick={() => void viewPreview(preview.previewId)}>{activePreviewId === preview.previewId ? 'Viewing' : 'View'}</button><Link className="primary-button compact-button" to={`/recipient-previews/${preview.previewId}/eligibility`}>Consent gate</Link></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {activePreviewId ? (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Stored snapshot</p><h2>Server-authoritative row decisions</h2></div><span className="badge badge-success">{storedRows.filter((row) => row.decision === 'included').length} included</span></div>
          <div className="table-wrap">
            <table className="data-table stored-preview-table">
              <thead><tr><th>Row</th><th>Name</th><th>Canonical</th><th>Decision</th><th>Reason</th></tr></thead>
              <tbody>{storedRows.map((row) => (
                <tr key={row.previewRowId}>
                  <td>{row.sourceRowNumber}</td>
                  <td>{row.displayName ?? '—'}</td>
                  <td><code>{row.normalizedE164 ?? '—'}</code></td>
                  <td><span className={row.decision === 'included' ? 'badge badge-success' : 'badge badge-muted'}>{row.decision}</span></td>
                  <td>{row.exclusionReason?.replaceAll('_', ' ') ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="notice warning-notice">Structural recipient validation stays immutable and separate from compliance. Use Consent gate on a saved preview to apply the authoritative consent/suppression policy and create eligibility snapshots.</section>
    </div>
  )
}
