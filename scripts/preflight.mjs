import { access, readFile } from 'node:fs/promises'
import process from 'node:process'

const requiredFiles = [
  'package.json',
  '.env.example',
  'src/App.tsx',
  'src/pages/DashboardPage.tsx',
  'src/pages/CampaignsPage.tsx',
  'src/auth/AuthProvider.tsx',
  'src/workspace/WorkspaceProvider.tsx',
  'src/workspace/RequireWorkspace.tsx',
  'src/lib/errors.ts',
  'src/lib/gatewayDevices.ts',
  'src/lib/pairingQr.ts',
  'src/lib/phoneNumbers.ts',
  'src/lib/importFiles.ts',
  'src/lib/importMapping.ts',
  'src/lib/importsApi.ts',
  'src/lib/recipientPreview.ts',
  'src/lib/recipientPreviewApi.ts',
  'src/lib/consentSuppression.ts',
  'src/lib/consentSuppressionApi.ts',
  'src/lib/messageComposer.ts',
  'src/lib/messageComposerApi.ts',
  'src/lib/smsSegments.ts',
  'src/lib/productNavigation.ts',
  'src/lib/supabase.ts',
  'src/components/PairingQr.tsx',
  'src/pages/DevicesPage.tsx',
  'src/pages/PhoneNumbersPage.tsx',
  'src/pages/ImportsPage.tsx',
  'src/pages/RecipientValidationPage.tsx',
  'src/pages/ConsentSuppressionPage.tsx',
  'src/pages/RecipientEligibilityPage.tsx',
  'src/pages/MessageComposerPage.tsx',
  'src/pages/SettingsPage.tsx',
  'supabase/config.toml',
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
  'scripts/test-individual-account-local.mjs',
  'scripts/test-pairing-local.mjs',
  'scripts/test-device-dashboard-local.mjs',
  'scripts/test-phone-number-local.mjs',
  'scripts/test-import-local.mjs',
  'scripts/test-recipient-preview-local.mjs',
  'scripts/test-consent-suppression-local.mjs',
  'scripts/test-composer-local.mjs',
  'docs/INDIVIDUAL_ACCOUNT_TRANSITION.md',
  'docs/ANDROID_PAIRING_CONTRACT.md',
  'docs/ANDROID_DEVICE_INVENTORY_CONTRACT.md',
  'docs/PHONE_NUMBER_FOUNDATION.md',
  'docs/EXCEL_CSV_IMPORT.md',
  'docs/RECIPIENT_VALIDATION_PREVIEW.md',
  'docs/CONSENT_SUPPRESSION.md',
  'docs/MESSAGE_COMPOSER_PERSONALIZATION.md',
  'docs/SMS_SEGMENT_USAGE_CALCULATOR.md',
  'docs/INDIVIDUAL_UX_0.13.1.md',
  'src/test/smsSegments.test.ts',
  'src/test/productNavigation.test.ts',
]

const forbiddenFiles = [
  'src/organizations/OrganizationProvider.tsx',
  'src/organizations/OnboardingPage.tsx',
  'src/organizations/InviteAcceptancePage.tsx',
  'src/organizations/RequireOrganization.tsx',
  'src/pages/TeamPage.tsx',
  'src/lib/rbac.ts',
  'src/test/rbac.test.ts',
  'scripts/test-rbac-local.mjs',
]

const missing = []
for (const file of requiredFiles) {
  try {
    await readFile(new URL(`../${file}`, import.meta.url))
  } catch {
    missing.push(file)
  }
}

const forbiddenPresent = []
for (const file of forbiddenFiles) {
  try {
    await access(new URL(`../${file}`, import.meta.url))
    forbiddenPresent.push(file)
  } catch {
    // Expected: legacy organization/team frontend files are removed.
  }
}

if (missing.length || forbiddenPresent.length) {
  if (missing.length) console.error(`Preflight failed. Missing: ${missing.join(', ')}`)
  if (forbiddenPresent.length) console.error(`Preflight failed. Legacy individual-incompatible files still present: ${forbiddenPresent.join(', ')}`)
  process.exit(1)
}

console.log('BulkText 0.13.1 preflight PASS')
