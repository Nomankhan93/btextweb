import type { PropsWithChildren, ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function AuthLayout({ title, subtitle, children, footer }: PropsWithChildren<{ title: string; subtitle: string; footer?: ReactNode }>) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="auth-brand" to="/">
          <span className="brand-mark" aria-hidden="true">BT</span>
          <span><strong>BulkText</strong><small>SIM-powered business messaging</small></span>
        </Link>
        <div className="auth-heading">
          <p className="eyebrow">BulkText 0.7</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </section>
    </main>
  )
}
