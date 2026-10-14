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
  'src/auth/PasswordField.tsx','src/test/authMobilePolish0203.test.tsx','scripts/test-auth-mobile-polish0203-source.mjs','scripts/certify-production0203.mjs','docs/AUTH_SCREEN_MOBILE_POLISH_0203.md','VALIDATION_0_20_3.md','PATCH_0_20_3_README.md','HANDOFF_0_20_3.md','CHANGED_FILES_0_20_3.txt',
  'vercel.json','scripts/test-routing-pwa0203r1-source.mjs','scripts/certify-production0203r1.mjs','docs/PRODUCTION_ROUTING_PWA_CONTROLLED_UPDATE_0203R1.md','VALIDATION_0_20_3_R1.md','PATCH_0_20_3_R1_README.md','HANDOFF_0_20_3_R1.md','CHANGED_FILES_0_20_3_R1.txt',
  'scripts/test-import-scale0204-source.mjs','scripts/test-import-scale-local0204.mjs','src/test/importsApi0204.test.ts','scripts/certify-production0204.mjs','docs/RECIPIENT_IMPORT_RELIABILITY_SCALE_0204.md','VALIDATION_0_20_4.md','PATCH_0_20_4_README.md','HANDOFF_0_20_4.md','CHANGED_FILES_0_20_4.txt','supabase/migrations/20261013000100_recipient_import_reliability_scale.sql',
  'src/test/routeLoading0196.test.tsx','scripts/test-route-loading0196-source.mjs','scripts/test-route-loading0196-build.mjs','scripts/test-bootstrap-split0196r1-source.mjs','src/AppBootstrap.tsx','vite.config.ts',
  'docs/DRAFT_IMPORT_CAMPAIGN_UX_0186.md','docs/OFFLINE_DRAFT_WORKSPACE_01810.md',
  'supabase/migrations/20261010000100_delivery_recovery_contract_hardening.sql',
  'scripts/test-delivery-contract0185.mjs','src/lib/deliveryContract.ts',
  'package.json','.env.example','src/App.tsx','src/pages/DashboardPage.tsx','src/pages/CampaignsPage.tsx',
  'src/test/dashboardControlCenter0206.test.tsx','scripts/test-dashboard-control-center0206-source.mjs','scripts/certify-production0206.mjs','docs/HOME_DASHBOARD_CONTROL_CENTER_0206.md','VALIDATION_0_20_6.md','PATCH_0_20_6_README.md','HANDOFF_0_20_6.md','CHANGED_FILES_0_20_6.txt',
  'src/components/ActionDialog.tsx','src/test/actionDialog0207.test.tsx','src/test/campaignConfirmationSendSafety0207.test.tsx','scripts/test-campaign-confirmation-send-safety0207-source.mjs','scripts/certify-production0207.mjs','docs/CAMPAIGN_CONFIRMATION_SEND_SAFETY_UX_0207.md','VALIDATION_0_20_7.md','PATCH_0_20_7_README.md','HANDOFF_0_20_7.md','CHANGED_FILES_0_20_7.txt',
  'src/lib/recipientDisplay.ts','src/test/campaignMessageReview0209.test.tsx','scripts/test-campaign-message-review0209-source.mjs','scripts/certify-production0209.mjs','docs/CAMPAIGN_MESSAGE_REVIEW_EXPERIENCE_0209.md','VALIDATION_0_20_9.md','PATCH_0_20_9_README.md','HANDOFF_0_20_9.md','CHANGED_FILES_0_20_9.txt',
  'src/test/campaignDeliveryExperience02010.test.tsx','scripts/test-campaign-delivery-experience02010-source.mjs','scripts/certify-production02010.mjs','docs/CAMPAIGN_DELIVERY_EXPERIENCE_02010.md','VALIDATION_0_20_10.md','PATCH_0_20_10_README.md','HANDOFF_0_20_10.md','CHANGED_FILES_0_20_10.txt',
  'src/test/phoneSimReadiness02011.test.tsx','scripts/test-phone-sim-readiness02011-source.mjs','scripts/certify-production02011.mjs','docs/PHONE_SIM_READINESS_CONTROL_CENTER_02011.md','VALIDATION_0_20_11.md','PATCH_0_20_11_README.md','HANDOFF_0_20_11.md','CHANGED_FILES_0_20_11.txt',
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

if (packageJson.version !== '0.20.12') { console.error(`Preflight failed. Expected package version 0.20.12, got ${packageJson.version}`); process.exit(1) }

const dashboard0206 = await readFile(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8')
const dashboardStyles0206 = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const dashboardSourceContract0206 = await readFile(new URL('../scripts/test-dashboard-control-center0206-source.mjs', import.meta.url), 'utf8')
const dashboard0206Markers = ['Promise.allSettled([', 'listCampaignConfirmations(workspace.id)', 'data.campaigns.slice(0, 3)', 'Sending setup', 'Recent campaigns', 'Available sections remain usable.']
const missingDashboard0206Markers = dashboard0206Markers.filter((marker) => !dashboard0206.includes(marker))
if (missingDashboard0206Markers.length) { console.error(`Preflight failed. 0.20.12 dashboard markers missing: ${missingDashboard0206Markers.join(', ')}`); process.exit(1) }
if (dashboard0206.includes('PwaInstallCard') || dashboard0206.includes('Current identity') || dashboard0206.includes('dashboard-next-action')) {
  console.error('Preflight failed. 0.20.12 dashboard still contains a retired duplicate install/setup/action surface.')
  process.exit(1)
}
if ((dashboard0206.match(/to="\/campaigns\/new"/g) ?? []).length !== 1) { console.error('Preflight failed. 0.20.12 dashboard must expose exactly one New campaign action.'); process.exit(1) }
if (!dashboardStyles0206.includes('.dashboard-setup-strip') || !dashboardStyles0206.includes('.dashboard-recent-row') || dashboardStyles0206.includes('.dashboard-next-action')) {
  console.error('Preflight failed. 0.20.12 dashboard responsive style contract is incomplete.')
  process.exit(1)
}
if (!dashboardSourceContract0206.includes('Home Dashboard Control Center source contract')) { console.error('Preflight failed. 0.20.12 dashboard source contract marker is missing.'); process.exit(1) }

const campaignConfirmation0207 = await readFile(new URL('../src/pages/CampaignConfirmationPage.tsx', import.meta.url), 'utf8')
const campaignDetail0207 = await readFile(new URL('../src/pages/CampaignDetailPage.tsx', import.meta.url), 'utf8')
const actionDialog0207 = await readFile(new URL('../src/components/ActionDialog.tsx', import.meta.url), 'utf8')
const campaignSendSafetyContract0207 = await readFile(new URL('../scripts/test-campaign-confirmation-send-safety0207-source.mjs', import.meta.url), 'utf8')
if (!campaignConfirmation0207.includes('title="Confirm campaign?"') || campaignConfirmation0207.includes('window.confirm(') || !campaignConfirmation0207.includes('Nothing is sent yet.')) {
  console.error('Preflight failed. 0.20.12 branded campaign confirmation safety boundary is incomplete.')
  process.exit(1)
}
if (!campaignDetail0207.includes('title="Start sending?"') || !campaignDetail0207.includes('sendInFlight.current') || campaignDetail0207.includes("'Send to Android'") || campaignDetail0207.includes('0.18.1 safety boundary')) {
  console.error('Preflight failed. 0.20.12 final-send consequence/double-submit/terminology contract is incomplete.')
  process.exit(1)
}
if (!actionDialog0207.includes('role="dialog"') || !actionDialog0207.includes('aria-modal="true"') || !actionDialog0207.includes("event.key === 'Escape'")) {
  console.error('Preflight failed. 0.20.12 branded ActionDialog accessibility contract is incomplete.')
  process.exit(1)
}
if (!campaignSendSafetyContract0207.includes('Campaign Confirmation & Send Safety UX source contract')) {
  console.error('Preflight failed. 0.20.12 campaign send-safety source contract marker is missing.')
  process.exit(1)
}

const campaignWizard0208 = await readFile(new URL('../src/pages/SimpleCampaignPage.tsx', import.meta.url), 'utf8')
const appShell0208 = await readFile(new URL('../src/components/AppShell.tsx', import.meta.url), 'utf8')
const campaignWizardContract0208 = await readFile(new URL('../scripts/test-campaign-wizard-simplification0208-source.mjs', import.meta.url), 'utf8')
const campaignWizardMarkers0208 = ['type WizardStep = 1 | 2 | 3', 'Continue to recipients', 'Continue to message', 'Add consent reference (optional)', 'simple-import-summary-line', 'title="Discard this draft?"']
const missingCampaignWizardMarkers0208 = campaignWizardMarkers0208.filter((marker) => !campaignWizard0208.includes(marker))
if (missingCampaignWizardMarkers0208.length) {
  console.error(`Preflight failed. 0.20.12 campaign wizard markers missing: ${missingCampaignWizardMarkers0208.join(', ')}`)
  process.exit(1)
}
if (campaignWizard0208.includes('const currentStep = !parsed') || campaignWizard0208.includes('Continue with ${uniqueReady.toLocaleString()} unique numbers') || campaignWizard0208.includes('“Saved” is shown only after the IndexedDB transaction commits.')) {
  console.error('Preflight failed. 0.20.12 campaign wizard still contains retired pseudo-stepper or developer-facing copy.')
  process.exit(1)
}
if (!appShell0208.includes("location.pathname === '/campaigns/new' || location.pathname.startsWith('/campaigns/review/')") || !appShell0208.includes('campaign-wizard-shell')) {
  console.error('Preflight failed. 0.20.12 focused campaign shell routing contract is incomplete.')
  process.exit(1)
}
if (!dashboardStyles0206.includes('.campaign-wizard-shell .mobile-bottom-nav { display: none; }') || !dashboardStyles0206.includes('.campaign-wizard-mobile-header') || !dashboardStyles0206.includes('.simple-wizard-actions')) {
  console.error('Preflight failed. 0.20.12 focused mobile campaign wizard styles are incomplete.')
  process.exit(1)
}
if (!campaignConfirmation0207.includes('campaign-review-stepper') || !campaignConfirmation0207.includes('← Message')) {
  console.error('Preflight failed. 0.20.12 campaign review does not continue the focused wizard.')
  process.exit(1)
}
if (!campaignWizardContract0208.includes('Campaign Wizard Simplification source contract')) {
  console.error('Preflight failed. 0.20.12 campaign wizard source contract marker is missing.')
  process.exit(1)
}

const campaignMessageReview0209 = await readFile(new URL('../src/pages/SimpleCampaignPage.tsx', import.meta.url), 'utf8')
const campaignReview0209 = await readFile(new URL('../src/pages/CampaignConfirmationPage.tsx', import.meta.url), 'utf8')
const messageComposerSource0209 = await readFile(new URL('../src/lib/messageComposer.ts', import.meta.url), 'utf8')
const recipientDisplaySource0209 = await readFile(new URL('../src/lib/recipientDisplay.ts', import.meta.url), 'utf8')
const campaignMessageReviewContract0209 = await readFile(new URL('../scripts/test-campaign-message-review0209-source.mjs', import.meta.url), 'utf8')
const campaignMessageReviewMarkers0209 = ['personalization-controls', 'message-live-summary', 'Unicode detected.', 'maskRecipientNumber(row.normalization.normalizedE164 ?? row.rawPhone)']
const missingCampaignMessageReviewMarkers0209 = campaignMessageReviewMarkers0209.filter((marker) => !campaignMessageReview0209.includes(marker))
if (missingCampaignMessageReviewMarkers0209.length) {
  console.error(`Preflight failed. 0.20.12 composer markers missing: ${missingCampaignMessageReviewMarkers0209.join(', ')}`)
  process.exit(1)
}
if (!messageComposerSource0209.includes('availablePersonalizationTokens') || !messageComposerSource0209.includes('rows.every((row) => tokenValue(row, candidate.token) != null)')) {
  console.error('Preflight failed. 0.20.12 safe personalization contract is incomplete.')
  process.exit(1)
}
if (!recipientDisplaySource0209.includes('maskRecipientNumber') || !recipientDisplaySource0209.includes("'•'.repeat")) {
  console.error('Preflight failed. 0.20.12 recipient masking helper is incomplete.')
  process.exit(1)
}
for (const marker of ['review-summary-strip', 'featuredPreviews = useMemo(() => previewableRecipients.slice(0, 3)', 'Preview first ${Math.min(100, previewableRecipients.length).toLocaleString()} recipients', 'maskRecipientNumber(preview.row.normalizedE164)', 'Nothing is sent yet.']) {
  if (!campaignReview0209.includes(marker)) { console.error(`Preflight failed. 0.20.12 review marker missing: ${marker}`); process.exit(1) }
}
if (campaignReview0209.includes('className="metric-grid confirmation-metrics"') || campaignReview0209.includes('The server will render the template again') || campaignReview0209.includes('Sending identity snapshot')) {
  console.error('Preflight failed. 0.20.12 review still contains retired metric-card or engineering copy.')
  process.exit(1)
}
if (!campaignMessageReviewContract0209.includes('Message & Review Experience source contract')) {
  console.error('Preflight failed. 0.20.12 message/review source contract marker is missing.')
  process.exit(1)
}

const campaignDeliverySource02010 = await readFile(new URL('../src/lib/deliveryAttempts.ts', import.meta.url), 'utf8')
const campaignDeliveryContract02010 = await readFile(new URL('../scripts/test-campaign-delivery-experience02010-source.mjs', import.meta.url), 'utf8')
const campaignDeliveryMarkers02010 = ['Live campaign status', 'live-processing-progress', 'live-stage-grid', 'Needs attention', 'Completed with unverified results', 'Continue without resending UNKNOWN results?']
const missingCampaignDeliveryMarkers02010 = campaignDeliveryMarkers02010.filter((marker) => !campaignDetail0207.includes(marker))
if (missingCampaignDeliveryMarkers02010.length) {
  console.error(`Preflight failed. 0.20.12 campaign delivery markers missing: ${missingCampaignDeliveryMarkers02010.join(', ')}`)
  process.exit(1)
}
if (!campaignDeliverySource02010.includes('processedDeliveryJobs') || !campaignDeliverySource02010.includes('resolvedUnknownJobs') || !campaignDeliverySource02010.includes('deliveryAttentionJobs')) {
  console.error('Preflight failed. 0.20.12 delivery-state derivation helpers are incomplete.')
  process.exit(1)
}
const recoveryFunction02010 = campaignDetail0207.match(/async function requestRecovery[\s\S]*?\n  }\n\n  async function removeCampaign/)?.[0] ?? ''
if (recoveryFunction02010.includes('window.confirm') || !campaignDetail0207.includes("requestRecovery('skip_unknown')")) {
  console.error('Preflight failed. 0.20.12 UNKNOWN recovery must stay branded and skip-without-resend only.')
  process.exit(1)
}
if (campaignDetail0207.includes('<article className="metric-card"><span>Awaiting attempt</span>') || !campaignDetail0207.includes('maskRecipientNumber(attempt.normalizedE164)')) {
  console.error('Preflight failed. 0.20.12 delivery detail compaction/privacy contract is incomplete.')
  process.exit(1)
}
if (!dashboardStyles0206.includes('.live-delivery-panel') || !dashboardStyles0206.includes('.delivery-state-breakdown') || !dashboardStyles0206.includes('.live-recovery-action')) {
  console.error('Preflight failed. 0.20.12 delivery experience styles are incomplete.')
  process.exit(1)
}
if (!campaignDeliveryContract02010.includes('Campaign Delivery Experience source contract')) {
  console.error('Preflight failed. 0.20.12 campaign delivery source contract marker is missing.')
  process.exit(1)
}

const phoneSimPage02011 = await readFile(new URL('../src/pages/DevicesPage.tsx', import.meta.url), 'utf8')
const gatewayDevices02011 = await readFile(new URL('../src/lib/gatewayDevices.ts', import.meta.url), 'utf8')
const phoneSimContract02011 = await readFile(new URL('../scripts/test-phone-sim-readiness02011-source.mjs', import.meta.url), 'utf8')
const phoneSimReadinessMarkers02011 = ['Current readiness', 'Ready to send', 'Phone needs attention', 'Previous phones', 'Device details', 'Unselect SIM', 'Change sending SIM?', 'SIM safety']
const missingPhoneSimReadinessMarkers02011 = phoneSimReadinessMarkers02011.filter((marker) => !phoneSimPage02011.includes(marker))
if (missingPhoneSimReadinessMarkers02011.length) {
  console.error(`Preflight failed. 0.20.12 Phone & SIM readiness markers missing: ${missingPhoneSimReadinessMarkers02011.join(', ')}`)
  process.exit(1)
}
if (!gatewayDevices02011.includes('gatewayWorkspaceReadiness') || !gatewayDevices02011.includes("device.healthStatus === 'recent'") || !gatewayDevices02011.includes("device.bindingStatus === 'ready'")) {
  console.error('Preflight failed. 0.20.12 shared Phone & SIM readiness derivation is incomplete.')
  process.exit(1)
}
if (phoneSimPage02011.includes('Connected Android phone') || phoneSimPage02011.includes('>Clear SIM<') || phoneSimPage02011.includes('Recent pairing codes') || phoneSimPage02011.includes('window.confirm')) {
  console.error('Preflight failed. 0.20.12 Phone & SIM page contains retired inventory-console terminology or native confirmation.')
  process.exit(1)
}
if (!dashboard0206.includes('gatewayWorkspaceReadiness(data.devices)')) {
  console.error('Preflight failed. 0.20.12 dashboard must reuse the shared Phone & SIM readiness derivation.')
  process.exit(1)
}
if (!dashboardStyles0206.includes('/* 0.20.11 — Phone & SIM Readiness Control Center */') || !dashboardStyles0206.includes('.phone-readiness-card') || !dashboardStyles0206.includes('.compact-disclosure') || !dashboardStyles0206.includes('.phone-sim-safety-callout')) {
  console.error('Preflight failed. 0.20.12 Phone & SIM control-center styles are incomplete.')
  process.exit(1)
}
if (!phoneSimContract02011.includes('Phone & SIM Readiness Control Center source contract')) {
  console.error('Preflight failed. 0.20.12 Phone & SIM source contract marker is missing.')
  process.exit(1)
}

const importScaleSource = await readFile(new URL('../scripts/test-import-scale0204-source.mjs', import.meta.url), 'utf8')
const importFiles0204 = await readFile(new URL('../src/lib/importFiles.ts', import.meta.url), 'utf8')
const importsApi0204 = await readFile(new URL('../src/lib/importsApi.ts', import.meta.url), 'utf8')
const importsPage0204 = await readFile(new URL('../src/pages/ImportsPage.tsx', import.meta.url), 'utf8')
const importMigration0204 = await readFile(new URL('../supabase/migrations/20261013000100_recipient_import_reliability_scale.sql', import.meta.url), 'utf8')
if (!importScaleSource.includes('recipient import reliability & scale source contract')) {
  console.error('Preflight failed. 0.20.12 recipient import source contract marker is missing.')
  process.exit(1)
}
if (importFiles0204.includes('MAX_IMPORT_FILE_BYTES') || importFiles0204.includes('MAX_IMPORT_ROWS') || !importFiles0204.includes('inflateRawFallback')) {
  console.error('Preflight failed. 0.20.12 parser still contains a retired product cap or lacks the XLSX fallback.')
  process.exit(1)
}
if (!importsApi0204.includes("'begin_contact_import'") || !importsApi0204.includes("'append_contact_import_rows'") || !importsApi0204.includes("'finalize_contact_import'")) {
  console.error('Preflight failed. 0.20.12 batched import staging client contract is incomplete.')
  process.exit(1)
}
if (importsPage0204.includes('max 5 MB') || importsPage0204.includes('MAX_IMPORT_ROWS') || !importsPage0204.includes('import-work-progress')) {
  console.error('Preflight failed. 0.20.12 import UX still exposes a retired cap or lacks progress.')
  process.exit(1)
}
for (const marker of ['begin_contact_import', 'append_contact_import_rows', 'finalize_contact_import', 'abort_contact_import', "'import_fixed_file_size_cap', false", "'import_fixed_row_cap', false"]) {
  if (!importMigration0204.includes(marker)) { console.error(`Preflight failed. 0.20.12 import migration marker missing: ${marker}`); process.exit(1) }
}


const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
const correctiveRoutingContract = await readFile(new URL('../scripts/test-routing-pwa0203r1-source.mjs', import.meta.url), 'utf8')
const correctiveCertifier = await readFile(new URL('../scripts/certify-production0203r1.mjs', import.meta.url), 'utf8')
const correctivePrompts = await readFile(new URL('../src/components/PwaExperiencePrompts.tsx', import.meta.url), 'utf8')
if (
  !Array.isArray(vercelConfig.rewrites)
  || vercelConfig.rewrites.length !== 1
  || vercelConfig.rewrites[0]?.source !== '/(.*)'
  || vercelConfig.rewrites[0]?.destination !== '/index.html'
) {
  console.error('Preflight failed. 0.20.12 Vercel SPA fallback is missing or broadened unexpectedly.')
  process.exit(1)
}
if (!correctiveRoutingContract.includes('production routing & controlled PWA update source contract')) {
  console.error('Preflight failed. 0.20.12 routing/PWA source contract marker is missing.')
  process.exit(1)
}
if (!correctiveCertifier.includes("'test:routing-pwa-source-0203r1'") || !correctiveCertifier.includes("'certify:0203'")) {
  console.error('Preflight failed. 0.20.12 corrective certification chain is incomplete.')
  process.exit(1)
}
if (!correctivePrompts.includes("updating ? 'Updating…' : 'Update now'") || !correctivePrompts.includes('disabled={updating}')) {
  console.error('Preflight failed. 0.20.12 explicit update progress UI is incomplete.')
  process.exit(1)
}

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
if (missingMobileDialogFocusMarkers.length) { console.error(`Preflight failed. 0.20.3 mobile dialog focus markers missing: ${missingMobileDialogFocusMarkers.join(', ')}`); process.exit(1) }


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
if (missingSafeErrorMarkers.length) { console.error(`Preflight failed. 0.20.3 safe-error markers missing: ${missingSafeErrorMarkers.join(', ')}`); process.exit(1) }
if (errorsSource.includes('parts.push(details)') || errorsSource.includes('`Hint: ${hint}`') || errorsSource.includes('`[${code}]`')) {
  console.error('Preflight failed. Raw backend details, hints or codes must not be concatenated into user-facing error text.')
  process.exit(1)
}

const observabilitySource = await readFile(new URL('../src/lib/observability.ts', import.meta.url), 'utf8')
const appErrorBoundarySource = await readFile(new URL('../src/components/AppErrorBoundary.tsx', import.meta.url), 'utf8')
const settingsSource = await readFile(new URL('../src/pages/SettingsPage.tsx', import.meta.url), 'utf8')
const observabilityMarkers = [
  "OBSERVABILITY_RELEASE = '0.20.12'",
  "STORAGE_KEY = 'bulktext:diagnostics:v1'",
  'MAX_EVENTS = 25',
  "window.addEventListener('error'",
  "window.addEventListener('unhandledrejection'",
  'currentRouteGroup',
  'safeToken',
  'sessionStorage',
]
const missingObservabilityMarkers = observabilityMarkers.filter((marker) => !observabilitySource.includes(marker))
if (missingObservabilityMarkers.length) { console.error(`Preflight failed. 0.20.3 observability markers missing: ${missingObservabilityMarkers.join(', ')}`); process.exit(1) }
if (observabilitySource.includes('window.location.href') || observabilitySource.includes('window.location.search') || observabilitySource.includes('localStorage')) {
  console.error('Preflight failed. 0.20.3 diagnostics must not retain full URLs, query strings or persistent local storage.')
  process.exit(1)
}
if (!errorsSource.includes("reportDiagnostic(context, { source: 'handled-error'") || !errorsSource.includes("if (category !== 'domain')")) {
  console.error('Preflight failed. 0.20.3 handled-error observability boundary is incomplete.')
  process.exit(1)
}
if (!appErrorBoundarySource.includes("source: 'react-render'") || !settingsSource.includes('Technical diagnostics') || !settingsSource.includes('Copy diagnostics') || !settingsSource.includes('Clear diagnostics')) {
  console.error('Preflight failed. 0.20.3 render/support diagnostic surfaces are incomplete.')
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
  'supabase!.auth.getUser()',
  "window.addEventListener('online'",
  "window.addEventListener('focus'",
  "document.addEventListener('visibilitychange'",
  'revalidationInFlight',
  'clearAccountScopedState',
  'clearRecentDiagnosticEvents()',
]
const missingBoundaryMarkers = boundaryMarkers.filter((marker) => !authProviderSource.includes(marker))
if (missingBoundaryMarkers.length) { console.error(`Preflight failed. 0.20.3 auth/session markers missing: ${missingBoundaryMarkers.join(', ')}`); process.exit(1) }
if (!returnToSource.includes('safeReturnTo') || !returnToSource.includes("raw.startsWith('//')") || !returnToSource.includes("parsed.pathname.startsWith('/auth/')")) {
  console.error('Preflight failed. 0.20.3 safe returnTo boundary is incomplete.')
  process.exit(1)
}
if (!requireAuthSource.includes('protectedReturnTo(location)') || !loginSource.includes("safeReturnTo(searchParams.get('returnTo'))")) {
  console.error('Preflight failed. 0.20.3 protected returnTo integration is incomplete.')
  process.exit(1)
}
if (!workspaceProviderSource.includes("category === 'authentication' || category === 'permission'") || !workspaceProviderSource.includes('clearOfflineWorkspaceLocator(userId)') || !workspaceProviderSource.includes('workspace: null, authority: null')) {
  console.error('Preflight failed. 0.20.3 workspace authorization-loss boundary is incomplete.')
  process.exit(1)
}
if (!workspaceLocatorSource.includes('clearOfflineWorkspaceLocator(userId: string)')) {
  console.error('Preflight failed. 0.20.3 single-workspace locator invalidation helper is missing.')
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
  console.error('Preflight failed. 0.20.3 initial bootstrap split is missing or providers leaked back into the static entry.')
  process.exit(1)
}
for (const marker of ["import App from './App'", "from './auth/AuthProvider'", "from './workspace/WorkspaceProvider'", '<AuthProvider>', '<WorkspaceProvider>', '<App />']) {
  if (!bootstrapSource.includes(marker)) { console.error(`Preflight failed. 0.20.3 AppBootstrap marker missing: ${marker}`); process.exit(1) }
}
if (
  !bootstrapContractSource.includes('INITIAL_JS_BUDGET_BYTES = 500 * 1024') ||
  !bundleGateSource.includes('MAX_CHUNK_BYTES = 500_000') ||
  !bundleGateSource.includes("value?.name === 'AppBootstrap'") ||
  !bundleGateSource.includes('appEntry[1]?.dynamicImports?.includes(key)')
) {
  console.error('Preflight failed. 0.20.3 bootstrap/bundle correction gates are incomplete.')
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
if (missingRouteLoadingMarkers.length) { console.error(`Preflight failed. 0.20.3 route-loading markers missing: ${missingRouteLoadingMarkers.join(', ')}`); process.exit(1) }
if (!viteSource.includes("manifest: 'asset-manifest.json'")) { console.error('Preflight failed. 0.20.3 Vite asset manifest output is missing.'); process.exit(1) }
for (const marker of ["const VERSION = '0.20.12'", "'/asset-manifest.json'", 'buildManifestAssets', 'cold-start offline route coverage after code splitting', 'async function installedShellNavigation(request)', 'if (installedShell) return installedShell', 'if (networkResponse.ok) return networkResponse']) {
  if (!serviceWorkerSource.includes(marker)) { console.error(`Preflight failed. 0.20.12 PWA shell marker missing: ${marker}`); process.exit(1) }
}
if (serviceWorkerSource.includes('async function networkFirstNavigation(request)')) {
  console.error('Preflight failed. 0.20.12 must not restore network-first controlled HTML navigation.')
  process.exit(1)
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
  if (!pwaProvider0201.includes(marker)) { console.error(`Preflight failed. 0.20.3 PWA lifecycle marker missing: ${marker}`); process.exit(1) }
}
for (const marker of ['Install BulkText App', 'Not now', 'BulkText update ready', 'Update now', 'Later']) {
  if (!pwaPrompts0201.includes(marker)) { console.error(`Preflight failed. 0.20.3 PWA prompt marker missing: ${marker}`); process.exit(1) }
}
if (!landing0201.includes('canInstall ? <button className="marketing-install-link"') || !main0201.includes('<PwaExperiencePrompts />')) {
  console.error('Preflight failed. 0.20.3 install option is not exposed globally and on the public landing navigation.')
  process.exit(1)
}
if (!pwaContract0201.includes('Web 0.20.3 PWA install & update source contract') || !certifier0201.includes("'test:pwa-install-update-0201'")) {
  console.error('Preflight failed. 0.20.3 PWA install/update certification markers are incomplete.')
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
  if (!landing0202.includes(marker)) { console.error(`Preflight failed. 0.20.3 landing UX marker missing: ${marker}`); process.exit(1) }
}
for (const marker of [
  '/* 0.20.2 — Landing page conversion and mobile UX */',
  'overflow-x: clip',
  '@media (max-width: 360px)',
  "content: '↓'",
]) {
  if (!landingStyles0202.includes(marker)) { console.error(`Preflight failed. 0.20.3 landing CSS marker missing: ${marker}`); process.exit(1) }
}
if (!landingContract0202.includes('Web 0.20.3 landing conversion & mobile UX source contract') || !landingCertifier0202.includes("'test:landing-conversion-0202'")) {
  console.error('Preflight failed. 0.20.3 landing conversion certification markers are incomplete.')
  process.exit(1)
}
if (!landing0202.includes('canInstall ? <button className="marketing-install-link"') || !landing0202.includes('await install()')) {
  console.error('Preflight failed. 0.20.3 landing redesign regressed the 0.20.1 Install App contract.')
  process.exit(1)
}


const authLogin0203 = await readFile(new URL('../src/auth/LoginPage.tsx', import.meta.url), 'utf8')
const authSignup0203 = await readFile(new URL('../src/auth/SignupPage.tsx', import.meta.url), 'utf8')
const authPassword0203 = await readFile(new URL('../src/auth/PasswordField.tsx', import.meta.url), 'utf8')
const authStyles0203 = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const authContract0203 = await readFile(new URL('../scripts/test-auth-mobile-polish0203-source.mjs', import.meta.url), 'utf8')
const authCertifier0203 = await readFile(new URL('../scripts/certify-production0203.mjs', import.meta.url), 'utf8')
for (const marker of [
  "import { PasswordField } from './PasswordField'",
  'auth-primary-button',
  'disabled={busy}',
]) {
  const combined = `${authLogin0203}
${authSignup0203}`
  if (!combined.includes(marker)) { console.error(`Preflight failed. 0.20.3 auth mobile polish marker missing: ${marker}`); process.exit(1) }
}
for (const marker of [
  "type={visible ? 'text' : 'password'}",
  'aria-pressed={visible}',
  "const toggleLabel = visible ? 'Hide password' : 'Show password'",
]) {
  if (!authPassword0203.includes(marker)) { console.error(`Preflight failed. 0.20.3 password visibility marker missing: ${marker}`); process.exit(1) }
}
for (const marker of [
  '/* 0.20.3 — Auth screen mobile polish */',
  'place-items: start center',
  'min-height: 100svh',
  '.auth-password-toggle',
]) {
  if (!authStyles0203.includes(marker)) { console.error(`Preflight failed. 0.20.3 auth CSS marker missing: ${marker}`); process.exit(1) }
}
if (!authContract0203.includes('Web 0.20.3 auth screen mobile polish source contract') || !authCertifier0203.includes("'test:auth-mobile-polish-0203'")) {
  console.error('Preflight failed. 0.20.3 auth mobile polish certification markers are incomplete.')
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
  if (!combined.includes(marker)) { console.error(`Preflight failed. 0.20.3 accessibility/form marker missing: ${marker}`); process.exit(1) }
}
if (!phoneNumbersSource0199.includes('Phone number normalization results') || !composerSource0199.includes('aria-invalid={hasTemplateProblem || undefined}')) {
  console.error('Preflight failed. 0.20.3 form result/error semantics are incomplete.')
  process.exit(1)
}
if (!accessibilityContractSource.includes('Web 0.20.3 accessibility & form interaction source contract')) {
  console.error('Preflight failed. 0.20.3 accessibility source contract marker is missing.')
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
  console.error('Preflight failed. 0.20.3 production launch certification markers are incomplete.')
  process.exit(1)
}
if (!launchContractSource.includes('Web 0.20.3 production launch source contract') || !launchBaselineSource.includes('Post-deploy launch checklist')) {
  console.error('Preflight failed. 0.20.3 launch source contract or explicit post-deploy checklist is missing.')
  process.exit(1)
}
if (!launchBaselineSource.includes('initial static JS budget remains `< 500 KiB`') || !launchBaselineSource.includes('every emitted JS chunk remains `< 500,000 bytes`')) {
  console.error('Preflight failed. 0.20.3 production launch certification markers must preserve the 0.19.6-r1 bundle budgets.')
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

console.log('BulkText Web 0.20.12 / backend 0.18.5 preflight PASS')

if (packageJson.bulktext?.backendContractVersion !== '0.18.5') { console.error('Expected backend contract 0.18.5 for Web 0.20.12'); process.exit(1) }
