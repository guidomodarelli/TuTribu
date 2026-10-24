-- Keep the real tribe original separate from the admission ledger, even after deletion.
ALTER TABLE public.academy_admission_audit_events
  ADD COLUMN tribe_lifecycle_operation_id uuid,
  ADD CONSTRAINT admission_audit_tribe_lifecycle_operation_fkey
    FOREIGN KEY(tribe_id,tribe_lifecycle_operation_id)
    REFERENCES public.tribe_lifecycle_operations(tribe_id,operation_id);
ALTER TABLE public.academy_admission_retired_audit_events
  ADD COLUMN tribe_lifecycle_operation_id uuid,
  ADD COLUMN cause text,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT admission_retired_audit_tribe_lifecycle_operation_fkey
    FOREIGN KEY(tribe_id,tribe_lifecycle_operation_id)
    REFERENCES public.tribe_lifecycle_operations(tribe_id,operation_id);

CREATE FUNCTION public.minimized_messaging_delivery_audit_cause(p_cause text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$
  SELECT CASE WHEN p_cause IN (
    'provider_accepted','provider_delivered','provider_rejected','dispatch_result_unknown','worker_lease_expired',
    'delivery_expired','security_context_changed','connection_unavailable','leadership_changed','credentials_unprepared',
    'test_mode_connection','challenge_unavailable','recipient_not_allowed','capability_unprepared','diagnostic_unavailable','quota_exceeded',
    'invalid_input','authentication_required','permission_denied','resource_unavailable','idempotency_conflict',
    'usage_policy_conflict','connection_conflict','delivery_conflict','usage_limit_reached','credential_validation_limit_reached',
    'verification_code_incorrect','challenge_expired','challenge_invalidated','verification_attempts_exceeded',
    'reauthentication_required','connection_incomplete','missing_capability','invalid_credentials','upstream_rejected',
    'provider_rate_limited','transport_timeout','dependency_unavailable','delivery_unknown','operation_unresolved',
    'upstream_payload_unusable','public_contract_unusable','unexpected_failure'
  ) THEN p_cause ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.minimized_messaging_delivery_audit_cause(text) FROM PUBLIC;

CREATE FUNCTION public.bind_admission_audit_tribe_lifecycle_operation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE original_id uuid;
BEGIN
  original_id:=coalesce(NEW.tribe_lifecycle_operation_id,
    nullif(current_setting('app.tribe_lifecycle_operation_id',true),'')::uuid);
  IF original_id IS NOT NULL THEN
    -- Context cannot substitute another tenant, account or nonexistent original.
    PERFORM operation_id FROM public.tribe_lifecycle_operations
      WHERE tribe_id=NEW.tribe_id AND operation_id=original_id
        AND actor_user_id=public.current_app_user_id();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'admission audit lifecycle original is unavailable' USING ERRCODE='42501';
    END IF;
    NEW.tribe_lifecycle_operation_id:=original_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bind_admission_audit_tribe_lifecycle_operation() FROM PUBLIC;
CREATE TRIGGER admission_audit_tribe_lifecycle_origin BEFORE INSERT ON public.academy_admission_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.bind_admission_audit_tribe_lifecycle_operation();

-- Current tribe owner mutations retire admission authority; pause never enters this path.
CREATE OR REPLACE FUNCTION public.close_academy_admission_scope(p_tribe_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_user_id text; challenge_record record; closure_time timestamptz;
BEGIN
  IF p_reason NOT IN ('academy_unavailable','tribe_deleted') THEN
    RAISE EXCEPTION 'admission scope retirement reason is unavailable' USING ERRCODE='23514';
  END IF;
  PERFORM id FROM public.tribes WHERE id=p_tribe_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission scope tenant is unavailable' USING ERRCODE='42501'; END IF;
  FOR current_user_id IN SELECT user_id FROM public.academy_admission_requests
    WHERE tribe_id=p_tribe_id AND status='pending' ORDER BY user_id LOOP
    PERFORM public.close_unavailable_admission_request(p_tribe_id,current_user_id,'academy_unavailable');
  END LOOP;
  PERFORM id FROM public.academy_personal_invitations WHERE tribe_id=p_tribe_id ORDER BY id FOR UPDATE;
  -- Physical deletion cancels every eligible purpose before archival; mode exit remains admission-scoped.
  PERFORM id FROM public.message_deliveries WHERE tribe_id=p_tribe_id
    AND (p_reason='tribe_deleted' OR purpose IN ('admission','admission_notification')) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.contact_verification_challenges WHERE tribe_id=p_tribe_id AND purpose='admission' ORDER BY id FOR UPDATE;
  PERFORM id FROM public.academy_admission_verification_proofs WHERE tribe_id=p_tribe_id ORDER BY id FOR UPDATE;
  closure_time=clock_timestamp();
  UPDATE public.academy_personal_invitations SET status='revoked',revoked_at=closure_time,
    version=version+1,updated_at=closure_time WHERE tribe_id=p_tribe_id AND status='active';
  UPDATE public.academy_personal_invitations SET authorization_revoked_at=closure_time,
    version=version+1,updated_at=closure_time WHERE tribe_id=p_tribe_id AND status='redeemed' AND authorization_revoked_at IS NULL;
  WITH original_proofs AS MATERIALIZED (
    SELECT proof.id,proof.status AS previous_state,challenge.channel
    FROM public.academy_admission_verification_proofs proof
    JOIN public.contact_verification_challenges challenge ON challenge.id=proof.challenge_id AND challenge.tribe_id=proof.tribe_id
    WHERE proof.tribe_id=p_tribe_id AND proof.status IN ('available','applied')
  ), changed_proofs AS (
    UPDATE public.academy_admission_verification_proofs SET status='invalid',invalidated_at=closure_time,
      invalidation_reason=p_reason WHERE tribe_id=p_tribe_id AND status IN ('available','applied')
    RETURNING id,challenge_id,verification_epoch,applied_request_id,status,invalidated_at
  )
  INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,cause,resource_version,metadata,created_at)
    SELECT p_tribe_id,public.current_app_user_id(),'admission_proof',changed.id,NULL,'proof_invalidated',p_reason,'scope_retired',NULL,
      jsonb_build_object('fromState',original.previous_state,'toState',changed.status,'challengeId',changed.challenge_id,
        'requestId',changed.applied_request_id,'verificationEpoch',changed.verification_epoch,'channel',original.channel),changed.invalidated_at
    FROM changed_proofs changed JOIN original_proofs original ON original.id=changed.id;
  FOR challenge_record IN SELECT id,code_envelope_id FROM public.contact_verification_challenges
    WHERE tribe_id=p_tribe_id AND purpose='admission' AND (is_current OR code_mac IS NOT NULL OR code_envelope_id IS NOT NULL)
    ORDER BY id LOOP
    IF challenge_record.code_envelope_id IS NOT NULL THEN
      PERFORM id FROM public.verification_code_envelopes WHERE id=challenge_record.code_envelope_id FOR UPDATE;
    END IF;
    UPDATE public.contact_verification_challenges SET is_current=false,
      state=CASE WHEN state='verified' THEN state ELSE 'invalidated' END,
      invalidated_at=coalesce(invalidated_at,closure_time),invalidation_reason=coalesce(invalidation_reason,p_reason),
      code_mac=NULL,code_envelope_id=NULL,version=version+1 WHERE id=challenge_record.id;
    IF challenge_record.code_envelope_id IS NOT NULL THEN
      DELETE FROM public.verification_code_envelopes WHERE id=challenge_record.code_envelope_id AND challenge_id=challenge_record.id;
    END IF;
  END LOOP;
  -- Attempts, reservation, identity and uncertain leases remain under their original owner.
  WITH cancelled_deliveries AS (
    UPDATE public.message_deliveries delivery SET state='cancelled',last_outcome=p_reason,
      lease_token=NULL,lease_until=NULL,version=version+1
      WHERE tribe_id=p_tribe_id AND (p_reason='tribe_deleted' OR purpose IN ('admission','admission_notification'))
        AND state='queued' AND NOT EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt WHERE attempt.delivery_id=delivery.id)
      RETURNING id,state,version,connection_id,connection_version,channel
  )
  INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,cause,resource_version,metadata,created_at)
    SELECT p_tribe_id,public.current_app_user_id(),'message_delivery',delivery.id,NULL,'delivery_cancelled',p_reason,'scope_retired',delivery.version,
      jsonb_build_object('fromState','queued','toState',delivery.state,'previousVersion',delivery.version-1,
        'connectionId',delivery.connection_id,'connectionVersion',delivery.connection_version,'channel',delivery.channel,
        'attemptId',NULL,'authorizedUsagePolicyVersion',NULL),closure_time
    FROM cancelled_deliveries delivery;
END;
$$;
REVOKE ALL ON FUNCTION public.close_academy_admission_scope(uuid,text) FROM PUBLIC;

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
      WHEN audit.resource_type='message_delivery' AND audit.event_type='delivery_cancelled'
        AND audit.cause IN ('explicit_resend','suspected_compromise','connection_replaced','candidate_expired') THEN audit.cause
      WHEN audit.resource_type='message_delivery' THEN public.minimized_messaging_delivery_audit_cause(audit.cause)
      ELSE NULL END,audit.resource_version,
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
      WHEN audit.cause='scope_retired' AND audit.resource_type='admission_proof'
        AND audit.event_type='proof_invalidated' THEN
      jsonb_build_object('fromState',CASE WHEN audit.metadata->>'fromState' IN ('available','applied') THEN audit.metadata->>'fromState' ELSE NULL END,
        'toState','invalid','challengeId',audit.metadata->'challengeId','requestId',audit.metadata->'requestId',
        'verificationEpoch',audit.metadata->'verificationEpoch',
        'channel',CASE WHEN audit.metadata->>'channel' IN ('email','sms','whatsapp') THEN audit.metadata->>'channel' ELSE NULL END)
      ELSE '{}'::jsonb END,audit.created_at
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

CREATE INDEX admission_retired_delivery_origin_audit_idx
  ON public.academy_admission_retired_audit_events(tribe_id,resource_id,created_at,id)
  WHERE resource_type='message_delivery' AND event_type IN ('delivery_created','notification_delivery_recovered');

-- A committed attempt can receive an original result after its live tenant was removed.
CREATE OR REPLACE FUNCTION public.record_messaging_delivery_audit(
  p_delivery_id uuid,p_previous_state text,p_previous_version integer,p_event_type text,
  p_rule text,p_cause text,p_attempt_id uuid,p_usage_policy_version integer,p_recorded_at timestamptz
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE delivery_record record; original_id uuid; original_actor_reference uuid;
  current_actor text; audit_cause text; audit_metadata jsonb;
BEGIN
  SELECT id,tribe_id,idempotency_key,actor_user_id,state,version,connection_id,connection_version,channel
    INTO delivery_record FROM public.message_deliveries WHERE id=p_delivery_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'messaging delivery audit target is unavailable' USING ERRCODE='23514'; END IF;
  current_actor:=public.current_app_user_id();
  audit_cause:=public.minimized_messaging_delivery_audit_cause(p_cause);
  audit_metadata:=jsonb_build_object('fromState',p_previous_state,'toState',delivery_record.state,'previousVersion',p_previous_version,
    'connectionId',delivery_record.connection_id,'connectionVersion',delivery_record.connection_version,'channel',delivery_record.channel,
    'attemptId',p_attempt_id,'authorizedUsagePolicyVersion',p_usage_policy_version);
  IF EXISTS(SELECT 1 FROM public.tribes WHERE id=delivery_record.tribe_id) THEN
    SELECT coalesce(
      (SELECT operation.id FROM public.academy_admission_operations operation
        WHERE operation.id=delivery_record.idempotency_key AND operation.tribe_id=delivery_record.tribe_id
          AND operation.actor_user_id IS NOT DISTINCT FROM delivery_record.actor_user_id),
      (SELECT operation.id FROM public.academy_admission_audit_events origin
        JOIN public.academy_admission_operations operation ON operation.id=origin.operation_id AND operation.tribe_id=origin.tribe_id
        WHERE origin.tribe_id=delivery_record.tribe_id AND origin.resource_type='message_delivery' AND origin.resource_id=delivery_record.id
          AND origin.event_type IN ('delivery_created','notification_delivery_recovered')
        ORDER BY origin.created_at,origin.id LIMIT 1)
    ) INTO original_id;
    INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,cause,resource_version,metadata,created_at)
      VALUES(delivery_record.tribe_id,current_actor,'message_delivery',delivery_record.id,original_id,p_event_type,p_rule,audit_cause,delivery_record.version,audit_metadata,p_recorded_at);
  ELSE
    -- Archived creation already proved its actor/ledger; never invent that association from a client UUID.
    SELECT operation.id,operation.actor_reference_id INTO original_id,original_actor_reference
      FROM public.academy_admission_retired_audit_events origin
      JOIN public.academy_admission_retired_operations operation ON operation.id=origin.operation_id AND operation.tribe_id=origin.tribe_id
      WHERE origin.tribe_id=delivery_record.tribe_id AND origin.resource_type='message_delivery' AND origin.resource_id=delivery_record.id
        AND origin.event_type IN ('delivery_created','notification_delivery_recovered')
      ORDER BY origin.created_at,origin.id LIMIT 1;
    INSERT INTO public.academy_admission_retired_audit_events(tribe_id,id,actor_reference_id,operation_id,resource_type,resource_id,event_type,rule,cause,resource_version,metadata,created_at)
      VALUES(delivery_record.tribe_id,gen_random_uuid(),
        CASE WHEN current_actor IS NULL THEN NULL
          WHEN current_actor=delivery_record.actor_user_id AND original_actor_reference IS NOT NULL THEN original_actor_reference
          ELSE gen_random_uuid() END,
        original_id,'message_delivery',delivery_record.id,p_event_type,p_rule,audit_cause,delivery_record.version,audit_metadata,p_recorded_at);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_messaging_delivery_audit(uuid,text,integer,text,text,text,uuid,integer,timestamptz) FROM PUBLIC;
