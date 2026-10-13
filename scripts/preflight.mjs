import { access, readFile } from 'node:fs/promises'
import process from 'node:process'

const requiredFiles = [
  'src/lib/campaignDraftStorage.ts','src/lib/useOperationGuard.ts','src/test/campaignUx.test.tsx','src/test/workspaceReliability.test.tsx',
  'src/test/offlineDraftStorage01810.test.ts','src/test/offlineDraftWorkspace01810.test.tsx','scripts/test-offline-draft01810-source.mjs',
  'src/styles/app.css','src/components/AppShell.tsx','src/test/pwaScroll0192.test.ts','scripts/test-pwa-scroll0192-source.mjs','scripts/test-release-artifact0193-source.mjs',
  'src/test/mobileDialogFocus0194.test.tsx','scripts/test-mobile-dialog-focus0194-source.mjs',
  'src/test/errors.test.ts','scripts/test-error-presentation0195-source.mjs',
  'src/lib/observability.ts','src/components/AppErrorBoundary.tsx','src/test/observability0197.test.ts','scripts/test-observability0197-source.mjs',
  'src/auth/returnTo.ts','src/test/authBoundary0198.test.ts','scripts/test-auth-session-workspace0198-source.mjs','docs/AUTH_SESSION_WORKSPACE_BOUNDARY_0198.md',
  'src/test/accessibilityForms0199.test.tsx','scripts/test-accessibility-forms0199-source.mjs','docs/ACCESSIBILITY_FORM_INTERACTION_0199.md',
  'scripts/test-production-launch0200-source.mjs','scripts/certify-production0200.mjs','docs/PRODUCTION_LAUNCH_BASELINE_0200.md','VALIDATION_0_20_0.md','PATCH_0_20_0_README.md','HANDOFF_0_20_0.md','CHANGED_FILES_0_20_0.txt',
  'src/components/PwaExperiencePrompts.tsx','src/test/pwaInstallUpdate0201.test.tsx','scripts/test-pwa-install-update0201-source.mjs','scripts/certify-production0201.mjs','docs/PWA_INSTALL_UPDATE_EXPERIENCE_0201.md','VALIDATION_0_20_1.md','PATCH_0_20_1_README.md','HANDOFF_0_20_1.md','CHANGED_FILES_0_20_1.txt',
  'src/test/landingConversion0202.test.tsx','scripts/test-landing-conversion0202-source.mjs','scripts/certify-production0202.mjs','docs/LANDING_CONVERSION_MOBILE_UX_0202.md','VALIDATION_0_20_2.md','PATCH_0_20_2_README.md','HANDOFF_0_20_2.md','CHANGED_FILES_0_20_2.txt',
  'src/test/routeLoading0196.test.tsx','scripts/test-route-loading0196-source.mjs','scripts/test-route-loading0196-build.mjs','scripts/test-bootstrap-split0196r1-source.mjs','src/AppBootstrap.tsx','vite.config.ts',
  'docs/DRAFT_IMPORT_CAMPAIGN_UX_0186.md','docs/OFFLINE_DRAFT_WORKSPACE_01810.md',
  'supabase/migrations/20261010000100_delivery_recovery_contract_hardening.sql',
  'scripts/test-delivery-contract0185.mjs','src/lib/deliveryContract.ts',
  'package.json','.env.example','src/App.tsx','src/pages/DashboardPage.tsx','src/pages/CampaignsPage.tsx',
  'src/pages/CampaignConfirmationPage.tsx','src/pages/CampaignDetailPage.tsx','src/pages/SimpleCampaignPage.tsx','src/auth/AuthProvider.tsx',
  'src/workspace/WorkspaceProvider.tsx','src/workspace/RequireWorkspace.tsx','src/lib/errors.ts','src/lib/gatewayDevices.ts',
  'src/lib/messageComposer.ts','src/lib/messageComposerApi.ts','src/lib/smsSegments.ts','src/lib/campaignConfirmation.ts',
  'src/lib/campaignConfirmationApi.ts','src/lib/gatewayPreflight.ts','src/lib/gatewayPreflightApi.ts','src/lib/durableQueue.ts','src/lib/durableQueueApi.ts','src/lib/deliveryAttempts.ts','src/lib/deliveryAttemptsApi.ts','src/lib/productNavigation.ts',
  'src/lib/supabase.ts','src/pages/MessageComposerPage.tsx','src/pages/DevicesPage.tsx','src/pages/SettingsPage.tsx','supabase/config.toml',
  'supabase/migrations/20261001000100_individual_account_foundation.sql',
  'supabase/migrations/20261001000110_secure_android_device_pairing.sql',
  'supabase/migrations/20261001000120_device_dashboard_sim_binding.sql',
  'supabase/migrations/20261001000130_phone_number_foundation.sql',
  'supabase/migrations/20261001000140_excel_csv_import.sql',
  'supabase/migrations/20261001000150_recipient_validation_preview.sql',
  'supabase/migrations/20261001000200_consent_suppression.sql',
  'supabase/migrations/20261001000210_message_composer_personalization.sql',
  'supabase/migrations/20261001000220_sms_segment_usage_calculator.sql',
  'supabase/migrations/20261001000230_gateway_sql_ambiguity_fix.sql',
  'supabase/migrations/20261001000240_gateway_sql_lint_stabilization.sql',
  'supabase/migrations/20261001000250_gateway_pairing_expiry_qualification.sql',
  'supabase/migrations/20261001000300_campaign_confirmation_snapshot.sql',
  'supabase/migrations/20261001000305_campaign_confirmation_lint_stabilization.sql',
  'supabase/migrations/20261001000310_gateway_preflight_send_authorization.sql',
  'supabase/migrations/20261001000320_durable_cloud_queue.sql',
  'supabase/migrations/20261001000330_simple_campaign_flow_bulk_consent.sql',
  'supabase/migrations/20261001000340_delivery_attempts_callbacks_recovery.sql',
  'supabase/migrations/20261006000180_callback_retry_safety_stabilization.sql',
  'supabase/migrations/20261006000200_campaign_history_safe_delete.sql',
  'supabase/migrations/20261006000210_test_campaign_data_purge.sql',
  'supabase/migrations/20261006000220_production_safety_release_hardening.sql',
  'docs/TEST_DATA_CLEANUP_0183.md','docs/PRODUCTION_SAFETY_RELEASE_HARDENING_0184.md','scripts/reset-android-test-queue.ps1',
  'docs/CAMPAIGN_CONFIRMATION_SNAPSHOT.md','docs/GATEWAY_PREFLIGHT_SEND_AUTHORIZATION.md','docs/DURABLE_CLOUD_QUEUE.md',
  'scripts/test-durable-queue-local.mjs','scripts/release-package.py','scripts/release-package.sh','supabase/verify_fresh_schema.sql','src/test/smsSegments.test.ts','src/test/campaignConfirmation.test.ts','src/test/gatewayPreflight.test.ts','src/test/durableQueue.test.ts','src/test/deliveryAttempts.test.ts','src/test/productNavigation.test.ts',
]
const forbiddenFiles = ['src/organizations/OrganizationProvider.tsx','src/organizations/OnboardingPage.tsx','src/organizations/InviteAcceptancePage.tsx','src/organizations/RequireOrganization.tsx','src/pages/TeamPage.tsx','src/lib/rbac.ts','src/test/rbac.test.ts','scripts/test-rbac-local.mjs']
const missing=[]; for (const file of requiredFiles) { try { await readFile(new URL(`../${file}`,import.meta.url)) } catch { missing.push(file) } }
const forbiddenPresent=[]; for (const file of forbiddenFiles) { try { await access(new URL(`../${file}`,import.meta.url)); forbiddenPresent.push(file) } catch {} }
if (missing.length || forbiddenPresent.length) { if(missing.length) console.error(`Preflight failed. Missing: ${missing.join(', ')}`); if(forbiddenPresent.length) console.error(`Preflight failed. Legacy files present: ${forbiddenPresent.join(', ')}`); process.exit(1) }

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
const expectedEnvExample = [
  'VITE_SUPABASE_URL=https://your-project.supabase.co',
  'VITE_SUPABASE_ANON_KEY=your-anon-key',
]
for (const marker of expectedEnvExample) {
  if (!envExample.includes(marker)) { console.error(`Preflight failed. .env.example placeholder contract missing: ${marker}`); process.exit(1) }
}
if (/service[_-]?role|jwt[_-]?secret|sb_secret_/i.test(envExample)) {
  console.error('Preflight failed. .env.example must not contain privileged secret identifiers or values.')
  process.exit(1)
}

if (packageJson.version !== '0.20.2') { console.error(`Preflight failed. Expected package version 0.20.2, got ${packageJson.version}`); process.exit(1) }

const appShell = await readFile(new URL('../src/components/AppShell.tsx', import.meta.url), 'utf8')
const mobileDialogFocusMarkers = [
  'toolsDialogRef',
  'toolsTriggerRef',
  'focusable[0]?.focus()',
  "event.key !== 'Tab'",
  'last.focus()',
  'first.focus()',
  'trigger?.isConnected',
  'tabIndex={-1}',
  'aria-modal="true"',
]
const missingMobileDialogFocusMarkers = mobileDialogFocusMarkers.filter((marker) => !appShell.includes(marker))
if (missingMobileDialogFocusMarkers.length) { console.error(`Preflight failed. 0.20.2 mobile dialog focus markers missing: ${missingMobileDialogFocusMarkers.join(', ')}`); process.exit(1) }


const errorsSource = await readFile(new URL('../src/lib/errors.ts', import.meta.url), 'utf8')
const safeErrorMarkers = [
  'errorDiagnosticContext',
  'safeDisplayMessage',
  'NETWORK_MARKERS',
  'AUTH_MARKERS',
  'PERMISSION_MARKERS',
  'INTERNAL_MARKERS',
  'Could not reach BulkText. Check your internet connection and try again.',
  'Authentication required. Sign in again and retry.',
  'You do not have permission to perform this action.',
]
const missingSafeErrorMarkers = safeErrorMarkers.filter((marker) => !errorsSource.includes(marker))
if (missingSafeErrorMarkers.length) { console.error(`Preflight failed. 0.20.2 safe-error markers missing: ${missingSafeErrorMarkers.join(', ')}`); process.exit(1) }
if (errorsSource.includes('parts.push(details)') || errorsSource.includes('`Hint: ${hint}`') || errorsSource.includes('`[${code}]`')) {
  console.error('Preflight failed. Raw backend details, hints or codes must not be concatenated into user-facing error text.')
  process.exit(1)
}

const observabilitySource = await readFile(new URL('../src/lib/observability.ts', import.meta.url), 'utf8')
const appErrorBoundarySource = await readFile(new URL('../src/components/AppErrorBoundary.tsx', import.meta.url), 'utf8')
const settingsSource = await readFile(new URL('../src/pages/SettingsPage.tsx', import.meta.url), 'utf8')
const observabilityMarkers = [
  "OBSERVABILITY_RELEASE = '0.20.2'",
  "STORAGE_KEY = 'bulktext:diagnostics:v1'",
  'MAX_EVENTS = 25',
  "window.addEventListener('error'",
  "window.addEventListener('unhandledrejection'",
  'currentRouteGroup',
  'safeToken',
  'sessionStorage',
]
const missingObservabilityMarkers = observabilityMarkers.filter((marker) => !observabilitySource.includes(marker))
if (missingObservabilityMarkers.length) { console.error(`Preflight failed. 0.20.2 observability markers missing: ${missingObservabilityMarkers.join(', ')}`); process.exit(1) }
if (observabilitySource.includes('window.location.href') || observabilitySource.includes('window.location.search') || observabilitySource.includes('localStorage')) {
  console.error('Preflight failed. 0.20.2 diagnostics must not retain full URLs, query strings or persistent local storage.')
  process.exit(1)
}
if (!errorsSource.includes("reportDiagnostic(context, { source: 'handled-error'") || !errorsSource.includes("if (category !== 'domain')")) {
  console.error('Preflight failed. 0.20.2 handled-error observability boundary is incomplete.')
  process.exit(1)
}
if (!appErrorBoundarySource.includes("source: 'react-render'") || !settingsSource.includes('Technical diagnostics') || !settingsSource.includes('Copy diagnostics') || !settingsSource.includes('Clear diagnostics')) {
  console.error('Preflight failed. 0.20.2 render/support diagnostic surfaces are incomplete.')
  process.exit(1)
}

const authProviderSource = await readFile(new URL('../src/auth/AuthProvider.tsx', import.meta.url), 'utf8')
const requireAuthSource = await readFile(new URL('../src/auth/RequireAuth.tsx', import.meta.url), 'utf8')
const returnToSource = await readFile(new URL('../src/auth/returnTo.ts', import.meta.url), 'utf8')
const loginSource = await readFile(new URL('../src/auth/LoginPage.tsx', import.meta.url), 'utf8')
const workspaceProviderSource = await readFile(new URL('../src/workspace/WorkspaceProvider.tsx', import.meta.url), 'utf8')
const workspaceLocatorSource = await readFile(new URL('../src/lib/offlineWorkspaceLocator.ts', import.meta.url), 'utf8')
const boundaryMarkers = [
  'revalidateSession: () => Promise<boolean>',
  'supabase.auth.getUser()',
  "window.addEventListener('online'",
  "window.addEventListener('focus'",
  "document.addEventListener('visibilitychange'",
  'revalidationInFlight',
  'clearAccountScopedState',
  'clearRecentDiagnosticEvents()',
]
const missingBoundaryMarkers = boundaryMarkers.filter((marker) => !authProviderSource.includes(marker))
if (missingBoundaryMarkers.length) { console.error(`Preflight failed. 0.20.2 auth/session markers missing: ${missingBoundaryMarkers.join(', ')}`); process.exit(1) }
if (!returnToSource.includes('safeReturnTo') || !returnToSource.includes("raw.startsWith('//')") || !returnToSource.includes("parsed.pathname.startsWith('/auth/')")) {
  console.error('Preflight failed. 0.20.2 safe returnTo boundary is incomplete.')
  process.exit(1)
}
if (!requireAuthSource.includes('protectedReturnTo(location)') || !loginSource.includes("safeReturnTo(searchParams.get('returnTo'))")) {
  console.error('Preflight failed. 0.20.2 protected returnTo integration is incomplete.')
  process.exit(1)
}
if (!workspaceProviderSource.includes("category === 'authentication' || category === 'permission'") || !workspaceProviderSource.includes('clearOfflineWorkspaceLocator(userId)') || !workspaceProviderSource.includes('workspace: null, authority: null')) {
  console.error('Preflight failed. 0.20.2 workspace authorization-loss boundary is incomplete.')
  process.exit(1)
}
if (!workspaceLocatorSource.includes('clearOfflineWorkspaceLocator(userId: string)')) {
  console.error('Preflight failed. 0.20.2 single-workspace locator invalidation helper is missing.')
  process.exit(1)
}


const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
const bootstrapSource = await readFile(new URL('../src/AppBootstrap.tsx', import.meta.url), 'utf8')
const bootstrapContractSource = await readFile(new URL('../scripts/test-bootstrap-split0196r1-source.mjs', import.meta.url), 'utf8')
const bundleGateSource = await readFile(new URL('../scripts/test-route-loading0196-build.mjs', import.meta.url), 'utf8')
const bootstrapMarkers = [
  "const AppBootstrap = lazy(() => import('./AppBootstrap'))",
  'installGlobalObservability()',
  '<AppErrorBoundary>',
  '<Suspense fallback=',
]
if (bootstrapMarkers.some((marker) => !mainSource.includes(marker)) || mainSource.includes("from './auth/AuthProvider'") || mainSource.includes("from './workspace/WorkspaceProvider'") || mainSource.includes("import App from './App'")) {
  console.error('Preflight failed. 0.20.2 initial bootstrap split is missing or providers leaked back into the static entry.')
  process.exit(1)
}
for (const marker of ["import App from './App'", "from './auth/AuthProvider'", "from './workspace/WorkspaceProvider'", '<AuthProvider>', '<WorkspaceProvider>', '<App />']) {
  if (!bootstrapSource.includes(marker)) { console.error(`Preflight failed. 0.20.2 AppBootstrap marker missing: ${marker}`); process.exit(1) }
}
if (
  !bootstrapContractSource.includes('INITIAL_JS_BUDGET_BYTES = 500 * 1024') ||
  !bundleGateSource.includes('MAX_CHUNK_BYTES = 500_000') ||
  !bundleGateSource.includes("value?.name === 'AppBootstrap'") ||
  !bundleGateSource.includes('appEntry[1]?.dynamicImports?.includes(key)')
) {
  console.error('Preflight failed. 0.20.2 bootstrap/bundle correction gates are incomplete.')
  process.exit(1)
}

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const viteSource = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8')
const serviceWorkerSource = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
const routeLoadingMarkers = [
  "lazy(() => import('./components/AppShell')",
  "lazy(() => import('./pages/CampaignsPage')",
  "lazy(() => import('./pages/SimpleCampaignPage')",
  "lazy(() => import('./pages/ImportsPage')",
  "lazy(() => import('./pages/DevicesPage')",
  'RouteLoadBoundary',
  'This screen could not be loaded',
  '<Suspense fallback={<LoadingState',
]
const missingRouteLoadingMarkers = routeLoadingMarkers.filter((marker) => !appSource.includes(marker))
if (missingRouteLoadingMarkers.length) { console.error(`Preflight failed. 0.20.2 route-loading markers missing: ${missingRouteLoadingMarkers.join(', ')}`); process.exit(1) }
if (!viteSource.includes("manifest: 'asset-manifest.json'")) { console.error('Preflight failed. 0.20.2 Vite asset manifest output is missing.'); process.exit(1) }
for (const marker of ["const VERSION = '0.20.2'", "'/asset-manifest.json'", 'buildManifestAssets', 'cold-start offline route coverage after code splitting']) {
  if (!serviceWorkerSource.includes(marker)) { console.error(`Preflight failed. 0.20.2 lazy-route offline marker missing: ${marker}`); process.exit(1) }
}


const pwaProvider0201 = await readFile(new URL('../src/pwa/PwaProvider.tsx', import.meta.url), 'utf8')
const pwaPrompts0201 = await readFile(new URL('../src/components/PwaExperiencePrompts.tsx', import.meta.url), 'utf8')
const landing0201 = await readFile(new URL('../src/pages/LandingPage.tsx', import.meta.url), 'utf8')
const main0201 = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
const pwaContract0201 = await readFile(new URL('../scripts/test-pwa-install-update0201-source.mjs', import.meta.url), 'utf8')
const certifier0201 = await readFile(new URL('../scripts/certify-production0201.mjs', import.meta.url), 'utf8')
for (const marker of [
  "INSTALL_DISMISS_KEY = 'bulktext:pwa-install-dismissed-until:v1'",
  'INSTALL_DISMISS_MS = 3 * 24 * 60 * 60 * 1000',
  'installPromptVisible: canInstall && !installDismissed',
  'waitingWorkerRef.current !== worker',
  "waitingWorker.postMessage({ type: 'SKIP_WAITING' })",
  "window.addEventListener('focus'",
]) {
  if (!pwaProvider0201.includes(marker)) { console.error(`Preflight failed. 0.20.2 PWA lifecycle marker missing: ${marker}`); process.exit(1) }
}
for (const marker of ['Install BulkText App', 'Not now', 'BulkText update ready', 'Update now', 'Later']) {
  if (!pwaPrompts0201.includes(marker)) { console.error(`Preflight failed. 0.20.2 PWA prompt marker missing: ${marker}`); process.exit(1) }
}
if (!landing0201.includes('canInstall ? <button className="marketing-install-link"') || !main0201.includes('<PwaExperiencePrompts />')) {
  console.error('Preflight failed. 0.20.2 install option is not exposed globally and on the public landing navigation.')
  process.exit(1)
}
if (!pwaContract0201.includes('Web 0.20.2 PWA install & update source contract') || !certifier0201.includes("'test:pwa-install-update-0201'")) {
  console.error('Preflight failed. 0.20.2 PWA install/update certification markers are incomplete.')
  process.exit(1)
}


const landing0202 = await readFile(new URL('../src/pages/LandingPage.tsx', import.meta.url), 'utf8')
const landingStyles0202 = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const landingContract0202 = await readFile(new URL('../scripts/test-landing-conversion0202-source.mjs', import.meta.url), 'utf8')
const landingCertifier0202 = await readFile(new URL('../scripts/certify-production0202.mjs', import.meta.url), 'utf8')
for (const marker of [
  'Business SMS, sent from your own SIM.',
  'dashboard-showcase',
  'Connect your phone',
  'feature-card-copy',
  'comparison-grid',
  'aria-expanded={isOpen}',
  "event.key !== 'Escape'",
  "document.body.style.overflow = 'hidden'",
]) {
  if (!landing0202.includes(marker)) { console.error(`Preflight failed. 0.20.2 landing UX marker missing: ${marker}`); process.exit(1) }
}
for (const marker of [
  '/* 0.20.2 — Landing page conversion and mobile UX */',
  'overflow-x: clip',
  '@media (max-width: 360px)',
  "content: '↓'",
]) {
  if (!landingStyles0202.includes(marker)) { console.error(`Preflight failed. 0.20.2 landing CSS marker missing: ${marker}`); process.exit(1) }
}
if (!landingContract0202.includes('Web 0.20.2 landing conversion & mobile UX source contract') || !landingCertifier0202.includes("'test:landing-conversion-0202'")) {
  console.error('Preflight failed. 0.20.2 landing conversion certification markers are incomplete.')
  process.exit(1)
}
if (!landing0202.includes('canInstall ? <button className="marketing-install-link"') || !landing0202.includes('await install()')) {
  console.error('Preflight failed. 0.20.2 landing redesign regressed the 0.20.1 Install App contract.')
  process.exit(1)
}


const accessibilityContractSource = await readFile(new URL('../scripts/test-accessibility-forms0199-source.mjs', import.meta.url), 'utf8')
const loginSource0199 = await readFile(new URL('../src/auth/LoginPage.tsx', import.meta.url), 'utf8')
const phoneNumbersSource0199 = await readFile(new URL('../src/pages/PhoneNumbersPage.tsx', import.meta.url), 'utf8')
const composerSource0199 = await readFile(new URL('../src/pages/MessageComposerPage.tsx', import.meta.url), 'utf8')
const simpleCampaignSource0199 = await readFile(new URL('../src/pages/SimpleCampaignPage.tsx', import.meta.url), 'utf8')
const accessibilityMarkers0199 = [
  'aria-busy={busy}',
  'role="alert"',
  'aria-describedby',
  'aria-required="true"',
]
for (const marker of accessibilityMarkers0199) {
  const combined = `${loginSource0199}
${phoneNumbersSource0199}
${composerSource0199}
${simpleCampaignSource0199}`
  if (!combined.includes(marker)) { console.error(`Preflight failed. 0.20.2 accessibility/form marker missing: ${marker}`); process.exit(1) }
}
if (!phoneNumbersSource0199.includes('Phone number normalization results') || !composerSource0199.includes('aria-invalid={hasTemplateProblem || undefined}')) {
  console.error('Preflight failed. 0.20.2 form result/error semantics are incomplete.')
  process.exit(1)
}
if (!accessibilityContractSource.includes('Web 0.20.2 accessibility & form interaction source contract')) {
  console.error('Preflight failed. 0.20.2 accessibility source contract marker is missing.')
  process.exit(1)
}

const launchContractSource = await readFile(new URL('../scripts/test-production-launch0200-source.mjs', import.meta.url), 'utf8')
const certificationSource = await readFile(new URL('../scripts/certify-production0200.mjs', import.meta.url), 'utf8')
const launchBaselineSource = await readFile(new URL('../docs/PRODUCTION_LAUNCH_BASELINE_0200.md', import.meta.url), 'utf8')
const launchCertificationMarkers = [
  "'test:launch-source-0200'",
  "'test:accessibility-forms-0199'",
  "'test:auth-boundary-0198'",
  "'test:observability-0197'",
  "'test:bootstrap-split-0196r1'",
  "'test:bundle-0196'",
  "'test:pwa-shell-01810r1'",
  'automated production certification: PASS',
]
if (launchCertificationMarkers.some((marker) => !certificationSource.includes(marker))) {
  console.error('Preflight failed. 0.20.2 production launch certification markers are incomplete.')
  process.exit(1)
}
if (!launchContractSource.includes('Web 0.20.2 production launch source contract') || !launchBaselineSource.includes('Post-deploy launch checklist')) {
  console.error('Preflight failed. 0.20.2 launch source contract or explicit post-deploy checklist is missing.')
  process.exit(1)
}
if (!launchBaselineSource.includes('initial static JS budget remains `< 500 KiB`') || !launchBaselineSource.includes('every emitted JS chunk remains `< 500,000 bytes`')) {
  console.error('Preflight failed. 0.20.2 production launch certification markers must preserve the 0.19.6-r1 bundle budgets.')
  process.exit(1)
}

const migration = await readFile(new URL('../supabase/migrations/20261001000340_delivery_attempts_callbacks_recovery.sql', import.meta.url), 'utf8')
const requiredMigrationMarkers = [
  'create table public.campaign_message_attempts',
  'create table public.campaign_message_attempt_parts',
  'create table public.campaign_message_attempt_events',
  'create table public.campaign_message_recovery_requests',
  'begin_gateway_message_attempt',
  'report_gateway_message_attempt_event',
  'request_campaign_message_recovery',
  'safe_retry_eligible = true',
  "p_action = 'safe_retry'",
  "p_action = 'skip_unknown'",
  'Attempt event id is already bound to a different immutable callback payload',
  "'unknown_auto_retry_enabled', false",
]
const missingMigrationMarkers = requiredMigrationMarkers.filter((marker) => !migration.includes(marker))
if (missingMigrationMarkers.length) { console.error(`Preflight failed. 00340 safety markers missing: ${missingMigrationMarkers.join(', ')}`); process.exit(1) }
if (/update\s+public\.campaign_message_jobs[\s\S]*state\s*=\s*['"]queued['"]/i.test(migration)) { console.error('Preflight failed. 00340 must not requeue durable cloud jobs for retry.'); process.exit(1) }


const safetyMigration = await readFile(new URL('../supabase/migrations/20261006000180_callback_retry_safety_stabilization.sql', import.meta.url), 'utf8')
const deleteMigration = await readFile(new URL('../supabase/migrations/20261006000200_campaign_history_safe_delete.sql', import.meta.url), 'utf8')
const requiredSafetyMarkers = [
  "state = 'unknown'",
  'safe_retry_eligible = false',
  'post-SmsManager callback failure cannot prove zero external SMS effect',
  "'callback_derived_safe_retry_enabled', false",
  "p_action = 'safe_retry'",
  "p_action <> 'skip_unknown'",
]
const missingSafetyMarkers = requiredSafetyMarkers.filter((marker) => !safetyMigration.includes(marker))
if (missingSafetyMarkers.length) { console.error(`Preflight failed. 0.18.2 safety markers missing: ${missingSafetyMarkers.join(', ')}`); process.exit(1) }
if (/state\s*=\s*['"]failed['"][\s\S]{0,300}safe_retry_eligible\s*=\s*true/i.test(safetyMigration)) { console.error('Preflight failed. 0.18.2 must not create callback-derived safe-retry eligibility.'); process.exit(1) }


const requiredDeleteMarkers = [
  'campaign_delete_block_reason_internal',
  'get_campaign_delete_status',
  'delete_campaign(',
  'delete_campaign_history',
  "state in ('prepared', 'submitted', 'sent')",
  "state = 'downloaded'",
  "state = 'leased'",
  'campaign.deleted',
]
const missingDeleteMarkers = requiredDeleteMarkers.filter((marker) => !deleteMigration.includes(marker))
if (missingDeleteMarkers.length) { console.error(`Preflight failed. 0.18.2 campaign-delete markers missing: ${missingDeleteMarkers.join(', ')}`); process.exit(1) }
if (!deleteMigration.includes("'campaign_delete_blocks_inflight_android_work', true")) { console.error('Preflight failed. Campaign deletion safety metadata is missing.'); process.exit(1) }



const purgeMigration = await readFile(new URL('../supabase/migrations/20261006000210_test_campaign_data_purge.sql', import.meta.url), 'utf8')
const hardeningMigration = await readFile(new URL('../supabase/migrations/20261006000220_production_safety_release_hardening.sql', import.meta.url), 'utf8')
const historicalPurgeMarkers = [
  'get_test_campaign_purge_status',
  'purge_test_campaign_data',
  'PURGE TEST CAMPAIGNS',
  "'test_data.campaigns_purged'",
]
const missingHistoricalPurgeMarkers = historicalPurgeMarkers.filter((marker) => !purgeMigration.includes(marker))
if (missingHistoricalPurgeMarkers.length) { console.error(`Preflight failed. Historical 0.18.3 migration changed unexpectedly: ${missingHistoricalPurgeMarkers.join(', ')}`); process.exit(1) }

const hardeningMarkers = [
  'drop function if exists public.purge_test_campaign_data(uuid,text)',
  'drop function if exists public.get_test_campaign_purge_status(uuid)',
  'contact_compliance_state_internal',
  "eligibility_state is distinct from 'eligible'",
  'Recipient is no longer eligible at attempt start; SMS submission is blocked',
  "'version', '0.18.4'",
  "'test_campaign_purge_enabled', false",
  "'production_test_purge_removed', true",
  "'final_compliance_gate_before_attempt', true",
  "'suppression_rechecked_at_attempt_start', true",
  "'unknown_auto_retry_enabled', false",
]
const missingHardeningMarkers = hardeningMarkers.filter((marker) => !hardeningMigration.includes(marker))
if (missingHardeningMarkers.length) { console.error(`Preflight failed. 0.18.4 hardening markers missing: ${missingHardeningMarkers.join(', ')}`); process.exit(1) }

const campaignsPage = await readFile(new URL('../src/pages/CampaignsPage.tsx', import.meta.url), 'utf8')
const confirmationApi = await readFile(new URL('../src/lib/campaignConfirmationApi.ts', import.meta.url), 'utf8')
if (/purgeTestCampaignData|getTestCampaignPurgeStatus|PURGE TEST CAMPAIGNS|Development cleanup/.test(campaignsPage + confirmationApi)) {
  console.error('Preflight failed. Production Web UI/API still exposes the development test purge.')
  process.exit(1)
}

const releasePackager = await readFile(new URL('../scripts/release-package.py', import.meta.url), 'utf8')
const requiredPackagerMarkers = [
  `version_marker = f"'version', '{backend_version}'"`,
  "run_preflight(root, 'SOURCE')",
  "run_preflight(stage, 'STAGE')",
  'verify_zip_layout(zip_path, release_root_name)',
  'verify_extracted_release(zip_path, release_root_name)',
  'verify_manifest(extracted)',
  "release_root_name = f'bulktext-web-{version}'",
  "'.patch-backups'",
  "fnmatch.fnmatch(name, 'config.toml.before-*')",
]
if (releasePackager.includes("version != '0.16.4'") || requiredPackagerMarkers.some((marker) => !releasePackager.includes(marker))) {
  console.error('Preflight failed. Release packager is not fully version-driven or artifact-integrity hardened.')
  process.exit(1)
}


const freshVerifier = await readFile(new URL('../supabase/verify_fresh_schema.sql', import.meta.url), 'utf8')
for (const marker of ["version', '') <> '0.18.5'", 'Production schema must not expose purge_test_campaign_data', 'Final compliance gate before attempt must be enabled in 0.18.5']) {
  if (!freshVerifier.includes(marker)) { console.error(`Preflight failed. Fresh-schema 0.18.4 marker missing: ${marker}`); process.exit(1) }
}

console.log('BulkText Web 0.20.2 / backend 0.18.5 preflight PASS')

if (packageJson.bulktext?.backendContractVersion !== '0.18.5') { console.error('Expected backend contract 0.18.5 for Web 0.20.2'); process.exit(1) }
