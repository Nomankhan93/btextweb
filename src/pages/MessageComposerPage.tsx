import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { errorMessage } from '../lib/errors'
import {
  MESSAGE_TEMPLATE_MAX_CHARACTERS,
  analyzeMessageTemplate,
  builtInMessageTokens,
  discoverCustomFieldKeys,
  summarizePersonalization,
  type PersonalizationSourceRow,
} from '../lib/messageComposer'
import {
  SMS_LONG_MESSAGE_WARNING_SEGMENTS,
  estimatePersonalizedSmsUsage,
} from '../lib/smsSegments'
import {
  deleteMessageComposerDraft,
  getMessagePersonalizationSourceRows,
  listMessageComposerDrafts,
  listMessageComposerSources,
  saveMessageComposerDraft,
  type MessageComposerDraft,
  type MessageComposerSource,
} from '../lib/messageComposerApi'
import { useWorkspace } from '../workspace/WorkspaceProvider'

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function MessageComposerPage() {
  const { workspace } = useWorkspace()
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
  const canEdit = true

  const refresh = useCallback(async () => {
    if (!workspace) return
    setLoading(true)
    setError(null)
    try {
      const [nextSources, nextDrafts] = await Promise.all([
        listMessageComposerSources(workspace.id),
        listMessageComposerDrafts(workspace.id),
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
  }, [workspace, searchParams, selectedSnapshotId])

  useEffect(() => { void refresh() }, [workspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!workspace || !selectedSnapshotId) {
      setRows([])
      return
    }
    let cancelled = false
    setSourceLoading(true)
    setError(null)
    void getMessagePersonalizationSourceRows(workspace.id, selectedSnapshotId)
      .then((nextRows) => { if (!cancelled) setRows(nextRows) })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, 'Could not load personalization recipients.')) })
      .finally(() => { if (!cancelled) setSourceLoading(false) })
    return () => { cancelled = true }
  }, [workspace, selectedSnapshotId])

  const selectedSource = useMemo(
    () => sources.find((source) => source.eligibilitySnapshotId === selectedSnapshotId) ?? null,
    [sources, selectedSnapshotId],
  )
  const customKeys = useMemo(() => discoverCustomFieldKeys(rows), [rows])
  const analysis = useMemo(() => analyzeMessageTemplate(messageTemplate), [messageTemplate])
  const personalizationSummary = useMemo(() => summarizePersonalization(messageTemplate, rows), [messageTemplate, rows])
  const smsUsage = useMemo(() => estimatePersonalizedSmsUsage(messageTemplate, rows), [messageTemplate, rows])
  const previews = useMemo(() => smsUsage.recipients.slice(0, 8), [smsUsage])
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
    if (!workspace || !selectedSnapshotId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const savedId = await saveMessageComposerDraft({
        organizationId: workspace.id,
        draftId,
        eligibilitySnapshotId: selectedSnapshotId,
        title,
        messageTemplate,
      })
      setDraftId(savedId)
      setDrafts(await listMessageComposerDrafts(workspace.id))
      setMessage(hasRecipientProblem
        ? 'Draft saved. Some recipients still have missing personalization values; review them before confirming a campaign.'
        : 'Message draft saved. Nothing has been sent.')
    } catch (reason) {
      setError(errorMessage(reason, 'Could not save message draft.'))
    } finally {
      setBusy(false)
    }
  }

  async function removeDraft(id: string) {
    if (!workspace) return
    if (!window.confirm('Delete this message draft? Your prepared recipients and consent records will not change.')) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await deleteMessageComposerDraft(workspace.id, id)
      if (draftId === id) {
        setDraftId(null)
        setTitle('')
        setMessageTemplate('Hello {{name}}, ')
      }
      setDrafts(await listMessageComposerDrafts(workspace.id))
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
    if (sources.length === 0) {
      setMessage(null)
      setError('Prepare at least one eligible recipient list before starting a message draft.')
      return
    }
    setDraftId(null)
    setTitle('')
    setMessageTemplate('Hello {{name}}, ')
    setMessage('Started a new unsaved draft.')
  }

  if (!workspace) return null
  if (loading) return <LoadingState label="Loading message composer…" />

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading">
        <div>
          <p className="eyebrow">Message</p>
          <h1>Write a message</h1>
          <p>Write and personalize your SMS, preview the final text for recipients and review estimated SMS usage before confirming a campaign.</p>
        </div>
        {canEdit ? <button className="secondary-button compact-button" type="button" disabled={sources.length === 0} onClick={newDraft}>New draft</button> : null}
      </section>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      {sources.length === 0 ? (
        <EmptyState title="No recipients ready yet">Use <Link to="/campaigns/new">New campaign</Link> for the simple upload → message flow, or prepare recipients through the advanced tools.</EmptyState>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Recipients</p><h2>Ready recipient list</h2></div></div>
            <div className="form-grid composer-source-grid">
              <label className="field"><span>Recipient list</span><select value={selectedSnapshotId} onChange={(event) => chooseSnapshot(event.target.value)}>{sources.map((source) => <option key={source.eligibilitySnapshotId} value={source.eligibilitySnapshotId}>{source.sourceFilename} · {source.eligibleRows} ready</option>)}</select></label>
              <div className="definition-card"><span>Source</span><strong>{selectedSource?.sourceFilename ?? '—'}</strong><small>Prepared recipient source</small></div>
              <div className="definition-card"><span>Recipients</span><strong>{selectedSource?.eligibleRows ?? 0}</strong><small>Only recipients that passed the current checks are included.</small></div>
              <div className="definition-card"><span>Prepared</span><strong>{selectedSource ? dateTime(selectedSource.snapshotCreatedAt) : '—'}</strong><small>Recipient list ready for drafting</small></div>
            </div>
          </section>

          <section className="composer-grid">
            <div className="panel composer-editor-panel">
              <div className="panel-heading"><div><p className="eyebrow">Draft editor</p><h2>{draftId ? 'Edit message draft' : 'New message draft'}</h2></div>{draftId ? <span className="badge badge-success">Saved draft</span> : <span className="badge badge-muted">Unsaved</span>}</div>
              <label className="field"><span>Draft title</span><input maxLength={120} value={title} disabled={!canEdit} onChange={(event) => setTitle(event.target.value)} placeholder="October service reminder" /></label>
              <label className="field"><span>Message</span><textarea ref={textareaRef} rows={9} maxLength={MESSAGE_TEMPLATE_MAX_CHARACTERS} value={messageTemplate} disabled={!canEdit} onChange={(event) => setMessageTemplate(event.target.value)} placeholder="Hello {{name}}, your appointment is…" /><small>{messageTemplate.length} / {MESSAGE_TEMPLATE_MAX_CHARACTERS} template characters. Encoding and estimated SMS units update live below for every complete personalized recipient.</small></label>

              <div className="composer-token-section">
                <span className="field-label">Built-in variables</span>
                <div className="token-list">{builtInMessageTokens.map((token) => <button key={token} type="button" className="token-button" disabled={!canEdit} onClick={() => insertToken(token)}>{`{{${token}}}`}</button>)}</div>
              </div>
              <div className="composer-token-section">
                <span className="field-label">Custom import fields</span>
                {customKeys.length ? <div className="token-list">{customKeys.map((key) => <button key={key} type="button" className="token-button" disabled={!canEdit} onClick={() => insertToken(`custom:${key}`)}>{`{{custom:${key}}}`}</button>)}</div> : <p className="muted-copy">This recipient list has no custom import fields.</p>}
              </div>

              {analysis.malformed ? <div className="notice error-notice">Message contains unmatched or malformed <code>{'{{…}}'}</code> braces.</div> : null}
              {analysis.unsupportedTokens.length ? <div className="notice error-notice">Unsupported tokens: {analysis.unsupportedTokens.join(', ')}</div> : null}
              {unavailableCustomTokens.length ? <div className="notice warning-notice">These custom fields do not exist in the selected recipient snapshot: {unavailableCustomTokens.join(', ')}</div> : null}
              {hasRecipientProblem && !hasTemplateProblem ? <div className="notice warning-notice">{personalizationSummary.recipientsWithMissingValues} recipient(s) are missing at least one value used by this template. The preview below shows each missing token explicitly.</div> : null}

              {canEdit ? <div className="recipient-actions"><button className="primary-button" type="button" disabled={busy || !selectedSnapshotId || !title.trim() || !messageTemplate.trim() || hasTemplateProblem} onClick={() => void saveDraft()}>{busy ? 'Saving…' : draftId ? 'Update draft' : 'Save draft'}</button>{draftId && !hasTemplateProblem && !hasRecipientProblem && smsUsage.readyRecipients > 0 ? <Link className="secondary-button" to={`/campaigns/review/${draftId}`}>Review &amp; confirm</Link> : null}</div> : null}
            </div>

            <aside className="panel composer-summary-panel">
              <div className="panel-heading"><div><p className="eyebrow">Message readiness</p><h2>Live checks</h2></div></div>
              {sourceLoading ? <LoadingState label="Loading recipients…" /> : (
                <dl className="definition-grid composer-summary-grid">
                  <div><dt>Eligible recipients</dt><dd>{personalizationSummary.recipientCount}</dd></div>
                  <div><dt>Complete previews</dt><dd>{personalizationSummary.completeRecipients}</dd></div>
                  <div><dt>Missing values</dt><dd>{personalizationSummary.recipientsWithMissingValues}</dd></div>
                  <div><dt>Tokens used</dt><dd>{analysis.tokens.length}</dd></div>
                  <div><dt>Longest rendered text</dt><dd>{personalizationSummary.longestRenderedCharacters} chars</dd></div>
                  <div><dt>Estimated SMS units</dt><dd>{smsUsage.estimatedSmsUnits}</dd></div>
                </dl>
              )}
              <p className="muted-copy">A saved draft remains editable. Nothing is sent until a campaign is reviewed and confirmed.</p>
            </aside>
          </section>

          <section className="panel sms-usage-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">SMS usage estimate</p><h2>Estimated SMS usage</h2></div>
              <span className="badge badge-muted">Estimate only</span>
            </div>
            {sourceLoading ? <LoadingState label="Calculating SMS usage…" /> : (
              <>
                <div className="metric-grid sms-usage-metrics">
                  <article className="metric-card"><span>Estimated usage</span><h2>{smsUsage.estimatedSmsUnits} SMS unit{smsUsage.estimatedSmsUnits === 1 ? '' : 's'}</h2><p>Sum of personalized SMS segments for recipients whose message can be rendered completely.</p></article>
                  <article className="metric-card"><span>Encoding</span><h2>{smsUsage.encodingSummary}</h2><p>{smsUsage.gsm7Recipients} GSM-7 · {smsUsage.unicodeRecipients} Unicode recipient message{smsUsage.readyRecipients === 1 ? '' : 's'}.</p></article>
                  <article className="metric-card"><span>Average</span><h2>{smsUsage.averageSegments.toFixed(2)} segments</h2><p>Minimum {smsUsage.minimumSegments} · maximum {smsUsage.maximumSegments} segment{smsUsage.maximumSegments === 1 ? '' : 's'} per ready recipient.</p></article>
                  <article className="metric-card"><span>Ready recipients</span><h2>{smsUsage.readyRecipients} / {smsUsage.recipientCount}</h2><p>{smsUsage.blockedRecipients ? `${smsUsage.blockedRecipients} recipient(s) excluded because personalization is incomplete.` : 'Every eligible recipient has a complete rendered message.'}</p></article>
                </div>
                {smsUsage.blockedRecipients > 0 ? <div className="notice warning-notice">The estimate excludes {smsUsage.blockedRecipients} recipient(s) with missing or unsupported personalization. Resolve those values before confirming a campaign.</div> : null}
                {smsUsage.longMessageRecipients > 0 ? <div className="notice warning-notice">{smsUsage.longMessageRecipients} recipient message(s) are {SMS_LONG_MESSAGE_WARNING_SEGMENTS}+ SMS segments. Review unusually long personalized messages before confirmation.</div> : null}
                <p className="muted-copy">Estimated SMS usage only. GSM-7 extension characters consume extra encoding units, Unicode/Urdu has shorter segment limits, and your mobile operator determines actual package deduction and charges.</p>
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Recipient preview</p><h2>Rendered examples</h2></div><span className={hasRecipientProblem ? 'badge badge-warning' : 'badge badge-success'}>{hasRecipientProblem ? 'Needs review' : 'Complete'}</span></div>
            {sourceLoading ? <LoadingState label="Rendering personalization…" /> : previews.length === 0 ? <EmptyState title="No eligible recipients">The selected eligibility snapshot has no eligible rows.</EmptyState> : (
              <div className="message-preview-list">{previews.map((preview) => (
                <article className="message-preview-card" key={preview.row.eligibilityRowId}>
                  <div className="message-preview-meta"><strong>{preview.row.displayName ?? preview.row.normalizedE164}</strong><code>{preview.row.normalizedE164}</code><span className={preview.complete ? 'badge badge-success' : 'badge badge-warning'}>{preview.complete ? 'Complete' : 'Missing data'}</span>{preview.estimate ? <span className="badge badge-muted">{preview.estimate.encoding} · {preview.estimate.segments} SMS</span> : null}</div>
                  <p>{preview.text}</p>
                  {preview.estimate ? <small className="sms-preview-estimate">{preview.estimate.characters} characters · {preview.estimate.encodingUnits} encoding units · {preview.estimate.segments} estimated SMS unit{preview.estimate.segments === 1 ? '' : 's'}</small> : null}
                  {preview.missingTokens.length ? <small>Missing: {preview.missingTokens.join(', ')}</small> : null}
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
            <tr key={draft.draftId}><td><strong>{draft.title}</strong><small>{draft.messageTemplate.slice(0, 90)}{draft.messageTemplate.length > 90 ? '…' : ''}</small></td><td>{draft.sourceFilename}<small>{draft.eligibleRows} ready recipient{draft.eligibleRows === 1 ? '' : 's'}</small></td><td>{draft.templateVariables.length ? draft.templateVariables.join(', ') : 'None'}</td><td>{dateTime(draft.updatedAt)}</td><td><div className="recipient-actions"><button className="secondary-button compact-button" type="button" onClick={() => loadDraft(draft)}>Load</button>{canEdit ? <button className="text-button danger-text" type="button" disabled={busy} onClick={() => void removeDraft(draft.draftId)}>Delete</button> : null}</div></td></tr>
          ))}</tbody></table></div>
        )}
      </section>

      <section className="notice warning-notice">Nothing will be sent until you review and confirm a campaign. SMS usage is an estimate; your mobile operator determines actual package deduction and charges.</section>
    </div>
  )
}
