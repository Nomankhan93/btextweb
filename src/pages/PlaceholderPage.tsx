import { EmptyState } from '../components/StateViews'

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">BulkText</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>
      <EmptyState title={`${title} is coming later`}>
        This feature is not available yet. You can continue using the active campaign preparation tools from the Campaigns page.
      </EmptyState>
    </div>
  )
}
