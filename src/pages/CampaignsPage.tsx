import { Link } from 'react-router-dom'
import { workflowRoutes } from '../lib/productNavigation'

const preparationSteps = [
  {
    step: '1',
    title: 'Add recipients',
    description: 'Upload a CSV or XLSX file, map the phone column and review invalid or duplicate numbers.',
    href: workflowRoutes.recipients,
    action: 'Upload recipients',
  },
  {
    step: '2',
    title: 'Check consent & opt-outs',
    description: 'Review whether each number is allowed to continue and keep do-not-send records up to date.',
    href: workflowRoutes.consent,
    action: 'Review eligibility',
  },
  {
    step: '3',
    title: 'Write the message',
    description: 'Personalize the SMS and review the estimated SMS units before campaign confirmation.',
    href: workflowRoutes.composer,
    action: 'Write message',
  },
] as const

export function CampaignsPage() {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Campaigns</p>
          <h1>Prepare a campaign</h1>
          <p>Build the recipient list and message now. Nothing is sent until a campaign can be reviewed and confirmed.</p>
        </div>
      </section>

      <section className="metric-grid dashboard-module-grid" aria-label="Campaign preparation">
        {preparationSteps.map((item) => (
          <article className="metric-card" key={item.step}>
            <span>Step {item.step}</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <Link className="primary-link" to={item.href}>{item.action}</Link>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Campaign status</p><h2>No confirmed campaigns yet</h2></div>
        </div>
        <p className="muted-copy">Campaign confirmation is not enabled yet. Your recipient preparation and message drafts remain editable until that workflow is added.</p>
      </section>

      <section className="notice warning-notice">Nothing will be sent from these preparation steps.</section>
    </div>
  )
}
