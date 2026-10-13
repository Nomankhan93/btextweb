import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { parseSpreadsheetFile, type ParsedImportFile } from '../lib/importFiles'
import { buildImportPreview, detectSmartImportMapping, type ImportColumnMapping, type SmartImportDetection } from '../lib/importMapping'
import { createContactImport, deleteContactImport, listContactImports, type ContactImportSummary } from '../lib/importsApi'
import { errorMessage } from '../lib/errors'
import { useOperationGuard } from '../lib/useOperationGuard'
import { useWorkspace } from '../workspace/WorkspaceProvider'

const emptyMapping: ImportColumnMapping = { phone: '', firstName: null, lastName: null, displayName: null }

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function optionalHeader(value: string): string | null {
  return value || null
}

export function ImportsPage() {
  const { workspace } = useWorkspace()
  return workspace ? <ImportForm key={workspace.id} /> : null
}
function ImportForm() {
  const { workspace } = useWorkspace()
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null)
  const [mapping, setMapping] = useState<ImportColumnMapping>(emptyMapping)
  const [detection, setDetection] = useState<SmartImportDetection | null>(null)
  const [imports, setImports] = useState<ContactImportSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [busy, setBusy] = useState(false)
  const [workProgress, setWorkProgress] = useState<{ label: string; completed: number; total: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const canImport = true
  const operation = useOperationGuard()
  const historyGeneration = useRef(0)

  const preview = useMemo(() => parsed ? buildImportPreview(parsed, mapping) : null, [mapping, parsed])

  const refreshHistory = useCallback(async () => {
    if (!workspace) {
      setImports([])
      setLoadingHistory(false)
      return
    }
    const request = ++historyGeneration.current
    setLoadingHistory(true)
    try {
      const next = await listContactImports(workspace.id)
      if (operation.active.current && request === historyGeneration.current) setImports(next)
    } catch (reason) {
      if (operation.active.current && request === historyGeneration.current) setError(errorMessage(reason, 'Could not load import history.'))
    } finally {
      if (operation.active.current && request === historyGeneration.current) setLoadingHistory(false)
    }
  }, [workspace?.id])

  useEffect(() => {
    setParsed(null)
    setMapping(emptyMapping)
    setDetection(null)
    setError(null)
    setMessage(null)
    if (inputRef.current) inputRef.current.value = ''
    void refreshHistory().catch((reason) => setError(errorMessage(reason, 'Could not load import history.')))
  }, [refreshHistory])

  useEffect(() => () => abortRef.current?.abort(), [])

  function cancelCurrentWork() {
    abortRef.current?.abort()
  }

  async function selectFile(file: File | null) {
    if (!file || !operation.start()) return
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setMessage(null)
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
      const smart = detectSmartImportMapping(next)
      setParsed(next)
      setDetection(smart)
      setMapping(smart.mapping)
    } catch (reason) {
      if (!operation.active.current) return
      if (reason instanceof Error && reason.name === 'AbortError') setMessage('File processing was cancelled.')
      else setError(errorMessage(reason, 'Could not read the import file.'))
      if (inputRef.current) inputRef.current.value = ''
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setWorkProgress(null)
      operation.finish()
      if (operation.active.current) setBusy(false)
    }
  }

  async function stageImport() {
    if (!workspace || !parsed || !preview) return
    setError(null)
    setMessage(null)
    if (!mapping.phone) {
      setError('Select the column that contains recipient phone numbers.')
      return
    }
    if (!operation.start()) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setWorkProgress({ label: 'Starting recipient import…', completed: 0, total: Math.max(preview.rows.length, 1) })
    try {
      await createContactImport(workspace.id, parsed, mapping, preview.rows, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!operation.active.current) return
          const label = progress.phase === 'starting' ? 'Starting recipient import…' : progress.phase === 'finalizing' ? 'Finalizing recipient import…' : `Staging ${progress.completedRows.toLocaleString()} of ${progress.totalRows.toLocaleString()} rows…`
          setWorkProgress({ label, completed: progress.completedRows, total: Math.max(progress.totalRows, 1) })
        },
      })
      operation.check()
      setMessage(`${parsed.fileName} is ready for review. Use Validate & preview to resolve invalid or duplicate numbers.`)
      setParsed(null)
      setMapping(emptyMapping)
      setDetection(null)
      if (inputRef.current) inputRef.current.value = ''
      await refreshHistory()
    } catch (reason) {
      if (!operation.active.current) return
      if (reason instanceof Error && reason.name === 'AbortError') setMessage('Recipient import was cancelled; incomplete staged rows were discarded.')
      else setError(errorMessage(reason, 'Could not prepare the upload.'))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setWorkProgress(null)
      operation.finish()
      if (operation.active.current) setBusy(false)
    }
  }

  async function removeImport(item: ContactImportSummary) {
    if (!workspace) return
    const confirmed = window.confirm(`Delete staged import “${item.sourceFilename}”? This removes its staged rows only; no messages have been sent.`)
    if (!confirmed || !operation.start()) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await deleteContactImport(workspace.id, item.importId)
      operation.check()
      setMessage(`${item.sourceFilename} was deleted.`)
      await refreshHistory()
    } catch (reason) {
      if (!operation.active.current) return
      const message = errorMessage(reason, 'Could not delete the staged import.')
      if (message.includes('23503') || message.toLocaleLowerCase().includes('recipient preview history')) {
        setError('This upload already has saved review history, so BulkText retains it for audit. It will not affect a new campaign; use a new upload for the next campaign.')
      } else {
        setError(message)
      }
    } finally {
      operation.finish()
      if (operation.active.current) setBusy(false)
    }
  }

  if (!workspace) return null

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Recipients</p>
          <h1>Upload recipients</h1>
          <p>Upload a CSV or XLSX file. BulkText automatically looks for Pakistan mobile numbers; manual mapping is only a fallback.</p>
        </div>
      </section>

      {error ? <div className="notice error-notice" role="alert">{error}</div> : null}
      {message ? <div className="notice success-notice" role="status">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Step 1</p><h2>Choose a source file</h2></div>
          <span className="badge badge-muted">CSV · XLSX</span>
        </div>
        {canImport ? (
          <>
            <div className="import-upload-zone" aria-busy={busy}>
              <label className="import-file-label">
                <strong>{busy ? 'Reading file…' : 'Select CSV or XLSX'}</strong>
                <span id="import-file-help">Legacy .xls is intentionally rejected; save it as .xlsx or CSV first.</span>
                <input ref={inputRef} aria-describedby="import-file-help" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
              </label>
            </div>
            {workProgress ? <div className="import-work-progress" role="status" aria-live="polite">
              <div><strong>{workProgress.label}</strong><span>{Math.min(workProgress.completed, workProgress.total).toLocaleString()} / {workProgress.total.toLocaleString()}</span></div>
              <progress max={workProgress.total} value={Math.min(workProgress.completed, workProgress.total)} />
              <button type="button" className="secondary-button compact-button" onClick={cancelCurrentWork}>Cancel</button>
            </div> : null}
          </>
        ) : null}
      </section>

      {parsed && preview ? (
        <>
          <section className="metric-grid import-metrics">
            <article className="metric-card"><span>Rows</span><h2>{parsed.sourceRowCount}</h2><p>{parsed.fileName} · {bytesLabel(parsed.fileSizeBytes)}{parsed.sheetName ? ` · ${parsed.sheetName}` : ''}</p></article>
            <article className="metric-card"><span>Valid phones</span><h2>{preview.summary.validPhoneRows}</h2><p>Numbers ready in standard +923 format.</p></article>
            <article className="metric-card"><span>Needs review</span><h2>{preview.summary.invalidPhoneRows}</h2><p>{preview.summary.duplicatePhoneRows} additional valid rows repeat a number already present in this file.</p></article>
          </section>

          {parsed.sheetName ? <p className="notice">Only worksheet “{parsed.sheetName}” is imported. Move the intended sheet first or export it as CSV to use another sheet.</p> : null}

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Step 2</p><h2>Smart number detection</h2></div><span className={mapping.phone ? 'badge badge-success' : 'badge badge-warning'}>{mapping.phone ? 'Phone found' : 'Phone needs mapping'}</span></div>
            {detection ? <div className={detection.confidence === 'low' ? 'notice warning-notice' : 'notice success-notice'} role="status"><strong>Smart detection:</strong> {detection.message}</div> : null}
            <details className="advanced-mapping" open={!mapping.phone || detection?.confidence === 'low'}>
              <summary>Advanced column mapping</summary>
            <div className="import-mapping-grid">
              <label><span>Phone number *</span><select aria-required="true" disabled={busy} value={mapping.phone} onChange={(event) => setMapping((current) => ({ ...current, phone: event.target.value }))}><option value="">Select column…</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>Full / display name</span><select disabled={busy} value={mapping.displayName ?? ''} onChange={(event) => setMapping((current) => ({ ...current, displayName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>First name</span><select disabled={busy} value={mapping.firstName ?? ''} onChange={(event) => setMapping((current) => ({ ...current, firstName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>Last name</span><select disabled={busy} value={mapping.lastName ?? ''} onChange={(event) => setMapping((current) => ({ ...current, lastName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
            </div>
            <p className="muted-copy import-custom-note">Unmapped columns are preserved as staged custom fields. They are not discarded.</p>
            </details>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Step 3</p><h2>Preview first {Math.min(preview.rows.length, 25)} rows</h2></div><button className="primary-button" type="button" disabled={busy || !mapping.phone || preview.rows.length === 0} onClick={() => void stageImport()}>{busy ? 'Preparing…' : 'Prepare recipients'}</button></div>
            {mapping.phone ? (
              <div className="table-wrap">
                <table className="data-table import-preview-table">
                  <thead><tr><th>Row</th><th>Name</th><th>Raw phone</th><th>Canonical</th><th>Status</th></tr></thead>
                  <tbody>{preview.rows.slice(0, 25).map((row) => (
                    <tr key={row.sourceRowNumber}>
                      <td>{row.sourceRowNumber}</td>
                      <td>{row.displayName ?? '—'}</td>
                      <td><code>{row.rawPhone || '—'}</code></td>
                      <td><code>{row.normalization.normalizedE164 ?? '—'}</code></td>
                      <td><span className={row.normalization.validationStatus === 'valid' ? (row.duplicateInFile ? 'badge badge-warning' : 'badge badge-success') : 'badge badge-warning'}>{row.duplicateInFile ? 'duplicate in file' : row.normalization.validationStatus.replaceAll('_', ' ')}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="muted-copy import-preview-empty">Choose the phone-number column to build the preview.</p>}
          </section>
        </>
      ) : null}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Recent uploads</p><h2>Recipient files</h2></div><button className="secondary-button compact-button" type="button" disabled={loadingHistory || busy} onClick={() => void refreshHistory()}>Refresh</button></div>
        {loadingHistory ? <LoadingState label="Loading staged imports…" /> : imports.length === 0 ? (
          <EmptyState title="No recipient files yet">Upload your first CSV or XLSX file to begin preparing recipients.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table import-history-table">
              <thead><tr><th>File</th><th>Rows</th><th>Phone preview</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>{imports.map((item) => (
                <tr key={item.importId}>
                  <td><strong>{item.sourceFilename}</strong><small>{item.sourceType.toUpperCase()}{item.sheetName ? ` · ${item.sheetName}` : ''} · {bytesLabel(item.sourceSizeBytes)}</small></td>
                  <td>{item.totalRows}</td>
                  <td><span className="badge badge-success">{item.validPhoneRows} valid</span> <span className="badge badge-warning">{item.invalidPhoneRows} review</span><small>{item.duplicatePhoneRows} duplicate-in-file rows retained</small></td>
                  <td>{dateTime(item.createdAt)}</td>
                  <td><div className="import-row-actions"><Link className="secondary-button compact-button" to={`/imports/${item.importId}/validate`}>Validate & preview</Link>{canImport ? <button className="danger-button compact-button" type="button" disabled={busy} onClick={() => void removeImport(item)}>Delete</button> : null}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="notice warning-notice">Uploading and reviewing recipients does not send messages. Consent and do-not-send checks happen before a campaign can be confirmed.</section>
    </div>
  )
}
