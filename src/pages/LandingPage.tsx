import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandLockup } from '../components/BrandLockup'
import { usePwa } from '../pwa/PwaProvider'

function FeatureIcon({ kind }: { kind: 'campaign' | 'contacts' | 'sim' | 'device' | 'delivery' | 'sync' }) {
  if (kind === 'campaign') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM7 9h10M7 13h7" /></svg>
  if (kind === 'contacts') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-4 2.5-6 5.5-6s5 2 5.5 6M15 7h5M15 11h5M17.5 15v5M15 17.5h5" /></svg>
  if (kind === 'sim') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7zM10 10h5v7h-5zM10 13h5M12.5 10v7" /></svg>
  if (kind === 'device') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.3"/><path d="M10 5.5h4M10.5 18.5h3" /></svg>
  if (kind === 'delivery') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM7 10l3 3 7-7M7 17h10" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8a6 6 0 0 1 10.8-1.8L20 9M17.5 16a6 6 0 0 1-10.8 1.8L4 15M20 4v5h-5M4 20v-5h5" /></svg>
}

const featureCards = [
  { kind: 'campaign' as const, title: 'Campaign Messaging', copy: 'Prepare, review and send business SMS campaigns from one focused workspace.' },
  { kind: 'contacts' as const, title: 'Recipient & CSV/Excel Import', copy: 'Import recipient files, validate phone numbers and review the exact audience before sending.' },
  { kind: 'sim' as const, title: 'Exact SIM1 / SIM2 Routing', copy: 'Choose the exact paired Android phone and SIM that BulkText is allowed to use.' },
  { kind: 'device' as const, title: 'Android Device Management', copy: 'Pair gateway phones, inspect SIM readiness and keep device inventory visible from the web.' },
  { kind: 'delivery' as const, title: 'Delivery & Recovery Tracking', copy: 'Follow queued, downloaded, sent, delivered, failed and recovery states without hiding uncertainty.' },
  { kind: 'sync' as const, title: 'Background Gateway Sync', copy: 'Keep cloud queue and phone status synchronized while preserving strict no-duplicate send rules.' },
]

const faqs = [
  {
    question: 'Does BulkText require a third-party SMS gateway?',
    answer: 'No. BulkText coordinates sending through your paired Android phone and the exact SIM you select. The web workspace still uses the internet to coordinate the queue and live status.',
  },
  {
    question: 'Does BulkText make SMS free?',
    answer: 'BulkText avoids a third-party per-message gateway fee. Your mobile carrier balance, bundle or plan still applies, alongside your BulkText subscription when commercial plans are introduced.',
  },
  {
    question: 'Can I choose SIM1 or SIM2?',
    answer: 'Yes. BulkText is designed around explicit phone and SIM selection rather than silently falling back to another SIM.',
  },
  {
    question: 'What happens if the phone or browser loses connectivity?',
    answer: 'Sending and live gateway actions require connectivity. The installed web app can reopen its cached shell and preserve supported drafts, while send, recovery and live status actions remain blocked until the connection returns.',
  },
]

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { canInstall, install } = usePwa()

  function closeMenu() {
    setMenuOpen(false)
  }

  async function installApp() {
    closeMenu()
    await install()
  }

  return (
    <div className="marketing-site">
      <header className="marketing-header">
        <div className="marketing-nav-shell">
          <BrandLockup compact />
          <button
            className="marketing-menu-button"
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="marketing-navigation"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>
          <nav id="marketing-navigation" className={menuOpen ? 'marketing-navigation open' : 'marketing-navigation'} aria-label="Public navigation">
            <a href="#features" onClick={closeMenu}>Features</a>
            <a href="#how-it-works" onClick={closeMenu}>How it works</a>
            <a href="#why-bulktext" onClick={closeMenu}>Why BulkText</a>
            <a href="#faq" onClick={closeMenu}>FAQ</a>
            {canInstall ? <button className="marketing-install-link" type="button" onClick={() => void installApp()}>Install App</button> : null}
            <Link className="marketing-signin-link" to="/auth/login" onClick={closeMenu}>Sign in</Link>
            <Link className="marketing-primary-link" to="/auth/signup" onClick={closeMenu}>Get Started</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="marketing-hero" aria-labelledby="hero-title">
          <div className="marketing-section marketing-hero-grid">
            <div className="marketing-hero-copy">
              <p className="marketing-kicker">Your SIM. Your Messages. Your Reach.</p>
              <h1 id="hero-title">Send business SMS directly from your own SIM</h1>
              <p className="marketing-lead">Manage recipients, campaigns, Android gateway devices, exact SIM routing and delivery status from one simple workspace—without a third-party SMS gateway.</p>
              <div className="marketing-hero-actions">
                <Link className="marketing-primary-cta" to="/auth/signup">Get Started</Link>
                <a className="marketing-secondary-cta" href="#how-it-works">See How It Works</a>
              </div>
              <div className="marketing-trust-row" aria-label="Key benefits">
                <span>Own SIM &amp; carrier bundle</span>
                <span>Dual-SIM routing</span>
                <span>Live send and delivery status</span>
              </div>
            </div>

            <div className="dashboard-showcase" aria-label="BulkText dashboard preview">
              <div className="showcase-browser-bar"><span></span><span></span><span></span><strong>BulkText Dashboard</strong></div>
              <div className="showcase-app-shell">
                <aside>
                  <div className="showcase-mini-brand"><img src="/icons/icon-192.png" alt="" /><span>BulkText</span></div>
                  <b>Dashboard</b><span>Campaigns</span><span>Phone &amp; SIM</span><span>Tools</span>
                </aside>
                <div className="showcase-main">
                  <div className="showcase-heading"><div><small>Campaign overview</small><h2>October Offers</h2></div><span className="showcase-ready">Gateway ready</span></div>
                  <div className="showcase-metrics">
                    <div><small>Recipients</small><strong>1,284</strong></div>
                    <div><small>Sent</small><strong>1,271</strong></div>
                    <div><small>Delivered</small><strong>1,243</strong></div>
                    <div><small>Needs review</small><strong>28</strong></div>
                  </div>
                  <div className="showcase-progress">
                    <div><span>Queued</span><strong>1,284</strong></div>
                    <div><span>Downloaded</span><strong>1,284</strong></div>
                    <div><span>Sent</span><strong>1,271</strong></div>
                    <div><span>Delivered</span><strong>1,243</strong></div>
                  </div>
                  <div className="showcase-device-row"><span><b>Android Gateway</b><small>Galaxy A54 · SIM 1</small></span><span className="showcase-device-pill">Online</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-value-strip" aria-label="BulkText advantages">
          <div className="marketing-section value-grid">
            <article><strong>Use your own SIM</strong><span>Send through your Android phone and mobile carrier.</span></article>
            <article><strong>No third-party gateway fee</strong><span>Use your existing SIM balance or carrier bundle.</span></article>
            <article><strong>Exact SIM routing</strong><span>Select the specific phone and SIM used for sending.</span></article>
            <article><strong>Track every campaign</strong><span>Follow queue, send, delivery and recovery states.</span></article>
          </div>
        </section>

        <section id="how-it-works" className="marketing-block marketing-section-anchor">
          <div className="marketing-section">
            <div className="marketing-section-heading">
              <p className="marketing-kicker">How it works</p>
              <h2>Connect, prepare, send and track</h2>
              <p>BulkText keeps the web workspace simple while the Android companion app acts as the messaging gateway for your selected SIM.</p>
            </div>
            <div className="workflow-grid">
              <article><span>01</span><h3>Connect Android Gateway</h3><p>Pair your phone securely and confirm the available SIM inventory.</p></article>
              <article><span>02</span><h3>Create &amp; review campaign</h3><p>Import recipients, compose the message and confirm the exact send snapshot.</p></article>
              <article><span>03</span><h3>Send through your SIM</h3><p>Authorize the exact Android phone and SIM. BulkText does not silently switch routing.</p></article>
              <article><span>04</span><h3>Track live status</h3><p>Follow queued, downloaded, sent, delivered, failed and recovery outcomes.</p></article>
            </div>
          </div>
        </section>

        <section id="features" className="marketing-block marketing-block-soft marketing-section-anchor">
          <div className="marketing-section">
            <div className="marketing-section-heading">
              <p className="marketing-kicker">Core features</p>
              <h2>One workspace for SIM-powered messaging operations</h2>
              <p>Campaign preparation, exact device routing and operational status stay visible without hiding the Android gateway underneath.</p>
            </div>
            <div className="feature-grid">
              {featureCards.map((feature) => (
                <article key={feature.title} className="feature-card">
                  <div className="feature-icon"><FeatureIcon kind={feature.kind} /></div>
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-block">
          <div className="marketing-section dashboard-detail-grid">
            <div className="marketing-section-heading left-aligned">
              <p className="marketing-kicker">Product visibility</p>
              <h2>See the sending workflow without digging through technical screens</h2>
              <p>BulkText separates the customer-facing campaign story from deeper diagnostics while keeping queue, phone, SIM and recovery evidence available when you need it.</p>
              <ul className="marketing-check-list">
                <li>Campaign and recipient overview</li>
                <li>Exact phone and SIM selection</li>
                <li>Queued, sent and delivered states kept distinct</li>
                <li>Technical diagnostics available without dominating the workflow</li>
              </ul>
            </div>
            <div className="product-panel-preview">
              <div className="product-panel-title"><span>Campaign progress</span><b>Live send and delivery status</b></div>
              <div className="product-status-row"><span>Queued</span><strong>1,284</strong><i style={{ width: '100%' }} /></div>
              <div className="product-status-row"><span>Downloaded by phone</span><strong>1,284</strong><i style={{ width: '100%' }} /></div>
              <div className="product-status-row"><span>Sent</span><strong>1,271</strong><i style={{ width: '98%' }} /></div>
              <div className="product-status-row"><span>Delivered</span><strong>1,243</strong><i style={{ width: '96%' }} /></div>
              <small>Delivery evidence depends on device and network callbacks. BulkText keeps unknown and recovery states separate rather than guessing.</small>
            </div>
          </div>
        </section>

        <section id="why-bulktext" className="marketing-block marketing-block-soft marketing-section-anchor">
          <div className="marketing-section">
            <div className="marketing-section-heading">
              <p className="marketing-kicker">Why BulkText</p>
              <h2>Your own SIM infrastructure, with a modern web control plane</h2>
            </div>
            <div className="comparison-table" role="table" aria-label="Traditional hosted SMS gateway compared with BulkText">
              <div className="comparison-row comparison-head" role="row"><span role="columnheader">Traditional hosted SMS gateway</span><span role="columnheader">BulkText</span></div>
              <div className="comparison-row" role="row"><span role="cell"><b className="comparison-mobile-label">Traditional gateway</b>Provider sends messages through its infrastructure</span><span role="cell"><b className="comparison-mobile-label">BulkText</b>Your paired Android phone sends through your selected SIM</span></div>
              <div className="comparison-row" role="row"><span role="cell"><b className="comparison-mobile-label">Traditional gateway</b>Provider per-message gateway pricing</span><span role="cell"><b className="comparison-mobile-label">BulkText</b>Your carrier balance or bundle, without a third-party per-message gateway fee</span></div>
              <div className="comparison-row" role="row"><span role="cell"><b className="comparison-mobile-label">Traditional gateway</b>Provider-controlled routing</span><span role="cell"><b className="comparison-mobile-label">BulkText</b>Exact phone + SIM routing selected in BulkText</span></div>
              <div className="comparison-row" role="row"><span role="cell"><b className="comparison-mobile-label">Traditional gateway</b>Provider-specific delivery model</span><span role="cell"><b className="comparison-mobile-label">BulkText</b>Android gateway callbacks with explicit delivery and recovery states</span></div>
            </div>
          </div>
        </section>

        <section className="marketing-block gateway-section">
          <div className="marketing-section gateway-grid">
            <div className="gateway-phone-visual" aria-hidden="true">
              <div className="gateway-phone-speaker"></div>
              <img src="/icons/icon-192.png" alt="" />
              <strong>Android Gateway</strong>
              <span>SIM 1 · Ready</span>
              <div className="gateway-signal-lines"><i></i><i></i><i></i><i></i></div>
            </div>
            <div className="marketing-section-heading left-aligned">
              <p className="marketing-kicker">Android Gateway</p>
              <h2>Turn your Android phone into your SMS gateway</h2>
              <p>Pair your Android device with BulkText, choose the exact SIM, and securely dispatch approved campaigns from the web workspace through your phone.</p>
              <div className="gateway-flow" aria-label="BulkText gateway flow">
                <span>BulkText Web</span><b>→</b><span>Secure cloud queue</span><b>→</b><span>Android Gateway</span><b>→</b><span>SIM 1 / SIM 2</span>
              </div>
              <p className="gateway-note">The web app coordinates the workflow. The paired Android device and selected SIM perform the actual SMS sending.</p>
            </div>
          </div>
        </section>

        <section id="faq" className="marketing-block marketing-block-soft marketing-section-anchor">
          <div className="marketing-section faq-grid">
            <div className="marketing-section-heading left-aligned">
              <p className="marketing-kicker">FAQ</p>
              <h2>Questions before you connect a phone</h2>
              <p>BulkText keeps the business model straightforward: your SIM sends the messages, while the web app manages campaigns and gateway operations.</p>
            </div>
            <div className="faq-list">
              {faqs.map((item) => (
                <details key={item.question} className="faq-item">
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-final-cta">
          <div className="marketing-section final-cta-inner">
            <div>
              <p className="marketing-kicker">Your SIM. Your Messages. Your Reach.</p>
              <h2>Turn your SIM into your business messaging gateway</h2>
              <p>Create your BulkText account, pair an Android phone and keep exact SIM routing under your control.</p>
            </div>
            <div className="final-cta-actions">
              <Link className="marketing-primary-cta" to="/auth/signup">Create Your Account</Link>
              <Link className="marketing-secondary-dark" to="/auth/login">Sign In</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div className="marketing-section marketing-footer-grid">
          <div>
            <BrandLockup compact showTagline />
            <p>SIM-powered business messaging through the Android phone and exact SIM you control.</p>
          </div>
          <nav aria-label="Footer product links">
            <strong>Product</strong>
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#why-bulktext">Why BulkText</a>
            <a href="#faq">FAQ</a>
          </nav>
          <nav aria-label="Footer account links">
            <strong>Account</strong>
            <Link to="/auth/login">Sign in</Link>
            <Link to="/auth/signup">Create account</Link>
          </nav>
        </div>
        <div className="marketing-section marketing-footer-bottom">© BulkText. Your carrier balance or bundle applies to SMS sent through your SIM.</div>
      </footer>
    </div>
  )
}
