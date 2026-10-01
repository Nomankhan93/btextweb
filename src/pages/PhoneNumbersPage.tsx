import { useMemo, useState } from 'react'
import { normalizePhoneNumberLines } from '../lib/phoneNumbers'

const sampleNumbers = `03001234567
+92 311 123 4567
0092 322 555 0199
02134567890
+1 415 555 2671`

export function PhoneNumbersPage() {
  const [input, setInput] = useState(sampleNumbers)
  const rows = useMemo(() => normalizePhoneNumberLines(input), [input])
  const valid = rows.filter((row) => row.validationStatus === 'valid')
  const unique = new Set(valid.map((row) => row.normalizedE164)).size
  const invalid = rows.length - valid.length

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">BulkText 0.8</p>
          <h1>Phone Number Foundation</h1>
          <p>Normalize Pakistan mobile numbers into one canonical E.164 format before import, deduplication, suppression and campaign validation. This preview runs locally in the browser and does not save contact data.</p>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card"><span>Input</span><h2>{rows.length}</h2><p>Non-empty rows currently being evaluated.</p></article>
        <article className="metric-card"><span>Valid</span><h2>{valid.length}</h2><p>Rows normalized to canonical +923xxxxxxxxx.</p></article>
        <article className="metric-card"><span>Unique</span><h2>{unique}</h2><p>Unique canonical values; duplicate removal is enforced in a later validation phase.</p></article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Normalization lab</p><h2>Paste one number per line</h2></div>
          <span className={invalid ? 'badge badge-warning' : 'badge badge-success'}>{invalid ? `${invalid} needs review` : 'All valid'}</span>
        </div>
        <div className="phone-lab-grid">
          <label className="phone-input-label">
            <span>Raw phone numbers</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={12} spellCheck={false} placeholder="03001234567" />
          </label>
          <div className="phone-rules-card">
            <strong>0.8 rules</strong>
            <ul>
              <li>Current country scope: Pakistan (PK).</li>
              <li>Current number type: mobile only.</li>
              <li>Accepted examples: 03xx, 923xx, +923xx and 00923xx.</li>
              <li>Canonical storage format: +923xxxxxxxxx.</li>
              <li>No carrier is inferred from the prefix.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Preview</p><h2>Canonicalization results</h2></div><span className="badge badge-muted">pk-mobile-v1</span></div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="data-table phone-preview-table">
              <thead><tr><th>Input</th><th>Status</th><th>Canonical E.164</th><th>Reason</th></tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.rawInput}-${index}`}>
                    <td><code>{row.rawInput}</code></td>
                    <td><span className={row.validationStatus === 'valid' ? 'badge badge-success' : 'badge badge-warning'}>{row.validationStatus.replaceAll('_', ' ')}</span></td>
                    <td><code>{row.normalizedE164 ?? '—'}</code></td>
                    <td>{row.validationReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted-copy">Paste numbers above to preview normalization.</p>}
      </section>

      <section className="notice warning-notice">
        Phone Number Foundation does not create contacts, import files, check consent/suppression, or send messages. Those controls remain gated to later roadmap phases.
      </section>
    </div>
  )
}
