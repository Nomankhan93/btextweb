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
      <EmptyState title={`${title} is intentionally not active yet`}>
        This route is present so navigation and responsive layout can be validated without prematurely implementing later-roadmap features.
      </EmptyState>
    </div>
  )
}
