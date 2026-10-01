begin;

-- BulkText Fresh 0.13 — SMS Segment & Package Usage Calculator
--
-- Segment calculation itself remains deterministic client-side logic over rendered
-- message text. This migration intentionally adds no campaign/send tables; it only
-- records the calculator contract/capability metadata for the Individual baseline.

update public.app_meta
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
      'version', '0.13.0',
      'phase', 'sms_segment_usage_calculator',
      'tenant_model', 'hidden_personal_workspace',
      'migration_baseline', 'individual-first-clean-v1',
      'active_gateway_limit', 1,
      'explicit_sim_binding_required', true,
      'silent_sim_fallback', false,
      'default_country', 'PK',
      'number_type', 'mobile',
      'normalization_version', 'pk-mobile-v1',
      'recipient_validation_version', 'recipient-validation-v1',
      'consent_suppression_policy_version', 'consent-suppression-v1',
      'message_template_syntax_version', 'bulktext-template-v1',
      'message_template_max_characters', 4000,
      'consent_required_for_eligibility', true,
      'suppression_overrides_consent', true,
      'sms_segment_calculator_enabled', true,
      'sms_segment_model_version', 'gsm7-ucs2-v1',
      'gsm7_single_segment_units', 160,
      'gsm7_multipart_segment_units', 153,
      'unicode_single_segment_units', 70,
      'unicode_multipart_segment_units', 67,
      'sms_usage_is_estimate', true,
      'campaign_confirmation_enabled', false,
      'campaign_send_enabled', false
    ),
    updated_at = now()
where key = 'schema';

commit;
