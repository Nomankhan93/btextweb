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
  'src/components/PairingQr.tsx',
  'src/pages/DevicesPage.tsx',
  'src/lib/supabase.ts',
  'supabase/config.toml',
  'supabase/migrations/20260930000100_web_cloud_foundation.sql',
  'supabase/migrations/20260930000200_auth_organizations_rbac.sql',
  'supabase/migrations/20260930000210_organization_rbac_stabilization.sql',
  'supabase/migrations/20260930000220_secure_android_device_pairing.sql',
  'supabase/migrations/20260930000230_device_dashboard_sim_binding.sql',
  'scripts/test-rbac-local.mjs',
  'scripts/test-pairing-local.mjs',
  'scripts/test-device-dashboard-local.mjs',
  'docs/ANDROID_PAIRING_CONTRACT.md',
  'docs/ANDROID_DEVICE_INVENTORY_CONTRACT.md',
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

console.log('BulkText 0.7.0 preflight PASS')
