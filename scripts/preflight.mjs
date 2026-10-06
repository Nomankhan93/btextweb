import { access, readFile } from 'node:fs/promises'
import process from 'node:process'

const requiredFiles = [
  'package.json','.env.example','src/App.tsx','src/pages/DashboardPage.tsx','src/pages/CampaignsPage.tsx',
  'src/pages/CampaignConfirmationPage.tsx','src/pages/CampaignDetailPage.tsx','src/pages/SimpleCampaignPage.tsx','src/auth/AuthProvider.tsx',
  'src/workspace/WorkspaceProvider.tsx','src/workspace/RequireWorkspace.tsx','src/lib/errors.ts','src/lib/gatewayDevices.ts',
  'src/lib/messageComposer.ts','src/lib/messageComposerApi.ts','src/lib/smsSegments.ts','src/lib/campaignConfirmation.ts',
  'src/lib/campaignConfirmationApi.ts','src/lib/gatewayPreflight.ts','src/lib/gatewayPreflightApi.ts','src/lib/durableQueue.ts','src/lib/durableQueueApi.ts','src/lib/productNavigation.ts',
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
  'docs/CAMPAIGN_CONFIRMATION_SNAPSHOT.md','docs/GATEWAY_PREFLIGHT_SEND_AUTHORIZATION.md','docs/DURABLE_CLOUD_QUEUE.md',
  'scripts/test-durable-queue-local.mjs','scripts/release-package.py','scripts/release-package.sh','supabase/verify_fresh_schema.sql','src/test/smsSegments.test.ts','src/test/campaignConfirmation.test.ts','src/test/gatewayPreflight.test.ts','src/test/durableQueue.test.ts','src/test/productNavigation.test.ts',
]
const forbiddenFiles = ['src/organizations/OrganizationProvider.tsx','src/organizations/OnboardingPage.tsx','src/organizations/InviteAcceptancePage.tsx','src/organizations/RequireOrganization.tsx','src/pages/TeamPage.tsx','src/lib/rbac.ts','src/test/rbac.test.ts','scripts/test-rbac-local.mjs']
const missing=[]; for (const file of requiredFiles) { try { await readFile(new URL(`../${file}`,import.meta.url)) } catch { missing.push(file) } }
const forbiddenPresent=[]; for (const file of forbiddenFiles) { try { await access(new URL(`../${file}`,import.meta.url)); forbiddenPresent.push(file) } catch {} }
if (missing.length || forbiddenPresent.length) { if(missing.length) console.error(`Preflight failed. Missing: ${missing.join(', ')}`); if(forbiddenPresent.length) console.error(`Preflight failed. Legacy files present: ${forbiddenPresent.join(', ')}`); process.exit(1) }
console.log('BulkText 0.16.4 preflight PASS')
