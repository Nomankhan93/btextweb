import type { ReactNode } from 'react'

type StateProps = {
  title: string
  children: ReactNode
  action?: ReactNode
}

function StateCard({ title, children, action }: StateProps) {
  return (
    <section className="state-card" aria-live="polite">
      <h2>{title}</h2>
      <div>{children}</div>
      {action ? <div className="state-action">{action}</div> : null}
    </section>
  )
}

export function EmptyState({ title, children, action }: StateProps) {
  return <StateCard title={title} action={action}>{children}</StateCard>
}

export function ErrorState({ title, children, action }: StateProps) {
  return <StateCard title={title} action={action}>{children}</StateCard>
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-label={label}>
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
