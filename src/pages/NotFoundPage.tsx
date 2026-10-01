import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="standalone-page">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>The requested BulkText route does not exist.</p>
      <Link className="primary-link" to="/dashboard">Return to dashboard</Link>
    </main>
  )
}
