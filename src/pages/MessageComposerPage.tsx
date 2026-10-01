import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { errorMessage } from '../lib/errors'
import {
  MESSAGE_TEMPLATE_MAX_CHARACTERS,
  analyzeMessageTemplate,
  builtInMessageTokens,
  discoverCustomFieldKeys,
  renderPersonalizedMessage,
  summarizePersonalization,
  type PersonalizationSourceRow,
} from '../lib/messageComposer'
import {
  deleteMessageComposerDraft,
  getMessagePersonalizationSourceRows,
  listMessageComposerDrafts,
  listMessageComposerSources,
  saveMessageComposerDraft,
  type MessageComposerDraft,
  type MessageComposerSource,
} from '../lib/messageComposerApi'
import { canManageCampaigns } from '../lib/rbac'
import { useOrganizations } from '../organizations/OrganizationProvider'

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

export function MessageComposerPage() {
  const { currentOrganization } = useOrganizations()
  const [searchParams, setSearchParams] = useSearchParams()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [sources, setSources] = useState<MessageComposerSource[]>([])
  const [drafts, setDrafts] = useState<MessageComposerDraft[]>([])
  const [rows, setRows] = useState<PersonalizationSourceRow[]>([])
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [messageTemplate, setMessageTemplate] = useState('Hello {{name}}, ')
  const [loading, setLoading] = useState(true)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const canEdit = canManageCampaigns(currentOrganization?.role)

  const refresh = useCallback(async () => {
    if (!currentOrganization) return
    setLoading(true)
    setError(null)
    try {
      const [nextSources, nextDrafts] = await Promise.all([
        listMessageComposerSources(currentOrganization.id),
        listMessageComposerDrafts(currentOrganization.id),
      ])
      setSources(nextSources)
      setDrafts(nextDrafts)
      const requested = searchParams.get('snapshot')
      const currentStillValid = selectedSnapshotId && nextSources.some((source) => source.eligibilitySnapshotId === selectedSnapshotId)
      const nextSnapshot = requested && nextSources.some((source) => source.eligibilitySnapshotId === requested)
        ? requested
        : currentStillValid
          ? selectedSnapshotId
          : nextSources[0]?.eligibilitySnapshotId ?? ''
      setSelectedSnapshotId(nextSnapshot)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not load the message composer.'))
    } finally {
      setLoading(false)
    }
  }, [currentOrganization, searchParams, selectedSnapshotId])

  useEffect(() => { void refresh() }, [currentOrganization?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentOrganization || !selectedSnapshotId) {
      setRows([])
      return
    }
    let cancelled = false
    setSourceLoading(true)
    setError(null)
    void getMessagePersonalizationSourceRows(currentOrganization.id, selectedSnapshotId)
      .then((nextRows) => { if (!cancelled) setRows(nextRows) })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, 'Could not load personalization recipients.')) })
      .finally(() => { if (!cancelled) setSourceLoading(false) })
    return () => { cancelled = true }
  }, [currentOrganization, selectedSnapshotId])

  const selectedSource = useMemo(
    () => sources.find((source) => source.eligibilitySnapshotId === selectedSnapshotId) ?? null,
    [sources, selectedSnapshotId],
  )
  const customKeys = useMemo(() => discoverCustomFieldKeys(rows), [rows])
  const analysis = useMemo(() => analyzeMessageTemplate(messageTemplate), [messageTemplate])
  const personalizationSummary = useMemo(() => summarizePersonalization(messageTemplate, rows), [messageTemplate, rows])
  const previews = useMemo(
    () => rows.slice(0, 8).map((row) => ({ row, rendered: renderPersonalizedMessage(messageTemplate, row) })),
    [messageTemplate, rows],
  )
  const customTokenSet = useMemo(() => new Set(customKeys.map((key) => `custom:${key}`)), [customKeys])
  const unavailableCustomTokens = analysis.tokens.filter((token) => token.startsWith('custom:') && !customTokenSet.has(token))
  const hasTemplateProblem = analysis.malformed || analysis.unsupportedTokens.length > 0 || unavailableCustomTokens.length > 0
  const hasRecipientProblem = personalizationSummary.recipientsWithMissingValues > 0

  function chooseSnapshot(value: string) {
    setSelectedSnapshotId(value)
    setDraftId(null)
    setMessage(null)
    setSearchParams(value ? { snapshot: value } : {})
  }

  function insertToken(token: string) {
    const textarea = textareaRef.current
    const insertion = `{{${token}}}`
    if (!textarea) {
      setMessageTemplate((value) => `${value}${insertion}`)
      return
    }
    const start = textarea.selectionStart ?? messageTemplate.length
    const end = textarea.selectionEnd ?? start
    const next = `${messageTemplate.slice(0, start)}${insertion}${messageTemplate.slice(end)}`
    setMessageTemplate(next)
    queueMicrotask(() => {
      textarea.focus()
      const cursor = start + insertion.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  async function saveDraft() {
    if (!currentOrganization || !selectedSnapshotId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const savedId = await saveMessageComposerDraft({
        organizationId: currentOrganization.id,
        draftId,
        eligibilitySnapshotId: selectedSnapshotId,
        title,
        messageTemplate,
      })
      setDraftId(savedId)
      setDrafts(await listMessageComposerDrafts(currentOrganization.id))
      setMessage(hasRecipientProblem
        ? 'Draft saved. Some eligible recipients still have missing personalization values; review them before later campaign confirmation.'
        : 'Message draft saved. No SMS was queued or sent.')
    } catch (reason) {
      setError(errorMessage(reason, 'Could not save message draft.'))
    } finally {
      setBusy(false)
    }
  }

  async function removeDraft(id: string) {
    if (!currentOrganization) return
    if (!window.confirm('Delete this message draft? This does not change recipient or consent snapshots.')) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await deleteMessageComposerDraft(currentOrganization.id, id)
      if (draftId === id) {
        setDraftId(null)
        setTitle('')
        setMessageTemplate('Hello {{name}}, ')
      }
      setDrafts(await listMessageComposerDrafts(currentOrganization.id))
      setMessage('Message draft deleted.')
    } catch (reason) {
      setError(errorMessage(reason, 'Could not delete message draft.'))
    } finally {
      setBusy(false)
    }
  }

  function loadDraft(draft: MessageComposerDraft) {
    setDraftId(draft.draftId)
    setSelectedSnapshotId(draft.eligibilitySnapshotId)
    setTitle(draft.title)
    setMessageTemplate(draft.messageTemplate)
    setSearchParams({ snapshot: draft.eligibilitySnapshotId, draft: draft.draftId })
    setMessage(`Loaded “${draft.title}”.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function newDraft() {
    setDraftId(null)
    setTitle('')
    setMessageTemplate('Hello {{name}}, ')
    setMessage('Started a new unsaved draft.')
  }

  if (!currentOrganization) return null
  if (loading) return <LoadingState label="Loading message composer…" />

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading">
        <div>
          <p className="eyebrow">BulkText 0.12</p>
          <h1>Message Composer & Personalization</h1>
          <p>Draft one message template against an immutable eligible-recipient snapshot, insert recipient variables, and preview exactly where personalization data is missing before campaign confirmation exists.</p>
        </div>
        {canEdit ? <button className="secondary-button compact-button" type="button" onClick={newDraft}>New draft</button> : null}
      </section>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      {sources.length === 0 ? (
        <EmptyState title="No eligible recipient snapshot yet">Create a recipient preview, record consent/suppression state, then create an eligibility snapshot with at least one eligible recipient before composing a message.</EmptyState>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Recipient source</p><h2>Immutable eligibility snapshot</h2></div><span className="badge badge-muted">bulktext-template-v1</span></div>
            <div className="form-grid composer-source-grid">
              <label className="field"><span>Eligible recipient snapshot</span><select value={selectedSnapshotId} onChange={(event) => chooseSnapshot(event.target.value)}>{sources.map((source) => <option key={source.eligibilitySnapshotId} value={source.eligibilitySnapshotId}>{source.sourceFilename} · eligibility #{source.eligibilityRevision} · {source.eligibleRows} eligible</option>)}</select></label>
              <div className="definition-card"><span>Source</span><strong>{selectedSource?.sourceFilename ?? '—'}</strong><small>Preview #{selectedSource?.previewRevision ?? '—'} · eligibility #{selectedSource?.eligibilityRevision ?? '—'}</small></div>
              <div className="definition-card"><span>Recipients</span><strong>{selectedSource?.eligibleRows ?? 0}</strong><small>Only rows frozen as eligible are exposed to the composer.</small></div>
              <div className="definition-card"><span>Snapshot</span><strong>{selectedSource ? shortId(selectedSource.eligibilitySnapshotId) : '—'}</strong><small>{selectedSource ? dateTime(selectedSource.snapshotCreatedAt) : '—'}</small></div>
            </div>
          </section>

          <section className="composer-grid">
            <div className="panel composer-editor-panel">
              <div className="panel-heading"><div><p className="eyebrow">Draft editor</p><h2>{draftId ? 'Edit message draft' : 'New message draft'}</h2></div>{draftId ? <span className="badge badge-success">Saved draft</span> : <span className="badge badge-muted">Unsaved</span>}</div>
              {!canEdit ? <div className="notice warning-notice">Your role can inspect message drafts and personalization previews, but only Owner, Admin and Campaign Manager can save or delete drafts.</div> : null}
              <label className="field"><span>Draft title</span><input maxLength={120} value={title} disabled={!canEdit} onChange={(event) => setTitle(event.target.value)} placeholder="October service reminder" /></label>
              <label className="field"><span>Message</span><textarea ref={textareaRef} rows={9} maxLength={MESSAGE_TEMPLATE_MAX_CHARACTERS} value={messageTemplate} disabled={!canEdit} onChange={(event) => setMessageTemplate(event.target.value)} placeholder="Hello {{name}}, your appointment is…" /><small>{messageTemplate.length} / {MESSAGE_TEMPLATE_MAX_CHARACTERS} template characters. SMS encoding and segment count arrive in 0.13.</small></label>

              <div className="composer-token-section">
                <span className="field-label">Built-in variables</span>
                <div className="token-list">{builtInMessageTokens.map((token) => <button key={token} type="button" className="token-button" disabled={!canEdit} onClick={() => insertToken(token)}>{`{{${token}}}`}</button>)}</div>
              </div>
              <div className="composer-token-section">
                <span className="field-label">Custom import fields</span>
                {customKeys.length ? <div className="token-list">{customKeys.map((key) => <button key={key} type="button" className="token-button" disabled={!canEdit} onClick={() => insertToken(`custom:${key}`)}>{`{{custom:${key}}}`}</button>)}</div> : <p className="muted-copy">This eligible snapshot has no custom import fields.</p>}
              </div>

              {analysis.malformed ? <div className="notice error-notice">Message contains unmatched or malformed <code>{'{{…}}'}</code> braces.</div> : null}
              {analysis.unsupportedTokens.length ? <div className="notice error-notice">Unsupported tokens: {analysis.unsupportedTokens.join(', ')}</div> : null}
              {unavailableCustomTokens.length ? <div className="notice warning-notice">These custom fields do not exist in the selected recipient snapshot: {unavailableCustomTokens.join(', ')}</div> : null}
              {hasRecipientProblem && !hasTemplateProblem ? <div className="notice warning-notice">{personalizationSummary.recipientsWithMissingValues} recipient(s) are missing at least one value used by this template. The preview below shows each missing token explicitly.</div> : null}

              {canEdit ? <div className="recipient-actions"><button className="primary-button" type="button" disabled={busy || !selectedSnapshotId || !title.trim() || !messageTemplate.trim() || hasTemplateProblem} onClick={() => void saveDraft()}>{busy ? 'Saving…' : draftId ? 'Update draft' : 'Save draft'}</button></div> : null}
            </div>

            <aside className="panel composer-summary-panel">
              <div className="panel-heading"><div><p className="eyebrow">Personalization readiness</p><h2>Live checks</h2></div></div>
              {sourceLoading ? <LoadingState label="Loading recipients…" /> : (
                <dl className="definition-grid composer-summary-grid">
                  <div><dt>Eligible recipients</dt><dd>{personalizationSummary.recipientCount}</dd></div>
                  <div><dt>Complete previews</dt><dd>{personalizationSummary.completeRecipients}</dd></div>
                  <div><dt>Missing values</dt><dd>{personalizationSummary.recipientsWithMissingValues}</dd></div>
                  <div><dt>Tokens used</dt><dd>{analysis.tokens.length}</dd></div>
                  <div><dt>Longest rendered text</dt><dd>{personalizationSummary.longestRenderedCharacters} chars</dd></div>
                  <div><dt>Segment estimate</dt><dd>0.13</dd></div>
                </dl>
              )}
              <p className="muted-copy">A saved 0.12 draft is editable. It is not an immutable campaign confirmation and cannot queue or send SMS.</p>
            </aside>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Recipient preview</p><h2>Rendered examples</h2></div><span className={hasRecipientProblem ? 'badge badge-warning' : 'badge badge-success'}>{hasRecipientProblem ? 'Needs review' : 'Complete'}</span></div>
            {sourceLoading ? <LoadingState label="Rendering personalization…" /> : previews.length === 0 ? <EmptyState title="No eligible recipients">The selected eligibility snapshot has no eligible rows.</EmptyState> : (
              <div className="message-preview-list">{previews.map(({ row, rendered }) => (
                <article className="message-preview-card" key={row.eligibilityRowId}>
                  <div className="message-preview-meta"><strong>{row.displayName ?? row.normalizedE164}</strong><code>{row.normalizedE164}</code><span className={rendered.complete ? 'badge badge-success' : 'badge badge-warning'}>{rendered.complete ? 'Complete' : 'Missing data'}</span></div>
                  <p>{rendered.text}</p>
                  {rendered.missingTokens.length ? <small>Missing: {rendered.missingTokens.join(', ')}</small> : null}
                </article>
              ))}</div>
            )}
            {rows.length > previews.length ? <p className="muted-copy">Showing the first {previews.length} of {rows.length} eligible recipients. Readiness totals above evaluate the full snapshot.</p> : null}
          </section>
        </>
      )}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Saved work</p><h2>Message drafts</h2></div><span className="badge badge-muted">Editable</span></div>
        {drafts.length === 0 ? <EmptyState title="No message drafts">Save a personalized message draft to continue it later.</EmptyState> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Draft</th><th>Recipient source</th><th>Variables</th><th>Updated</th><th /></tr></thead><tbody>{drafts.map((draft) => (
            <tr key={draft.draftId}><td><strong>{draft.title}</strong><small>{draft.messageTemplate.slice(0, 90)}{draft.messageTemplate.length > 90 ? '…' : ''}</small></td><td>{draft.sourceFilename}<small>Eligibility #{draft.eligibilityRevision} · {draft.eligibleRows} eligible</small></td><td>{draft.templateVariables.length ? draft.templateVariables.join(', ') : 'None'}</td><td>{dateTime(draft.updatedAt)}</td><td><div className="recipient-actions"><button className="secondary-button compact-button" type="button" onClick={() => loadDraft(draft)}>Load</button>{canEdit ? <button className="text-button danger-text" type="button" disabled={busy} onClick={() => void removeDraft(draft.draftId)}>Delete</button> : null}</div></td></tr>
          ))}</tbody></table></div>
        )}
      </section>

      <section className="notice warning-notice">0.12 drafts and personalization previews do not calculate SMS units, confirm a campaign, schedule delivery, create queue jobs, contact the Android gateway, or send messages.</section>
    </div>
  )
}
