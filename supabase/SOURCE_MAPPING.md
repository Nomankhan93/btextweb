# Historical → Fresh Migration Mapping

The fresh migration chain is intentionally shorter than the historical chain.
Do **not** apply the historical and fresh chains together to the same new project.

| Fresh migration | Historical source / purpose |
|---|---|
| `20261001000100_individual_account_foundation.sql` | Merges 0.4 foundation + necessary 0.5/0.5.1 identity/tenant foundations + 0.12.1 Individual Account Transition |
| `20261001000110_secure_android_device_pairing.sql` | Based on 0.6, with one-active-phone Individual MVP invariant |
| `20261001000120_device_dashboard_sim_binding.sql` | Based on 0.7; explicit selected SIM/no silent fallback retained |
| `20261001000130_phone_number_foundation.sql` | Based on 0.8 |
| `20261001000140_excel_csv_import.sql` | Based on 0.9; owner-only Individual permission helper |
| `20261001000150_recipient_validation_preview.sql` | Based on 0.10; owner-only Individual permission helper |
| `20261001000160_consent_suppression.sql` | Based on 0.11; append-only compliance/eligibility retained |
| `20261001000170_message_composer_personalization.sql` | Based on 0.12; owner-only Individual permission helper |
| `20261001000180_sms_segment_usage_calculator.sql` | Based on 0.13 metadata contract |

## Deliberately absent from the fresh database

- `organization_invitations`
- `create_organization(...)`
- `list_my_organizations()`
- organization invitation RPCs
- organization role mutation/member removal RPCs
- user-facing multi-workspace/team capability

`organizations`, `organization_members`, and `organization_id` remain because they are the hidden tenant boundary used by the already-built gateway/import/recipient/compliance/composer architecture.
