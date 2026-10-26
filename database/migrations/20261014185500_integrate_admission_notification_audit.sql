-- Preserve original paid/lifecycle/expiration owners and fixed archived facts.
CREATE OR REPLACE FUNCTION public.resolve_paid_admission_request(p_effect_id uuid,p_tribe_id uuid,p_user_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  effect public.subscription_membership_effects%ROWTYPE;
  member_record public.tribe_members%ROWTYPE;
  request_record public.academy_admission_requests%ROWTYPE;
  policy_record public.academy_admission_policies%ROWTYPE;
  resolution_decision_id uuid;
  resolution_obligation_id uuid;
  final_now timestamptz;
  resolution_status text;
  resolution_rule text;
BEGIN
  SELECT * INTO effect FROM public.subscription_membership_effects
    WHERE id=p_effect_id AND tribe_id=p_tribe_id AND user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'paid admission resolution source is unavailable' USING ERRCODE='42501'; END IF;
  -- Pin before tribe/member locks, including the creator FK checked by account deletion.
  PERFORM id FROM public."user" WHERE id=public.current_app_user_id() FOR SHARE;
  PERFORM id FROM public.tribes WHERE id=p_tribe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'paid admission resolution tenant is unavailable' USING ERRCODE='42501'; END IF;
  PERFORM id FROM public.tribe_members WHERE tribe_id=p_tribe_id AND user_id=public.current_app_user_id() FOR SHARE;
  PERFORM id FROM public."user" WHERE id=p_user_id FOR SHARE;
  SELECT * INTO member_record FROM public.tribe_members
    WHERE id=effect.member_id AND tribe_id=p_tribe_id AND user_id=p_user_id FOR SHARE;
  IF NOT FOUND OR member_record.role<>'tribemate' OR member_record.status NOT IN ('active','muted')
    OR member_record.subscription_membership_effect_id IS DISTINCT FROM p_effect_id THEN
    RAISE EXCEPTION 'paid admission resolution requires its current readable membership' USING ERRCODE='42501';
  END IF;
  SELECT * INTO effect FROM public.subscription_membership_effects
    WHERE id=p_effect_id AND tribe_id=p_tribe_id AND user_id=p_user_id FOR SHARE;
  IF NOT FOUND OR effect.applied_at IS NULL OR effect.revoked_at IS NOT NULL
    OR effect.member_id IS DISTINCT FROM member_record.id OR effect.target_status IS DISTINCT FROM member_record.status THEN
    RAISE EXCEPTION 'paid admission resolution source is not currently applied' USING ERRCODE='42501';
  END IF;
  IF NOT coalesce(public.can_manage_tribe_subscription_prices(p_tribe_id)
    OR public.current_app_user_id()=p_user_id OR public.is_mercado_pago_webhook_verified(),false) THEN
    RAISE EXCEPTION 'paid admission resolution requires current payment owner authority' USING ERRCODE='42501';
  END IF;
  SELECT * INTO policy_record FROM public.academy_admission_policies WHERE tribe_id=p_tribe_id FOR SHARE;
  SELECT * INTO request_record FROM public.academy_admission_requests
    WHERE tribe_id=p_tribe_id AND user_id=p_user_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Clock and authority are sampled after the actual source/request waits.
  final_now=clock_timestamp();
  IF NOT coalesce(public.can_manage_tribe_subscription_prices(p_tribe_id)
    OR public.current_app_user_id()=p_user_id OR public.is_mercado_pago_webhook_verified(),false) THEN
    RAISE EXCEPTION 'paid admission resolution authority changed' USING ERRCODE='42501';
  END IF;
  resolution_status=CASE WHEN request_record.expires_at<=final_now THEN 'expired' ELSE 'cancelled' END;
  resolution_rule=CASE WHEN resolution_status='expired' THEN 'expired' ELSE 'external_resolution' END;
  resolution_decision_id=gen_random_uuid();
  resolution_obligation_id=gen_random_uuid();
  INSERT INTO public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_kind,
    rule,policy_version,verification_epoch,decided_at)
    VALUES(resolution_decision_id,request_record.id,p_tribe_id,p_user_id,request_record.version,resolution_status,'system',resolution_rule,
      coalesce(policy_record.version,(request_record.original_policy_snapshot->>'version')::integer),
      coalesce(policy_record.verification_epoch,(request_record.original_policy_snapshot->>'verificationEpoch')::integer),final_now);
  UPDATE public.academy_admission_requests SET status=resolution_status,version=version+1,decision_id=resolution_decision_id,
    cancel_reason=CASE WHEN resolution_status='cancelled' THEN resolution_rule ELSE NULL END
    WHERE id=request_record.id AND tribe_id=p_tribe_id AND user_id=p_user_id AND status='pending' AND version=request_record.version;
  IF NOT FOUND THEN RAISE EXCEPTION 'paid admission resolution request changed' USING ERRCODE='40001'; END IF;
  PERFORM public.create_admission_notification_obligation(resolution_obligation_id,p_tribe_id,request_record.id,p_user_id,resolution_status);
  INSERT INTO public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,resource_version,metadata,created_at)
    VALUES(p_tribe_id,'admission_request',request_record.id,resolution_status,resolution_rule,request_record.version+1,
      jsonb_build_object('subscriptionMembershipEffectId',p_effect_id),final_now);
  PERFORM public.enqueue_admission_notification(resolution_obligation_id,p_user_id,'applicant');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_unavailable_admission_request(p_tribe_id uuid,p_user_id text,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  request_record public.academy_admission_requests%ROWTYPE;
  policy_record public.academy_admission_policies%ROWTYPE;
  resolution_decision_id uuid;
  resolution_obligation_id uuid;
  final_now timestamptz;
  resolution_status text;
  resolution_rule text;
BEGIN
  IF p_reason NOT IN ('academy_unavailable','membership_deleted','nonrecoverable_membership','account_deleted') THEN
    RAISE EXCEPTION 'admission lifecycle source is unavailable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.academy_admission_requests WHERE tribe_id=p_tribe_id AND user_id=p_user_id AND status='pending') THEN RETURN false; END IF;
  -- Row triggers run after their source row was locked. Never wait backwards on
  -- another writer's tribe lock; reject the whole source mutation for retry.
  PERFORM id FROM public.tribes WHERE id=p_tribe_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO policy_record FROM public.academy_admission_policies WHERE tribe_id=p_tribe_id FOR SHARE;
  SELECT * INTO request_record FROM public.academy_admission_requests
    WHERE tribe_id=p_tribe_id AND user_id=p_user_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  final_now=clock_timestamp();
  resolution_status=CASE WHEN request_record.expires_at<=final_now THEN 'expired' ELSE 'cancelled' END;
  resolution_rule=CASE WHEN resolution_status='expired' THEN 'expired' ELSE p_reason END;
  resolution_decision_id=gen_random_uuid();
  resolution_obligation_id=gen_random_uuid();
  INSERT INTO public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_kind,
    rule,policy_version,verification_epoch,decided_at)
    VALUES(resolution_decision_id,request_record.id,p_tribe_id,p_user_id,request_record.version,resolution_status,'system',resolution_rule,
      coalesce(policy_record.version,(request_record.original_policy_snapshot->>'version')::integer),
      coalesce(policy_record.verification_epoch,(request_record.original_policy_snapshot->>'verificationEpoch')::integer),final_now);
  UPDATE public.academy_admission_requests SET status=resolution_status,version=version+1,decision_id=resolution_decision_id,
    cancel_reason=CASE WHEN resolution_status='cancelled' THEN resolution_rule ELSE NULL END
    WHERE id=request_record.id AND tribe_id=p_tribe_id AND user_id=p_user_id AND status='pending' AND version=request_record.version;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission lifecycle request changed' USING ERRCODE='40001'; END IF;
  PERFORM public.create_admission_notification_obligation(resolution_obligation_id,p_tribe_id,request_record.id,p_user_id,resolution_status);
  INSERT INTO public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,resource_version,created_at)
    VALUES(p_tribe_id,'admission_request',request_record.id,resolution_status,resolution_rule,request_record.version+1,final_now);
  PERFORM public.enqueue_admission_notification(resolution_obligation_id,p_user_id,'applicant');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_academy_admission_requests(requested_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE candidate record; request_record public.academy_admission_requests%ROWTYPE;
  policy_record public.academy_admission_policies%ROWTYPE;
  server_now timestamptz; expiration_decision_id uuid; obligation_id uuid;
  expired_count integer=0; tribe_expired integer; run_id uuid=gen_random_uuid(); run_started timestamptz=clock_timestamp();
BEGIN
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>100 THEN
    RAISE EXCEPTION 'admission request expiration batch is invalid' USING ERRCODE='23514';
  END IF;
  -- Skip busy tribes before limiting available work; a held fence cannot starve another tribe.
  FOR candidate IN
    SELECT tribe.id FROM public.tribes tribe
    WHERE EXISTS (SELECT 1 FROM public.academy_admission_requests request
      WHERE request.tribe_id=tribe.id AND request.status='pending' AND request.expires_at<=clock_timestamp())
    ORDER BY tribe.id LIMIT requested_limit FOR UPDATE OF tribe SKIP LOCKED
  LOOP
    tribe_expired=0;
    FOR request_record IN
      SELECT * FROM public.academy_admission_requests
      WHERE tribe_id=candidate.id AND status='pending' AND expires_at<=clock_timestamp()
      ORDER BY expires_at,id LIMIT requested_limit-expired_count FOR UPDATE SKIP LOCKED
    LOOP
    server_now=clock_timestamp();
    IF request_record.status<>'pending' OR request_record.expires_at>server_now THEN CONTINUE; END IF;
    SELECT * INTO policy_record FROM public.academy_admission_policies WHERE tribe_id=request_record.tribe_id;
    expiration_decision_id=gen_random_uuid();
    obligation_id=gen_random_uuid();
    INSERT INTO public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,
      outcome,actor_kind,rule,policy_version,verification_epoch,decided_at)
    VALUES(expiration_decision_id,request_record.id,request_record.tribe_id,request_record.user_id,request_record.version,
      'expired','system','expired',coalesce(policy_record.version,(request_record.original_policy_snapshot->>'version')::integer),
      coalesce(policy_record.verification_epoch,(request_record.original_policy_snapshot->>'verificationEpoch')::integer),server_now);
    UPDATE public.academy_admission_requests SET status='expired',decision_id=expiration_decision_id,version=version+1
      WHERE id=request_record.id AND tribe_id=request_record.tribe_id AND user_id=request_record.user_id
      AND status='pending' AND version=request_record.version AND expires_at<=clock_timestamp();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'admission request expiration lost its locked version' USING ERRCODE='40001';
    END IF;
    PERFORM public.create_admission_notification_obligation(obligation_id,request_record.tribe_id,request_record.id,request_record.user_id,'expired',NULL,server_now);
    PERFORM public.enqueue_admission_notification(obligation_id,request_record.user_id,'applicant');
    INSERT INTO public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,resource_version,metadata,created_at)
      VALUES(request_record.tribe_id,'admission_request',request_record.id,'expired','expired',request_record.version+1,
        jsonb_build_object('fromStatus','pending','toStatus','expired','previousVersion',request_record.version,
          'policyVersion',coalesce(policy_record.version,(request_record.original_policy_snapshot->>'version')::integer),
          'verificationEpoch',coalesce(policy_record.verification_epoch,(request_record.original_policy_snapshot->>'verificationEpoch')::integer),
          'proofId',request_record.proof_id,'decisionId',expiration_decision_id,'invitationId',request_record.invitation_id),server_now);
    expired_count=expired_count+1; tribe_expired=tribe_expired+1;
    END LOOP;
    IF tribe_expired>0 THEN
      INSERT INTO public.academy_admission_worker_runs(run_id,tribe_id,operation,started_at,finished_at,processed)
        VALUES(run_id,candidate.id,'admission_expiration',run_started,clock_timestamp(),tribe_expired);
    END IF;
    IF expired_count>=requested_limit THEN EXIT; END IF;
  END LOOP;
  RETURN expired_count;
END;
$$;

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
      WHEN audit.resource_type='admission_notification' AND audit.event_type IN ('notification_obligation_created','notification_materialized') THEN
      jsonb_build_object('obligationId',audit.metadata->'obligationId','requestId',audit.metadata->'requestId','requestVersion',audit.metadata->'requestVersion',
        'sourceEvent',CASE WHEN audit.metadata->>'sourceEvent' IN ('pending_created','approved','rejected','cancelled','expired','reminder') THEN audit.metadata->>'sourceEvent' ELSE NULL END,
        'audience',CASE WHEN audit.metadata->>'audience' IN ('applicant','reviewer') THEN audit.metadata->>'audience' ELSE NULL END,'durationMs',audit.metadata->'durationMs')
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

-- Combine original committed worker observations with actual per-tribe dispatch phases.
CREATE OR REPLACE FUNCTION public.read_academy_admission_metrics(p_tribe_id uuid,p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_record record; observed_at timestamptz; day_start timestamptz; result jsonb;
BEGIN
  IF NOT public.lock_academy_admission_administrative_reader(p_tribe_id,p_session_id) THEN RETURN NULL; END IF;
  SELECT * INTO actor_record FROM public.read_admission_reviewer_context(p_tribe_id,p_session_id);
  IF NOT FOUND OR actor_record.role IS DISTINCT FROM 'leader' OR actor_record.status IS DISTINCT FROM 'active' THEN RETURN NULL; END IF;
  observed_at:=clock_timestamp();
  day_start:=date_trunc('day',observed_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  WITH live_requests AS MATERIALIZED (
    SELECT id,status,submitted_at FROM public.academy_admission_requests WHERE tribe_id=p_tribe_id
  ), retained_requests AS (
    SELECT DISTINCT ON(audit.resource_id) audit.resource_id AS id,audit.event_type AS status,audit.created_at AS submitted_at
      FROM public.academy_admission_audit_events audit WHERE audit.tribe_id=p_tribe_id AND audit.resource_type='admission_request'
        AND audit.event_type IN ('approved','rejected','cancelled','expired')
        AND NOT EXISTS(SELECT 1 FROM live_requests request WHERE request.id=audit.resource_id)
      ORDER BY audit.resource_id,audit.created_at DESC,audit.id DESC
  ), requests AS (SELECT id,status,submitted_at FROM live_requests UNION ALL SELECT id,status,submitted_at FROM retained_requests),
  live_decisions AS MATERIALIZED (
    SELECT request_id,actor_kind FROM public.academy_admission_decisions WHERE tribe_id=p_tribe_id AND outcome IN ('approved','rejected')
  ), retained_decisions AS (
    SELECT DISTINCT ON(audit.resource_id) audit.resource_id AS request_id,CASE WHEN audit.rule='automatic' THEN 'system' ELSE 'user' END AS actor_kind
      FROM public.academy_admission_audit_events audit WHERE audit.tribe_id=p_tribe_id AND audit.resource_type='admission_request'
        AND audit.event_type IN ('approved','rejected') AND audit.rule IN ('automatic','manual_review')
        AND NOT EXISTS(SELECT 1 FROM live_decisions decision WHERE decision.request_id=audit.resource_id)
      ORDER BY audit.resource_id,audit.created_at DESC,audit.id DESC
  ), decisions AS (SELECT request_id,actor_kind FROM live_decisions UNION ALL SELECT request_id,actor_kind FROM retained_decisions),
  live_deliveries AS MATERIALIZED (
    SELECT id,state,created_at,lease_until FROM public.message_deliveries WHERE tribe_id=p_tribe_id
  ), retained_deliveries AS (
    SELECT DISTINCT ON(audit.resource_id) audit.resource_id AS id,audit.metadata->>'toState' AS state,audit.created_at,NULL::timestamptz AS lease_until
      FROM public.academy_admission_audit_events audit WHERE audit.tribe_id=p_tribe_id AND audit.resource_type='message_delivery'
        AND audit.event_type IN ('delivery_accepted','delivery_delivered','delivery_failed','delivery_unknown','delivery_suppressed','delivery_cancelled','delivery_reconciled')
        AND audit.metadata->>'toState' IN ('accepted','delivered','failed','unknown','suppressed','cancelled')
        AND NOT EXISTS(SELECT 1 FROM live_deliveries delivery WHERE delivery.id=audit.resource_id)
      ORDER BY audit.resource_id,audit.created_at DESC,audit.id DESC
  ), deliveries AS (SELECT id,state,created_at,lease_until FROM live_deliveries UNION ALL SELECT id,state,created_at,lease_until FROM retained_deliveries),
  live_attempts AS MATERIALIZED (
    SELECT id::text AS id,state FROM public.message_delivery_attempts WHERE tribe_id=p_tribe_id
  ), retained_attempts AS (
    SELECT DISTINCT ON(audit.metadata->>'attemptId') audit.metadata->>'attemptId' AS id,
      CASE WHEN audit.event_type='delivery_attempt_started' THEN 'in_flight'
        WHEN audit.metadata->>'toState'='failed' THEN 'rejected' ELSE audit.metadata->>'toState' END AS state
      FROM public.academy_admission_audit_events audit WHERE audit.tribe_id=p_tribe_id AND audit.resource_type='message_delivery'
        AND audit.event_type IN ('delivery_attempt_started','delivery_accepted','delivery_delivered','delivery_failed','delivery_unknown','delivery_reconciled')
        AND audit.metadata->>'attemptId' IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM live_attempts attempt WHERE attempt.id=audit.metadata->>'attemptId')
      ORDER BY audit.metadata->>'attemptId',audit.created_at DESC,audit.id DESC
  ), attempts AS (SELECT id,state FROM live_attempts UNION ALL SELECT id,state FROM retained_attempts),
  verified_channels AS (
    SELECT channel,count(*) AS issued,count(*) FILTER(WHERE verified_at IS NOT NULL) AS verified,
      count(*) FILTER(WHERE state='invalidated') AS invalidated,count(*) FILTER(WHERE state<>'verified' AND expires_at<=observed_at) AS expired
      FROM public.contact_verification_challenges WHERE tribe_id=p_tribe_id AND purpose='admission' GROUP BY channel
  ), failures AS (
    SELECT channel,count(*) AS failed FROM public.messaging_usage_events WHERE tribe_id=p_tribe_id AND purpose='admission' AND event_type='code_failure' GROUP BY channel
  ), verification AS (
    SELECT channel,coalesce(issued,0) AS issued,coalesce(verified,0) AS verified,coalesce(invalidated,0) AS invalidated,
      coalesce(expired,0) AS expired,coalesce(failed,0) AS failed FROM verified_channels FULL JOIN failures USING(channel)
  ), delivery_errors AS (
    SELECT id AS source_id,'delivery'::text AS source_kind,
      CASE WHEN cause='provider_rejected' THEN 'upstream_rejected' WHEN cause IN ('dispatch_result_unknown','worker_lease_expired') THEN 'delivery_unknown'
        WHEN cause='quota_exceeded' THEN 'usage_limit_reached' WHEN cause IN ('connection_unavailable','security_context_changed','leadership_changed') THEN 'connection_incomplete'
        WHEN cause IN ('credentials_unprepared','test_mode_connection','capability_unprepared','diagnostic_unavailable') THEN 'missing_capability'
        WHEN cause IN ('challenge_unavailable','delivery_expired') THEN 'resource_unavailable' ELSE cause END AS code
      FROM public.academy_admission_audit_events WHERE tribe_id=p_tribe_id AND resource_type='message_delivery'
        AND event_type IN ('delivery_failed','delivery_unknown','delivery_suppressed','delivery_deferred')
  ), operation_errors AS (
    SELECT id AS source_id,'operation'::text AS source_kind,public_result->>'code' AS code
      FROM public.academy_admission_operations WHERE tribe_id=p_tribe_id AND state='completed' AND public_result->>'outcome'='denied'
  ), error_counts AS (
    SELECT code,count(*) AS count FROM (SELECT source_id,source_kind,code FROM delivery_errors UNION ALL SELECT source_id,source_kind,code FROM operation_errors) observations
      WHERE code IN ('invalid_input','authentication_required','permission_denied','resource_unavailable','invitation_unavailable','policy_conflict','request_conflict','idempotency_conflict',
        'allowlist_conflict','allowlist_import_conflict','invitation_conflict','usage_policy_conflict','connection_conflict','recipient_not_allowed','contact_evidence_required','additional_verification_required',
        'contact_binding_conflict','challenge_expired','challenge_invalidated','proof_unavailable','verification_attempts_exceeded','usage_limit_reached','verification_code_incorrect','reauthentication_required',
        'admissions_paused','admission_ineligible','membership_recovery_required','connection_incomplete','missing_capability','invalid_credentials','upstream_rejected','provider_rate_limited','transport_timeout',
        'dependency_unavailable','delivery_unknown','operation_unresolved','upstream_payload_unusable','public_contract_unusable','unexpected_failure') GROUP BY code
  ), operation_samples AS (
    SELECT CASE WHEN operation_type IN ('submit_admission','cancel_admission_request') THEN 'admission'
      WHEN operation_type IN ('decide_admission_request','allow_admission_retry') THEN 'review'
      WHEN operation_type IN ('issue_contact_challenge','resend_contact_challenge','verify_contact_challenge','attach_admission_proof') THEN 'verification' END AS phase,
      ceil(extract(epoch FROM completed_at-created_at)*1000) AS duration_ms
      FROM public.academy_admission_operations WHERE tribe_id=p_tribe_id AND state='completed' AND completed_at>=created_at
  ), duration_samples AS (
    SELECT phase,duration_ms FROM operation_samples WHERE phase IS NOT NULL
    UNION ALL SELECT 'dispatch',ceil(extract(epoch FROM completed_at-send_authorized_at)*1000)
      FROM public.message_delivery_attempts WHERE tribe_id=p_tribe_id AND completed_at>=send_authorized_at
    UNION ALL SELECT 'retention',ceil(extract(epoch FROM finished_at-started_at)*1000)
      FROM public.academy_admission_worker_runs WHERE tribe_id=p_tribe_id AND operation='admission_expiration'
    UNION ALL SELECT phase,duration_ms FROM public.messaging_dispatch_phase_samples WHERE tribe_id=p_tribe_id
    UNION ALL SELECT 'notification',(metadata->>'durationMs')::numeric FROM public.academy_admission_audit_events WHERE tribe_id=p_tribe_id AND resource_type='admission_notification' AND event_type='notification_materialized'
  ), durations AS (SELECT phase,count(*) AS samples,percentile_disc(0.95) WITHIN GROUP(ORDER BY duration_ms) AS p95 FROM duration_samples GROUP BY phase)
  SELECT jsonb_build_object('tribeId',p_tribe_id,'asOf',observed_at,
    'requests',(SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status='pending'),'approved',count(*) FILTER(WHERE status='approved'),'rejected',count(*) FILTER(WHERE status='rejected'),
      'cancelled',count(*) FILTER(WHERE status='cancelled'),'expired',count(*) FILTER(WHERE status='expired'),
      'oldestPendingAgeMs',CASE WHEN count(*) FILTER(WHERE status='pending')=0 THEN NULL ELSE greatest(0,ceil(extract(epoch FROM observed_at-min(submitted_at) FILTER(WHERE status='pending'))*1000)) END) FROM requests),
    'reviews',(SELECT jsonb_build_object('automatic',count(*) FILTER(WHERE actor_kind='system'),'manual',count(*) FILTER(WHERE actor_kind='user')) FROM decisions),
    'verification',coalesce((SELECT jsonb_agg(jsonb_build_object('channel',channel,'issued',issued,'verified',verified,'invalidated',invalidated,'expired',expired,'failedAttempts',failed) ORDER BY channel) FROM verification),'[]'::jsonb),
    'deliveries',(SELECT jsonb_build_object('queued',count(*) FILTER(WHERE state='queued'),'accepted',count(*) FILTER(WHERE state='accepted'),'delivered',count(*) FILTER(WHERE state='delivered'),
      'failed',count(*) FILTER(WHERE state='failed'),'unknown',count(*) FILTER(WHERE state='unknown'),'suppressed',count(*) FILTER(WHERE state='suppressed'),'cancelled',count(*) FILTER(WHERE state='cancelled'),
      'inFlightLeases',count(*) FILTER(WHERE state='queued' AND lease_until>observed_at),
      'oldestQueuedAgeMs',CASE WHEN count(*) FILTER(WHERE state='queued')=0 THEN NULL ELSE greatest(0,ceil(extract(epoch FROM observed_at-min(created_at) FILTER(WHERE state='queued'))*1000)) END) FROM deliveries),
    'attempts',(SELECT jsonb_build_object('inFlight',count(*) FILTER(WHERE state='in_flight'),'accepted',count(*) FILTER(WHERE state='accepted'),'delivered',count(*) FILTER(WHERE state='delivered'),'rejected',count(*) FILTER(WHERE state='rejected'),'unknown',count(*) FILTER(WHERE state='unknown')) FROM attempts),
    'usage',jsonb_build_object('policyVersion',(SELECT version FROM public.messaging_usage_policies WHERE tribe_id=p_tribe_id),'dayStartUtc',day_start,
      'verificationToday',(SELECT count(*) FROM public.messaging_usage_reservations WHERE tribe_id=p_tribe_id AND category='verification' AND state='consumed' AND reserved_at>=day_start AND reserved_at<day_start+interval '1 day'),
      'notificationToday',(SELECT count(*) FROM public.messaging_usage_reservations WHERE tribe_id=p_tribe_id AND category='notification' AND state='consumed' AND reserved_at>=day_start AND reserved_at<day_start+interval '1 day')),
    'errors',coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'count',count) ORDER BY code) FROM error_counts),'[]'::jsonb),
    'lastSuccessfulRun',(SELECT jsonb_build_object('operation',operation,'at',finished_at) FROM (SELECT run_id,operation,finished_at FROM public.academy_admission_worker_runs WHERE tribe_id=p_tribe_id UNION ALL SELECT run_id,'messaging_dispatch'::text,finished_at FROM public.messaging_dispatch_runs WHERE tribe_id=p_tribe_id AND outcome='completed') runs WHERE finished_at<=observed_at ORDER BY finished_at DESC,run_id DESC LIMIT 1),
    'durations',coalesce((SELECT jsonb_agg(jsonb_build_object('phase',phase,'sampleCount',samples,'p95Ms',p95) ORDER BY phase) FROM durations),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;


REVOKE ALL ON FUNCTION public.close_unavailable_admission_request(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_academy_admission_requests(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_deleted_admission_tribe() FROM PUBLIC;
