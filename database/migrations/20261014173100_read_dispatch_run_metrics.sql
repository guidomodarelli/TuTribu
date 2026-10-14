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
