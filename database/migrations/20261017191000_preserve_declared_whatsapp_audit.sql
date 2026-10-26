-- Preserve the optional policy field without inventing values in older audit snapshots.
CREATE OR REPLACE FUNCTION public.project_retired_admission_policy_snapshot(source_snapshot jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT CASE WHEN source_snapshot IS NULL OR source_snapshot='null'::jsonb THEN 'null'::jsonb ELSE
    coalesce((SELECT jsonb_object_agg(field.name,source_snapshot->field.name)
      FROM unnest(ARRAY['mode','contactType','isOpen','allowCommonExceptions','requiresAdditionalVerification','requiresWhatsappNumber','phoneChannel','allowSmsAlternative','messagingConnectionId','messagingConnectionVersion','verificationEpoch','activatedAt']::text[]) AS field(name) WHERE source_snapshot ? field.name),'{}'::jsonb) END;
$$;
REVOKE ALL ON FUNCTION public.project_retired_admission_policy_snapshot(jsonb) FROM PUBLIC;

-- Keep the safe declared-number denial while discarding unknown diagnostics.
CREATE OR REPLACE FUNCTION public.project_retired_admission_owner_cause(source_cause text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT CASE WHEN source_cause=ANY(ARRAY['additional_verification_required','admission_ineligible','admissions_paused','allowlist_conflict','allowlist_import_conflict','authentication_required','authorized_connection_replacement','candidate_expired','capability_unprepared','challenge_expired','challenge_invalidated','challenge_unavailable','connection_conflict','connection_disconnected','connection_incomplete','connection_replaced','connection_unavailable','contact_binding_conflict','contact_evidence_required','credential_validation_limit_reached','credentials_unprepared','delivery_conflict','delivery_expired','delivery_unknown','dependency_unavailable','diagnostic_unavailable','dispatch_result_unknown','explicit_resend','idempotency_conflict','invalid_credentials','invalid_input','invitation_conflict','invitation_unavailable','leadership_changed','membership_recovery_required','messaging_connection_replaced','missing_capability','operation_unresolved','ordinary_retirement','permission_denied','policy_conflict','policy_verification_context_changed','proof_unavailable','provider_accepted','provider_delivered','provider_rate_limited','provider_rejected','public_contract_unusable','quota_exceeded','reauthentication_required','recipient_not_allowed','request_conflict','resource_unavailable','scheduled_expiration','scope_retired','security_context_changed','security_stop','suspected_compromise','test_mode_connection','transport_timeout','unexpected_failure','upstream_payload_unusable','upstream_rejected','usage_limit_reached','usage_policy_conflict','verification_attempts_exceeded','verification_code_incorrect','whatsapp_number_required','worker_lease_expired']::text[]) THEN source_cause ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.project_retired_admission_owner_cause(text) FROM PUBLIC;

