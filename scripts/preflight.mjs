import { readFile } from 'node:fs/promises'
import process from 'node:process'

const requiredFiles = [
  'package.json',
  '.env.example',
  'src/App.tsx',
  'src/auth/AuthProvider.tsx',
  'src/organizations/OrganizationProvider.tsx',
  'src/lib/rbac.ts',
  'src/lib/errors.ts',
  'src/lib/gatewayDevices.ts',
  'src/lib/pairingQr.ts',
  'src/lib/phoneNumbers.ts',
  'src/lib/importFiles.ts',
  'src/lib/importMapping.ts',
  'src/lib/importsApi.ts',
  'src/components/PairingQr.tsx',
  'src/pages/DevicesPage.tsx',
  'src/pages/PhoneNumbersPage.tsx',
  'src/pages/ImportsPage.tsx',
  'src/lib/supabase.ts',
  'supabase/config.toml',
  'supabase/migrations/20260930000100_web_cloud_foundation.sql',
  'supabase/migrations/20260930000200_auth_organizations_rbac.sql',
  'supabase/migrations/20260930000210_organization_rbac_stabilization.sql',
  'supabase/migrations/20260930000220_secure_android_device_pairing.sql',
  'supabase/migrations/20260930000230_device_dashboard_sim_binding.sql',
  'supabase/migrations/20261001000010_phone_number_foundation.sql',
  'supabase/migrations/20261001000020_excel_csv_import.sql',
  'scripts/test-rbac-local.mjs',
  'scripts/test-pairing-local.mjs',
  'scripts/test-device-dashboard-local.mjs',
  'scripts/test-phone-number-local.mjs',
  'scripts/test-import-local.mjs',
  'docs/ANDROID_PAIRING_CONTRACT.md',
  'docs/ANDROID_DEVICE_INVENTORY_CONTRACT.md',
  'docs/PHONE_NUMBER_FOUNDATION.md',
  'docs/EXCEL_CSV_IMPORT.md',
]

const missing = []
for (const file of requiredFiles) {
  try {
    await readFile(new URL(`../${file}`, import.meta.url))
  } catch {
    missing.push(file)
  }
}

if (missing.length) {
  console.error(`Preflight failed. Missing: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('BulkText 0.9.0 preflight PASS')
