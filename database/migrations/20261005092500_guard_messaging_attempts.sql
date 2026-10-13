-- Private backend writer primitives. No RPC or credential retrieval runs in SQL.
CREATE FUNCTION public.claim_messaging_deliveries(requested_lease uuid,requested_limit integer,lease_seconds integer)
RETURNS TABLE(delivery_id uuid,delivery_version integer) LANGUAGE plpgsql AS $$
BEGIN
  IF requested_lease IS NULL OR requested_limit IS NULL OR requested_limit<1 OR requested_limit>100 OR lease_seconds IS NULL OR lease_seconds<1 OR lease_seconds>300 THEN
    RAISE EXCEPTION 'messaging claim parameters are invalid' USING ERRCODE='23514';
  END IF;
  RETURN QUERY
  WITH claimable AS (
    SELECT delivery.id FROM public.message_deliveries delivery
    WHERE delivery.state='queued' AND delivery.due_at<=clock_timestamp() AND delivery.deadline_at>clock_timestamp()
      AND (delivery.lease_token IS NULL OR delivery.lease_until<=clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt WHERE attempt.delivery_id=delivery.id)
    ORDER BY delivery.due_at,delivery.id FOR UPDATE OF delivery SKIP LOCKED LIMIT requested_limit
  )
  UPDATE public.message_deliveries delivery
    SET lease_token=requested_lease,lease_until=clock_timestamp()+lease_seconds*interval '1 second',version=delivery.version+1
    FROM claimable WHERE delivery.id=claimable.id RETURNING delivery.id,delivery.version;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_messaging_deliveries(uuid,integer,integer) FROM PUBLIC;

CREATE FUNCTION public.authorize_messaging_delivery_attempt(requested_delivery uuid,requested_lease uuid,expected_version integer,requested_environment text,requested_epoch text)
RETURNS TABLE(delivery_id uuid,outcome text,attempt_id uuid,delivery_version integer) LANGUAGE plpgsql AS $$
DECLARE
  tenant_id uuid; delivery_record public.message_deliveries%ROWTYPE;
  policy public.messaging_usage_policies%ROWTYPE; connection public.tenant_messaging_connections%ROWTYPE;
  resource_version public.messaging_connection_versions%ROWTYPE; capability public.messaging_connection_capabilities%ROWTYPE;
  challenge public.contact_verification_challenges%ROWTYPE;
  server_now timestamptz; day_start timestamptz; category_name text; effective_limit integer;
  consumed_count bigint; reservation_key uuid; attempt_key uuid; suppression_reason text; has_current_leader boolean;
BEGIN
  delivery_id=requested_delivery; outcome='stale'; attempt_id=NULL; delivery_version=NULL;
  SELECT delivery.tribe_id INTO tenant_id FROM public.message_deliveries delivery WHERE delivery.id=requested_delivery;
  IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
  -- Shared order: tribe/policy -> leader/resource -> delivery -> attempt/reservation.
  PERFORM 1 FROM public.tribes tribe WHERE tribe.id=tenant_id FOR UPDATE;
  SELECT * INTO policy FROM public.messaging_usage_policies usage_policy WHERE usage_policy.tribe_id=tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
  SELECT candidate.* INTO connection FROM public.tenant_messaging_connections candidate
    JOIN public.message_deliveries target ON target.connection_id=candidate.id AND target.tribe_id=candidate.tribe_id
    WHERE target.id=requested_delivery FOR SHARE OF candidate;
  PERFORM 1 FROM public.tribe_members member WHERE member.tribe_id=tenant_id
    AND member.user_id=connection.contributed_by_user_id AND member.role='leader' AND member.status='active' FOR SHARE;
  has_current_leader=FOUND;
  SELECT * INTO delivery_record FROM public.message_deliveries delivery WHERE delivery.id=requested_delivery FOR UPDATE;
  delivery_version=delivery_record.version;
  IF NOT FOUND OR requested_lease IS NULL OR expected_version IS NULL OR expected_version<1
     OR delivery_record.state<>'queued' OR delivery_record.lease_token IS DISTINCT FROM requested_lease
     OR delivery_record.version IS DISTINCT FROM expected_version THEN
    RETURN NEXT; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt WHERE attempt.delivery_id=requested_delivery) THEN
    RETURN NEXT; RETURN;
  END IF;
  SELECT * INTO resource_version FROM public.messaging_connection_versions resource
    WHERE resource.connection_id=delivery_record.connection_id AND resource.tribe_id=tenant_id AND resource.version=delivery_record.connection_version FOR SHARE;
  SELECT * INTO capability FROM public.messaging_connection_capabilities prepared
    WHERE prepared.connection_id=delivery_record.connection_id AND prepared.tribe_id=tenant_id
      AND prepared.connection_version=delivery_record.connection_version AND prepared.channel=delivery_record.channel FOR SHARE;
  IF delivery_record.purpose<>'admission_notification' THEN
    SELECT * INTO challenge FROM public.contact_verification_challenges source WHERE source.delivery_id=requested_delivery FOR SHARE;
  END IF;
  -- Freshness must be sampled after every potentially waiting resource lock.
  server_now=clock_timestamp();
  IF delivery_record.lease_until IS NULL OR delivery_record.lease_until<=server_now THEN RETURN NEXT; RETURN; END IF;
  IF delivery_record.deadline_at<=server_now THEN suppression_reason='delivery_expired';
  ELSIF requested_environment IS NULL OR requested_epoch IS NULL
     OR delivery_record.environment IS DISTINCT FROM requested_environment OR delivery_record.security_epoch IS DISTINCT FROM requested_epoch
     OR connection.environment IS DISTINCT FROM requested_environment OR connection.security_epoch IS DISTINCT FROM requested_epoch THEN suppression_reason='security_context_changed';
  ELSIF connection.retired_at IS NOT NULL OR resource_version.retired_at IS NOT NULL OR resource_version.id IS NULL
     OR connection.state NOT IN ('active','degraded','draft','ready') THEN suppression_reason='connection_unavailable';
  ELSIF NOT has_current_leader THEN suppression_reason='leadership_changed';
  ELSIF resource_version.credential_validation_status<>'valid' OR resource_version.is_test_mode IS NULL THEN suppression_reason='credentials_unprepared';
  ELSIF delivery_record.purpose<>'connection_diagnostic' AND resource_version.is_test_mode THEN suppression_reason='test_mode_connection';
  ELSIF delivery_record.purpose<>'admission_notification' AND (
     challenge.id IS NULL OR challenge.state<>'issued' OR NOT challenge.is_current OR challenge.expires_at<=server_now
     OR challenge.invalidated_at IS NOT NULL OR challenge.code_envelope_id IS NULL
     OR ROW(challenge.tribe_id,challenge.user_id,challenge.connection_id,challenge.connection_version,challenge.security_epoch,challenge.purpose,challenge.channel)
        IS DISTINCT FROM ROW(tenant_id,delivery_record.actor_user_id,delivery_record.connection_id,delivery_record.connection_version,delivery_record.security_epoch,delivery_record.purpose,delivery_record.channel)
  ) THEN suppression_reason='challenge_unavailable';
  ELSIF delivery_record.channel<>'email' AND (delivery_record.recipient_country IS NULL OR NOT delivery_record.recipient_country=ANY(policy.allowed_countries)) THEN suppression_reason='recipient_not_allowed';
  ELSIF capability.id IS NULL OR capability.checked_at IS NULL THEN suppression_reason='capability_unprepared';
  ELSIF delivery_record.purpose<>'connection_diagnostic' AND (connection.state NOT IN ('active','degraded') OR NOT connection.is_selected OR connection.selected_version IS DISTINCT FROM delivery_record.connection_version
     OR capability.state<>'prepared' OR capability.tested_at IS NULL) THEN suppression_reason='capability_unprepared';
  END IF;
  IF suppression_reason IS NULL AND delivery_record.channel<>'email' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(capability.platform_restrictions) restriction
    WHERE restriction->>'country'=delivery_record.recipient_country AND restriction->>'channel'=delivery_record.channel AND restriction->>'allowed'='false'
  ) THEN suppression_reason='recipient_not_allowed'; END IF;
  IF suppression_reason IS NULL AND delivery_record.purpose='connection_diagnostic' AND NOT EXISTS(
    SELECT 1 FROM public.messaging_connection_diagnostics diagnostic
    WHERE diagnostic.id=delivery_record.source_resource_id AND diagnostic.challenge_id=challenge.id
      AND diagnostic.tribe_id=tenant_id AND diagnostic.connection_id=delivery_record.connection_id
      AND diagnostic.connection_version=delivery_record.connection_version AND diagnostic.channel=delivery_record.channel
      AND diagnostic.leader_user_id=connection.contributed_by_user_id AND diagnostic.outcome='pending'
  ) THEN suppression_reason='diagnostic_unavailable'; END IF;
  IF suppression_reason IS NOT NULL THEN
    UPDATE public.message_deliveries delivery SET state='suppressed',last_outcome=suppression_reason,lease_token=NULL,lease_until=NULL,version=delivery.version+1
      WHERE delivery.id=requested_delivery RETURNING delivery.version INTO delivery_version;
    outcome='suppressed'; RETURN NEXT; RETURN;
  END IF;
  category_name=CASE WHEN delivery_record.purpose='admission_notification' THEN 'notification' ELSE 'verification' END;
  effective_limit=CASE WHEN category_name='notification' THEN least(policy.notification_daily_limit,policy.platform_notification_daily_maximum)
    ELSE least(policy.verification_daily_limit,policy.platform_verification_daily_maximum) END;
  day_start=date_trunc('day',server_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT count(*) INTO consumed_count FROM public.messaging_usage_reservations reservation
    WHERE reservation.tribe_id=tenant_id AND reservation.category=category_name AND reservation.state='consumed' AND reservation.reserved_at>=day_start;
  IF consumed_count>=effective_limit THEN
    UPDATE public.message_deliveries delivery SET last_outcome='quota_exceeded',lease_token=NULL,lease_until=NULL,version=delivery.version+1,due_at=least(delivery.deadline_at,day_start+interval '1 day')
      WHERE delivery.id=requested_delivery RETURNING delivery.version INTO delivery_version;
    outcome='quota_exceeded'; RETURN NEXT; RETURN;
  END IF;
  attempt_key=gen_random_uuid(); reservation_key=gen_random_uuid();
  INSERT INTO public.message_delivery_attempts(id,delivery_id,tribe_id,connection_id,connection_version,sequence,reservation_id,lease_token,send_authorized_at,authorized_usage_policy_version,recipient_country)
    VALUES(attempt_key,requested_delivery,tenant_id,delivery_record.connection_id,delivery_record.connection_version,1,reservation_key,requested_lease,server_now,policy.version,delivery_record.recipient_country);
  INSERT INTO public.messaging_usage_reservations(id,tribe_id,attempt_id,delivery_id,category,reserved_at)
    VALUES(reservation_key,tenant_id,attempt_key,requested_delivery,category_name,server_now);
  UPDATE public.message_deliveries delivery SET last_outcome='send_authorized',version=delivery.version+1
    WHERE delivery.id=requested_delivery RETURNING delivery.version INTO delivery_version;
  outcome='authorized'; attempt_id=attempt_key; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.authorize_messaging_delivery_attempt(uuid,uuid,integer,text,text) FROM PUBLIC;

CREATE FUNCTION public.reconcile_expired_messaging_leases(requested_limit integer DEFAULT 100) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE candidate record; delivery_record public.message_deliveries%ROWTYPE; changed_count integer=0; server_now timestamptz;
BEGIN
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>100 THEN
    RAISE EXCEPTION 'messaging reconciliation batch is invalid' USING ERRCODE='23514';
  END IF;
  FOR candidate IN SELECT delivery.id,delivery.tribe_id FROM public.message_deliveries delivery
    WHERE delivery.lease_token IS NOT NULL AND delivery.lease_until<=clock_timestamp() ORDER BY delivery.tribe_id,delivery.id LIMIT requested_limit
  LOOP
    PERFORM 1 FROM public.tribes tribe WHERE tribe.id=candidate.tribe_id FOR UPDATE;
    PERFORM 1 FROM public.messaging_usage_policies usage_policy WHERE usage_policy.tribe_id=candidate.tribe_id FOR UPDATE;
    SELECT * INTO delivery_record FROM public.message_deliveries delivery WHERE delivery.id=candidate.id FOR UPDATE;
    server_now=clock_timestamp();
    IF delivery_record.lease_token IS NULL OR delivery_record.lease_until>server_now THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt WHERE attempt.delivery_id=candidate.id) THEN
      UPDATE public.message_delivery_attempts attempt SET state='unknown',safe_reason='worker_lease_expired',completed_at=server_now,version=attempt.version+1
        WHERE attempt.delivery_id=candidate.id AND attempt.state='in_flight';
      UPDATE public.message_deliveries delivery SET state=CASE WHEN delivery.state='queued' THEN 'unknown' ELSE delivery.state END,
        last_outcome=CASE WHEN delivery.state='queued' THEN 'delivery_unknown' ELSE delivery.last_outcome END,lease_token=NULL,lease_until=NULL,version=delivery.version+1 WHERE delivery.id=candidate.id;
    ELSE
      UPDATE public.message_deliveries delivery SET lease_token=NULL,lease_until=NULL,version=delivery.version+1,due_at=server_now,
        state=CASE WHEN delivery.deadline_at<=server_now THEN 'suppressed' ELSE delivery.state END WHERE delivery.id=candidate.id;
    END IF;
    changed_count=changed_count+1;
  END LOOP;
  RETURN changed_count;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_expired_messaging_leases(integer) FROM PUBLIC;

-- A late provider result belongs to its exact attempt. It never issues a POST
-- or turns uncertainty into evidence that a reservation can be released.
CREATE FUNCTION public.complete_messaging_delivery_attempt(requested_attempt uuid,requested_lease uuid,expected_version integer,requested_outcome text,requested_provider_id text,requested_correlation_id text,requested_reason text)
RETURNS TABLE(outcome text,attempt_version integer,delivery_version integer) LANGUAGE plpgsql AS $$
DECLARE tenant_id uuid; delivery_key uuid; delivery_record public.message_deliveries%ROWTYPE; attempt_record public.message_delivery_attempts%ROWTYPE;
BEGIN
  IF requested_outcome IS NULL OR requested_outcome NOT IN ('accepted','delivered','rejected','unknown') THEN
    RAISE EXCEPTION 'messaging completion outcome is invalid' USING ERRCODE='23514';
  END IF;
  outcome='stale'; attempt_version=NULL; delivery_version=NULL;
  SELECT attempt.tribe_id,attempt.delivery_id INTO tenant_id,delivery_key FROM public.message_delivery_attempts attempt WHERE attempt.id=requested_attempt;
  IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
  PERFORM 1 FROM public.tribes tribe WHERE tribe.id=tenant_id FOR UPDATE;
  PERFORM 1 FROM public.messaging_usage_policies policy WHERE policy.tribe_id=tenant_id FOR UPDATE;
  SELECT * INTO delivery_record FROM public.message_deliveries delivery WHERE delivery.id=delivery_key FOR UPDATE;
  SELECT * INTO attempt_record FROM public.message_delivery_attempts attempt WHERE attempt.id=requested_attempt FOR UPDATE;
  attempt_version=attempt_record.version; delivery_version=delivery_record.version;
  IF requested_lease IS NULL OR expected_version IS NULL OR expected_version<1
    OR attempt_record.lease_token IS DISTINCT FROM requested_lease OR attempt_record.version IS DISTINCT FROM expected_version THEN
    RETURN NEXT; RETURN;
  END IF;
  IF ROW(attempt_record.state,attempt_record.provider_message_id,attempt_record.correlation_id,attempt_record.safe_reason)
    IS NOT DISTINCT FROM ROW(requested_outcome,requested_provider_id,requested_correlation_id,requested_reason) THEN
    outcome='unchanged'; RETURN NEXT; RETURN;
  END IF;
  IF attempt_record.state NOT IN ('in_flight','unknown','accepted')
     OR (attempt_record.state='accepted' AND requested_outcome<>'delivered')
     OR (attempt_record.provider_message_id IS NOT NULL AND attempt_record.provider_message_id IS DISTINCT FROM requested_provider_id) THEN
    RETURN NEXT; RETURN;
  END IF;
  UPDATE public.message_delivery_attempts attempt SET state=requested_outcome,completed_at=clock_timestamp(),provider_message_id=requested_provider_id,
    correlation_id=requested_correlation_id,safe_reason=requested_reason,version=attempt.version+1
    WHERE attempt.id=requested_attempt RETURNING attempt.version INTO attempt_version;
  UPDATE public.message_deliveries delivery SET state=CASE WHEN requested_outcome='rejected' THEN 'failed' ELSE requested_outcome END,
    last_outcome=requested_reason,lease_token=NULL,lease_until=NULL,version=delivery.version+1
    WHERE delivery.id=delivery_key RETURNING delivery.version INTO delivery_version;
  outcome='completed'; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_messaging_delivery_attempt(uuid,uuid,integer,text,text,text,text) FROM PUBLIC;
