import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { MAX_IMPORT_ROWS, parseSpreadsheetFile, type ParsedImportFile } from '../lib/importFiles'
import { autoDetectImportMapping, buildImportPreview, type ImportColumnMapping } from '../lib/importMapping'
import { createContactImport, deleteContactImport, listContactImports, type ContactImportSummary } from '../lib/importsApi'
import { errorMessage } from '../lib/errors'
import { canManageCampaigns } from '../lib/rbac'
import { useOrganizations } from '../organizations/OrganizationProvider'

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
  const { currentOrganization } = useOrganizations()
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null)
  const [mapping, setMapping] = useState<ImportColumnMapping>(emptyMapping)
  const [imports, setImports] = useState<ContactImportSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const canImport = canManageCampaigns(currentOrganization?.role)

  const preview = useMemo(() => parsed ? buildImportPreview(parsed, mapping) : null, [mapping, parsed])

  const refreshHistory = useCallback(async () => {
    if (!currentOrganization) {
      setImports([])
      setLoadingHistory(false)
      return
    }
    setLoadingHistory(true)
    try {
      setImports(await listContactImports(currentOrganization.id))
    } finally {
      setLoadingHistory(false)
    }
  }, [currentOrganization])

  useEffect(() => {
    setParsed(null)
    setMapping(emptyMapping)
    setError(null)
    setMessage(null)
    if (inputRef.current) inputRef.current.value = ''
    void refreshHistory().catch((reason) => setError(errorMessage(reason, 'Could not load import history.')))
  }, [refreshHistory])

  async function selectFile(file: File | null) {
    setError(null)
    setMessage(null)
    setParsed(null)
    setMapping(emptyMapping)
    if (!file) return
    setBusy(true)
    try {
      const next = await parseSpreadsheetFile(file)
      setParsed(next)
      setMapping(autoDetectImportMapping(next.headers))
    } catch (reason) {
      setError(errorMessage(reason, 'Could not read the import file.'))
      if (inputRef.current) inputRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  async function stageImport() {
    if (!currentOrganization || !parsed || !preview) return
    setError(null)
    setMessage(null)
    if (!mapping.phone) {
      setError('Select the column that contains recipient phone numbers.')
      return
    }
    if (parsed.truncated) {
      setError(`This file contains more than ${MAX_IMPORT_ROWS.toLocaleString()} rows. Split it into smaller files before staging.`)
      return
    }

    setBusy(true)
    try {
      await createContactImport(currentOrganization.id, parsed, mapping, preview.rows)
      setMessage(`${parsed.fileName} was staged successfully. Use Validate & preview to resolve duplicates and create a recipient snapshot.`)
      setParsed(null)
      setMapping(emptyMapping)
      if (inputRef.current) inputRef.current.value = ''
      await refreshHistory()
    } catch (reason) {
      setError(errorMessage(reason, 'Could not stage the import.'))
    } finally {
      setBusy(false)
    }
  }

  async function removeImport(item: ContactImportSummary) {
    if (!currentOrganization) return
    const confirmed = window.confirm(`Delete staged import “${item.sourceFilename}”? This removes its staged rows only; no messages have been sent.`)
    if (!confirmed) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await deleteContactImport(currentOrganization.id, item.importId)
      setMessage(`${item.sourceFilename} was deleted.`)
      await refreshHistory()
    } catch (reason) {
      setError(errorMessage(reason, 'Could not delete the staged import.'))
    } finally {
      setBusy(false)
    }
  }

  if (!currentOrganization) return null

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">BulkText 0.10</p>
          <h1>Excel / CSV Import</h1>
          <p>Parse CSV or modern XLSX files in the browser, map recipient fields, preview canonical Pakistan mobile numbers, then stage the rows inside the current organization for recipient validation and preview.</p>
        </div>
      </section>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Step 1</p><h2>Choose a source file</h2></div>
          <span className="badge badge-muted">CSV · XLSX · max 5 MB / {MAX_IMPORT_ROWS.toLocaleString()} rows</span>
        </div>
        {canImport ? (
          <div className="import-upload-zone">
            <label className="import-file-label">
              <strong>{busy ? 'Reading file…' : 'Select CSV or XLSX'}</strong>
              <span>Legacy .xls is intentionally rejected; save it as .xlsx or CSV first.</span>
              <input ref={inputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>
        ) : <div className="notice warning-notice">Your role can view staged import history, but only Owner, Admin and Campaign Manager roles can upload or delete imports.</div>}
      </section>

      {parsed && preview ? (
        <>
          <section className="metric-grid import-metrics">
            <article className="metric-card"><span>Rows</span><h2>{parsed.sourceRowCount}</h2><p>{parsed.fileName} · {bytesLabel(parsed.fileSizeBytes)}{parsed.sheetName ? ` · ${parsed.sheetName}` : ''}</p></article>
            <article className="metric-card"><span>Valid phones</span><h2>{preview.summary.validPhoneRows}</h2><p>Canonical +923xxxxxxxxx values according to pk-mobile-v1.</p></article>
            <article className="metric-card"><span>Needs review</span><h2>{preview.summary.invalidPhoneRows}</h2><p>{preview.summary.duplicatePhoneRows} additional valid rows repeat a number already present in this file.</p></article>
          </section>

          {parsed.truncated ? <div className="notice warning-notice">The file contains more than {MAX_IMPORT_ROWS.toLocaleString()} data rows. Preview is capped and staging is disabled; split the source file first.</div> : null}

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Step 2</p><h2>Map columns</h2></div><span className={mapping.phone ? 'badge badge-success' : 'badge badge-warning'}>{mapping.phone ? 'Phone mapped' : 'Phone required'}</span></div>
            <div className="import-mapping-grid">
              <label><span>Phone number *</span><select value={mapping.phone} onChange={(event) => setMapping((current) => ({ ...current, phone: event.target.value }))}><option value="">Select column…</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>Full / display name</span><select value={mapping.displayName ?? ''} onChange={(event) => setMapping((current) => ({ ...current, displayName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>First name</span><select value={mapping.firstName ?? ''} onChange={(event) => setMapping((current) => ({ ...current, firstName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              <label><span>Last name</span><select value={mapping.lastName ?? ''} onChange={(event) => setMapping((current) => ({ ...current, lastName: optionalHeader(event.target.value) }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
            </div>
            <p className="muted-copy import-custom-note">Unmapped columns are preserved as staged custom fields. They are not discarded.</p>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Step 3</p><h2>Preview first {Math.min(preview.rows.length, 25)} rows</h2></div><button className="primary-button" type="button" disabled={busy || !mapping.phone || parsed.truncated || preview.rows.length === 0} onClick={() => void stageImport()}>{busy ? 'Staging…' : 'Stage import'}</button></div>
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
        <div className="panel-heading"><div><p className="eyebrow">Import history</p><h2>Staged files</h2></div><button className="secondary-button compact-button" type="button" disabled={loadingHistory || busy} onClick={() => void refreshHistory()}>Refresh</button></div>
        {loadingHistory ? <LoadingState label="Loading staged imports…" /> : imports.length === 0 ? (
          <EmptyState title="No staged imports">Upload the first CSV or XLSX file for {currentOrganization.name}. Staging does not create campaign recipients or send messages.</EmptyState>
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

      <section className="notice warning-notice">0.10 adds explicit recipient validation and immutable preview revisions. Imports with saved preview history are retained by the app; staging still does not create final contacts, apply consent/suppression rules, or send SMS.</section>
    </div>
  )
}
