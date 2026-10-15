-- Preserve only owner-selected audit facts when a tribe is physically removed.
CREATE FUNCTION public.project_retired_admission_policy_snapshot(source_snapshot jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT CASE WHEN source_snapshot IS NULL OR source_snapshot='null'::jsonb THEN 'null'::jsonb ELSE
    coalesce((SELECT jsonb_object_agg(field.name,source_snapshot->field.name)
      FROM unnest(ARRAY['mode','contactType','isOpen','allowCommonExceptions','requiresAdditionalVerification','phoneChannel','allowSmsAlternative','messagingConnectionId','messagingConnectionVersion','verificationEpoch','activatedAt']::text[]) AS field(name) WHERE source_snapshot ? field.name),'{}'::jsonb) END;
$$;
REVOKE ALL ON FUNCTION public.project_retired_admission_policy_snapshot(jsonb) FROM PUBLIC;

CREATE FUNCTION public.project_retired_admission_owner_metadata(requested_resource text,requested_event text,source_metadata jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(field.name,CASE WHEN requested_resource='admission_policy' AND field.name IN ('fromPolicy','toPolicy')
    THEN public.project_retired_admission_policy_snapshot(source_metadata->field.name) ELSE source_metadata->field.name END),'{}'::jsonb)
  FROM unnest(CASE
    WHEN requested_resource='admission_policy' AND requested_event IN ('initialize_admission_policy','update_admission_policy','activate_admission_policy','pause_admission_policy') THEN ARRAY['previousVersion','fromPolicy','toPolicy']::text[]
    WHEN requested_resource='admission_policy' AND requested_event='messaging_selection_replaced' THEN ARRAY['previousVersion','previousConnectionId','previousConnectionVersion','connectionId','connectionVersion','verificationEpoch']::text[]
    WHEN requested_resource='message_delivery' AND requested_event='notification_delivery_recovered' THEN ARRAY['originalDeliveryId','targetConnectionId','originalConnectionId','originalConnectionVersion','originalFromState','originalToState','previousOriginalVersion','originalVersion','originalAttemptId','originalAuthorizedUsagePolicyVersion']::text[]
    WHEN requested_resource='admission_request' THEN ARRAY['fromStatus','toStatus','previousVersion','previousRequestVersion','policyVersion','verificationEpoch','proofId','decisionId','invitationId','previousRetryAllowedAt','retryAllowedAt']::text[]
    WHEN requested_resource='allowlist_entry' THEN ARRAY['fromStatus','toStatus','previousVersion','importId','contactType']::text[]
    WHEN requested_resource='personal_invitation' THEN ARRAY['fromStatus','toStatus','previousVersion','requestId','fromAuthorizationRevoked','toAuthorizationRevoked']::text[]
    WHEN requested_resource='messaging_usage_policy' THEN ARRAY['previousVersion','allowedCountries','verificationDailyLimit','notificationDailyLimit']::text[]
    WHEN requested_resource='messaging_connection' THEN ARRAY['fromState','toState','previousVersion','configurationVersion','previousConfigurationVersion','channel','previousCredentialState','credentialState','credentialMode']::text[]
    WHEN requested_resource='authorized_exposure' THEN ARRAY['surface','itemCount','resourceKind']::text[]
    WHEN requested_resource='messaging_protection' THEN ARRAY['purpose','previousKeyId','activeKeyId','securityEpoch']::text[]
    WHEN requested_resource='membership' THEN ARRAY['membershipInstanceId','fromRole','toRole','fromStatus','toStatus','requestId','decisionId']::text[]
    WHEN requested_resource='admission_proof' THEN ARRAY['fromState','toState','challengeId','requestId','verificationEpoch','channel']::text[]
    ELSE ARRAY[]::text[] END) AS field(name)
  WHERE source_metadata ? field.name;
$$;
REVOKE ALL ON FUNCTION public.project_retired_admission_owner_metadata(text,text,jsonb) FROM PUBLIC;

CREATE FUNCTION public.project_retired_admission_owner_cause(source_cause text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT CASE WHEN source_cause=ANY(ARRAY['additional_verification_required','admission_ineligible','admissions_paused','allowlist_conflict','allowlist_import_conflict','authentication_required','authorized_connection_replacement','candidate_expired','capability_unprepared','challenge_expired','challenge_invalidated','challenge_unavailable','connection_conflict','connection_disconnected','connection_incomplete','connection_replaced','connection_unavailable','contact_binding_conflict','contact_evidence_required','credential_validation_limit_reached','credentials_unprepared','delivery_conflict','delivery_expired','delivery_unknown','dependency_unavailable','diagnostic_unavailable','dispatch_result_unknown','explicit_resend','idempotency_conflict','invalid_credentials','invalid_input','invitation_conflict','invitation_unavailable','leadership_changed','membership_recovery_required','messaging_connection_replaced','missing_capability','operation_unresolved','ordinary_retirement','permission_denied','policy_conflict','policy_verification_context_changed','proof_unavailable','provider_accepted','provider_delivered','provider_rate_limited','provider_rejected','public_contract_unusable','quota_exceeded','reauthentication_required','recipient_not_allowed','request_conflict','resource_unavailable','scheduled_expiration','scope_retired','security_context_changed','security_stop','suspected_compromise','test_mode_connection','transport_timeout','unexpected_failure','upstream_payload_unusable','upstream_rejected','usage_limit_reached','usage_policy_conflict','verification_attempts_exceeded','verification_code_incorrect','worker_lease_expired']::text[]) THEN source_cause ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.project_retired_admission_owner_cause(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.archive_deleted_admission_tribe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  INSERT INTO public.academy_admission_retired_operations(
    id,tribe_id,actor_reference_id,operation_type,idempotency_key,intent_fingerprint,
    fingerprint_key_id,state,version,created_at,completed_at
  ) SELECT id,tribe_id,actor_reference_id,operation_type,idempotency_key,intent_fingerprint,
    fingerprint_key_id,state,version,created_at,completed_at
    FROM public.academy_admission_operations WHERE tribe_id=OLD.id;

  INSERT INTO public.academy_admission_retired_audit_events(
    id,tribe_id,actor_reference_id,operation_id,tribe_lifecycle_operation_id,resource_type,resource_id,event_type,
    rule,cause,resource_version,metadata,created_at
  ) SELECT audit.id,audit.tribe_id,
    CASE WHEN audit.actor_user_id IS NULL THEN NULL
      WHEN audit.actor_user_id=lifecycle.actor_user_id THEN lifecycle.actor_reference_id
      WHEN audit.actor_user_id=operation.actor_user_id THEN operation.actor_reference_id
      ELSE gen_random_uuid() END,
    audit.operation_id,audit.tribe_lifecycle_operation_id,audit.resource_type,audit.resource_id,audit.event_type,
    audit.rule,CASE WHEN audit.cause='scope_retired' THEN 'scope_retired'
      WHEN audit.resource_type='message_delivery' AND audit.event_type='notification_delivery_recovered'
        AND audit.cause='authorized_connection_replacement' THEN audit.cause
      WHEN audit.resource_type='message_delivery' AND audit.event_type='delivery_cancelled'
        AND audit.cause IN ('explicit_resend','suspected_compromise','connection_replaced','candidate_expired') THEN audit.cause
      WHEN audit.resource_type='message_delivery' THEN public.minimized_messaging_delivery_audit_cause(audit.cause)
      ELSE public.project_retired_admission_owner_cause(audit.cause) END,audit.resource_version,
    -- Select immutable owner snapshots even after their shorter-lived resources were purged.
    -- Every listed producer owns this fixed metadata contract; arbitrary extra fields are discarded.
    CASE WHEN audit.resource_type='message_delivery' AND audit.event_type IN (
        'delivery_created','notification_delivery_recovered','delivery_attempt_started','delivery_accepted','delivery_delivered',
        'delivery_failed','delivery_unknown','delivery_suppressed','delivery_deferred','delivery_cancelled','delivery_reconciled') THEN
      jsonb_build_object('fromState',CASE WHEN audit.metadata->>'fromState' IN ('queued','accepted','delivered','failed','unknown','suppressed','cancelled') THEN audit.metadata->>'fromState' ELSE NULL END,
        'toState',CASE WHEN audit.metadata->>'toState' IN ('queued','accepted','delivered','failed','unknown','suppressed','cancelled') THEN audit.metadata->>'toState' ELSE NULL END,
        'previousVersion',audit.metadata->'previousVersion',
        'connectionId',audit.metadata->'connectionId','connectionVersion',audit.metadata->'connectionVersion',
        'channel',CASE WHEN audit.metadata->>'channel' IN ('email','sms','whatsapp') THEN audit.metadata->>'channel' ELSE NULL END,
        'attemptId',audit.metadata->'attemptId','authorizedUsagePolicyVersion',audit.metadata->'authorizedUsagePolicyVersion')
      || CASE WHEN audit.event_type='notification_delivery_recovered' THEN public.project_retired_admission_owner_metadata(audit.resource_type,audit.event_type,audit.metadata) ELSE '{}'::jsonb END
      WHEN audit.cause='scope_retired' AND audit.resource_type='admission_proof'
        AND audit.event_type='proof_invalidated' THEN
      jsonb_build_object('fromState',CASE WHEN audit.metadata->>'fromState' IN ('available','applied') THEN audit.metadata->>'fromState' ELSE NULL END,
        'toState','invalid','challengeId',audit.metadata->'challengeId','requestId',audit.metadata->'requestId',
        'verificationEpoch',audit.metadata->'verificationEpoch',
        'channel',CASE WHEN audit.metadata->>'channel' IN ('email','sms','whatsapp') THEN audit.metadata->>'channel' ELSE NULL END)
      WHEN audit.resource_type='admission_notification' AND audit.event_type IN ('notification_obligation_created','notification_materialized') THEN
      jsonb_build_object('obligationId',audit.metadata->'obligationId','requestId',audit.metadata->'requestId','requestVersion',audit.metadata->'requestVersion',
        'sourceEvent',CASE WHEN audit.metadata->>'sourceEvent' IN ('pending_created','approved','rejected','cancelled','expired','reminder') THEN audit.metadata->>'sourceEvent' ELSE NULL END,
        'audience',CASE WHEN audit.metadata->>'audience' IN ('applicant','reviewer') THEN audit.metadata->>'audience' ELSE NULL END,'durationMs',audit.metadata->'durationMs')
      WHEN audit.resource_type='retention_run' THEN jsonb_build_object('owner',audit.metadata->'owner','processed',audit.metadata->'processed','remaining',audit.metadata->'remaining','cutoff',audit.metadata->'cutoff')
      ELSE public.project_retired_admission_owner_metadata(audit.resource_type,audit.event_type,audit.metadata) END,audit.created_at
    FROM public.academy_admission_audit_events audit
    LEFT JOIN public.academy_admission_operations operation ON operation.id=audit.operation_id AND operation.tribe_id=audit.tribe_id
    LEFT JOIN public.tribe_lifecycle_operations lifecycle ON lifecycle.operation_id=audit.tribe_lifecycle_operation_id AND lifecycle.tribe_id=audit.tribe_id
    WHERE audit.tribe_id=OLD.id;

  INSERT INTO public.academy_admission_retired_bindings(
    id,tribe_id,contact_type,contact_fingerprint,fingerprint_key_id,owner_reference_id,
    first_request_reference_id,first_proof_reference_id,evidence_source,created_at
  ) SELECT id,tribe_id,contact_type,contact_fingerprint,fingerprint_key_id,owner_reference_id,
    first_request_id,first_proof_id,evidence_source,created_at
    FROM public.academy_admission_contact_bindings WHERE tribe_id=OLD.id;

  DELETE FROM public.academy_admission_audit_events WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_admission_contact_bindings WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_admission_membership_effects WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_allowlist_import_rows WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_admission_decisions WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_allowlist_entries WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_allowlist_imports WHERE tribe_id=OLD.id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_deleted_admission_tribe() FROM PUBLIC;
