import { access, readFile } from 'node:fs/promises'
import process from 'node:process'

const requiredFiles = [
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
if (packageJson.version !== '0.18.5') { console.error(`Preflight failed. Expected package version 0.18.5, got ${packageJson.version}`); process.exit(1) }

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
if (releasePackager.includes("version != '0.16.4'") || !releasePackager.includes("version_marker = f\"'version', '{version}'\"")) {
  console.error('Preflight failed. Release packager is not package.json/latest-migration driven.')
  process.exit(1)
}

const freshVerifier = await readFile(new URL('../supabase/verify_fresh_schema.sql', import.meta.url), 'utf8')
for (const marker of ["version', '') <> '0.18.5'", 'Production schema must not expose purge_test_campaign_data', 'Final compliance gate before attempt must be enabled in 0.18.5']) {
  if (!freshVerifier.includes(marker)) { console.error(`Preflight failed. Fresh-schema 0.18.4 marker missing: ${marker}`); process.exit(1) }
}

console.log('BulkText 0.18.5 preflight PASS')
