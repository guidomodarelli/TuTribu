-- Keep operational completion separate from request/attempt success and personal dimensions.
CREATE TABLE public.academy_admission_worker_runs (
  run_id uuid NOT NULL,
  tribe_id uuid NOT NULL REFERENCES public.academy_admission_tribe_namespaces(tribe_id),
  operation text NOT NULL CHECK(operation IN ('messaging_dispatch','admission_expiration','admission_retention','notification_materialization')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  processed integer NOT NULL CHECK(processed>0),
  PRIMARY KEY(run_id,tribe_id,operation),
  CHECK(finished_at>=started_at)
);
ALTER TABLE public.academy_admission_worker_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_admission_worker_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_admission_worker_runs FROM PUBLIC;
CREATE POLICY admission_worker_run_owner ON public.academy_admission_worker_runs FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.academy_admission_worker_runs'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.academy_admission_worker_runs'::regclass));
CREATE INDEX admission_worker_run_history_idx ON public.academy_admission_worker_runs(tribe_id,finished_at DESC);
CREATE INDEX admission_audit_resource_history_idx ON public.academy_admission_audit_events(tribe_id,resource_type,resource_id,created_at DESC,id DESC);

CREATE FUNCTION public.read_academy_admission_activity(
  p_tribe_id uuid,p_session_id text,p_limit integer DEFAULT 26,p_resource_type text DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,p_before_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid,tribe_id uuid,actor_user_id text,operation_id uuid,tribe_lifecycle_operation_id uuid,
  resource_type text,resource_id uuid,event_type text,rule text,cause text,resource_version integer,metadata jsonb,created_at timestamptz,cursor_at text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_record record;
BEGIN
  SELECT * INTO actor_record FROM public.read_admission_reviewer_context(p_tribe_id,p_session_id);
  IF NOT FOUND OR actor_record.role IS DISTINCT FROM 'leader' OR actor_record.status IS DISTINCT FROM 'active'
    OR p_limit IS NULL OR p_limit<1 OR p_limit>51 THEN RETURN; END IF;
  RETURN QUERY SELECT audit.id,audit.tribe_id,audit.actor_user_id,audit.operation_id,audit.tribe_lifecycle_operation_id,
    audit.resource_type,audit.resource_id,audit.event_type,audit.rule,audit.cause,audit.resource_version,audit.metadata,audit.created_at,
    to_char(audit.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    FROM public.academy_admission_audit_events audit WHERE audit.tribe_id=p_tribe_id
      AND (p_resource_type IS NULL OR audit.resource_type=p_resource_type)
      AND (p_resource_id IS NULL OR audit.resource_id=p_resource_id)
      AND (p_before_at IS NULL OR (audit.created_at,audit.id)<(p_before_at,p_before_id))
    ORDER BY audit.created_at DESC,audit.id DESC LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.read_academy_admission_activity(uuid,text,integer,text,uuid,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_academy_admission_activity(uuid,text,integer,text,uuid,timestamptz,uuid) TO PUBLIC;

CREATE FUNCTION public.read_academy_admission_metrics(p_tribe_id uuid,p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_record record; observed_at timestamptz; day_start timestamptz; result jsonb;
BEGIN
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
    'lastSuccessfulRun',(SELECT jsonb_build_object('operation',operation,'at',finished_at) FROM public.academy_admission_worker_runs WHERE tribe_id=p_tribe_id AND finished_at<=observed_at ORDER BY finished_at DESC,run_id DESC LIMIT 1),
    'durations',coalesce((SELECT jsonb_agg(jsonb_build_object('phase',phase,'sampleCount',samples,'p95Ms',p95) ORDER BY phase) FROM durations),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.read_academy_admission_metrics(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_academy_admission_metrics(uuid,text) TO PUBLIC;

-- The request role can record only this scoped read fact; direct audit writes remain denied.
CREATE FUNCTION public.record_academy_admission_authorized_exposure(p_tribe_id uuid,p_session_id text,p_surface text,p_item_count integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_record record;
BEGIN
  IF p_surface IS NULL OR p_surface NOT IN ('activity','metrics') OR p_item_count IS NULL OR p_item_count<0 OR p_item_count>50
    OR (p_surface='metrics' AND p_item_count<>1) THEN RETURN false; END IF;
  SELECT * INTO actor_record FROM public.read_admission_reviewer_context(p_tribe_id,p_session_id);
  IF NOT FOUND OR actor_record.role IS DISTINCT FROM 'leader' OR actor_record.status IS DISTINCT FROM 'active' THEN RETURN false; END IF;
  INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type,rule,metadata,created_at)
    VALUES(p_tribe_id,actor_record.user_id,'authorized_exposure',p_tribe_id,'authorized_resource_exposure',
      CASE p_surface WHEN 'activity' THEN 'read_admission_activity' ELSE 'read_admission_metrics' END,
      jsonb_build_object('surface',p_surface,'itemCount',p_item_count,'resourceKind','aggregate'),clock_timestamp());
  IF NOT EXISTS(SELECT 1 FROM public.session WHERE id=p_session_id AND "userId"=actor_record.user_id AND "expiresAt">clock_timestamp()) THEN
    RAISE EXCEPTION 'admission exposure session is no longer live' USING ERRCODE='42501';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_academy_admission_authorized_exposure(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_academy_admission_authorized_exposure(uuid,text,text,integer) TO PUBLIC;

-- Keeps the bounded tribe-first expiration owner and its existing private ACL.
-- Only the staged audit projection changes; decisions, notices and clock remain atomic.
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
    INSERT INTO public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type,created_at)
      VALUES(obligation_id,request_record.tribe_id,request_record.id,request_record.user_id,'expired',server_now);
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
REVOKE ALL ON FUNCTION public.expire_academy_admission_requests(integer) FROM PUBLIC;
