CREATE OR REPLACE FUNCTION public.purge_expired_allowlist_import_material(requested_limit integer DEFAULT 500)
RETURNS TABLE(purged_rows integer,completed_imports integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE original_import record; remaining integer; changed_rows integer; scope record;
  started_at timestamptz=clock_timestamp(); observed_at timestamptz; run_id uuid=gen_random_uuid();
  processed_by_tribe jsonb='{}'::jsonb; has_remaining boolean;
BEGIN
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>2000 THEN
    RAISE EXCEPTION 'allowlist import material row batch is invalid' USING ERRCODE='23514';
  END IF;
  purged_rows=0; completed_imports=0;
  FOR original_import IN
    SELECT preview.id,preview.tribe_id FROM public.tribes tribe
    JOIN public.academy_allowlist_imports preview ON preview.tribe_id=tribe.id
    WHERE preview.purge_after<=clock_timestamp()
      AND EXISTS(SELECT 1 FROM public.academy_allowlist_import_rows pending
        WHERE pending.import_id=preview.id AND pending.material_purged_at IS NULL)
    ORDER BY tribe.id,preview.purge_after,preview.id
    LIMIT requested_limit FOR UPDATE OF tribe,preview SKIP LOCKED
  LOOP
    remaining=requested_limit-purged_rows;
    EXIT WHEN remaining<=0;
    WITH selected_rows AS (
      SELECT row.row_number FROM public.academy_allowlist_import_rows row
      WHERE row.import_id=original_import.id AND row.tribe_id=original_import.tribe_id
        AND row.material_purged_at IS NULL
      ORDER BY row.row_number LIMIT remaining FOR UPDATE OF row SKIP LOCKED
    )
    UPDATE public.academy_allowlist_import_rows row
      SET input_data='{}'::jsonb,validation_result='{}'::jsonb,material_purged_at=clock_timestamp()
      FROM selected_rows selected WHERE row.import_id=original_import.id
        AND row.tribe_id=original_import.tribe_id AND row.row_number=selected.row_number;
    GET DIAGNOSTICS changed_rows=ROW_COUNT;
    purged_rows=purged_rows+changed_rows;
    IF changed_rows>0 THEN
      processed_by_tribe=jsonb_set(processed_by_tribe,ARRAY[original_import.tribe_id::text],
        to_jsonb(coalesce((processed_by_tribe->>original_import.tribe_id::text)::integer,0)+changed_rows));
    END IF;
    UPDATE public.academy_allowlist_imports SET state='expired',version=version+1
      WHERE id=original_import.id AND tribe_id=original_import.tribe_id AND state IN ('preview','processing');
    IF changed_rows>0 AND NOT EXISTS(SELECT 1 FROM public.academy_allowlist_import_rows pending
      WHERE pending.import_id=original_import.id AND pending.material_purged_at IS NULL) THEN
      completed_imports=completed_imports+1;
    END IF;
  END LOOP;
  observed_at=clock_timestamp();
  FOR scope IN SELECT key::uuid AS tribe_id,value::integer AS processed FROM jsonb_each_text(processed_by_tribe)
  LOOP
    SELECT EXISTS(SELECT 1 FROM public.academy_allowlist_imports preview
      JOIN public.academy_allowlist_import_rows pending ON pending.import_id=preview.id AND pending.tribe_id=preview.tribe_id
      WHERE preview.tribe_id=scope.tribe_id AND preview.purge_after<=observed_at AND pending.material_purged_at IS NULL) INTO has_remaining;
    INSERT INTO public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,metadata,created_at)
      VALUES(scope.tribe_id,'retention_run',run_id,'retention_completed','purge_allowlist_import_material',
        jsonb_build_object('owner','allowlist_import_material','processed',scope.processed,'remaining',has_remaining,
          'cutoff',to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'durationMs',greatest(0,ceil(extract(epoch FROM observed_at-started_at)*1000))),observed_at);
  END LOOP;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_allowlist_import_material(integer) FROM PUBLIC;

-- Observe completed private maintenance and internal notices through their original audit facts.

-- Positive effects, their measured batch phase and their audit remain in the original transaction.

-- Empty/rolled-back batches create no success; legacy audit has no fabricated duration.

-- Preserve existing ownership, RLS, retention cutoffs, locking, public DTOs and function grants.

CREATE OR REPLACE FUNCTION public.minimize_terminal_admission_requests(requested_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE candidate record; request_record public.academy_admission_requests%ROWTYPE;
  decision_record public.academy_admission_decisions%ROWTYPE; scope record;
  processed integer=0; processed_by_tribe jsonb='{}'::jsonb; run_id uuid=gen_random_uuid();
  started_at timestamptz=clock_timestamp();
  observed_at timestamptz=started_at; cutoff_at timestamptz; has_remaining boolean;
BEGIN
  IF public.current_app_user_id() IS NOT NULL THEN RAISE EXCEPTION 'admission retention requires a backend maintenance context' USING ERRCODE='42501'; END IF;
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>500 THEN RAISE EXCEPTION 'admission request retention batch is invalid' USING ERRCODE='23514'; END IF;
  cutoff_at=public.admission_terminal_private_material_cutoff(observed_at);
  FOR candidate IN SELECT request.id,request.tribe_id FROM public.academy_admission_decisions decision
    JOIN public.academy_admission_requests request ON request.decision_id=decision.id AND request.id=decision.request_id AND request.tribe_id=decision.tribe_id
    WHERE request.status<>'pending' AND request.private_material_minimized_at IS NULL AND decision.decided_at<=cutoff_at
    ORDER BY decision.decided_at,request.id LIMIT requested_limit FOR UPDATE OF request SKIP LOCKED
  LOOP
    -- Never wait backwards on a deleting tribe after retaining one of its children.
    BEGIN
      PERFORM id FROM public.tribes WHERE id=candidate.tribe_id FOR SHARE NOWAIT;
      IF NOT FOUND THEN CONTINUE; END IF;
    EXCEPTION WHEN lock_not_available THEN CONTINUE;
    END;
    SELECT * INTO request_record FROM public.academy_admission_requests WHERE id=candidate.id AND tribe_id=candidate.tribe_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR request_record.status='pending' OR request_record.private_material_minimized_at IS NOT NULL THEN CONTINUE; END IF;
    SELECT * INTO decision_record FROM public.academy_admission_decisions
      WHERE id=request_record.decision_id AND request_id=request_record.id AND tribe_id=request_record.tribe_id AND user_id=request_record.user_id AND outcome=request_record.status FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    observed_at=clock_timestamp();
    IF decision_record.decided_at>public.admission_terminal_private_material_cutoff(observed_at) THEN CONTINUE; END IF;
    UPDATE public.academy_admission_requests SET contact_type=NULL,normalized_contact=NULL,contact_fingerprint=NULL,fingerprint_key_id=NULL,
      applicant_message=NULL,private_material_minimized_at=observed_at WHERE id=request_record.id AND version=request_record.version;
    UPDATE public.academy_admission_decisions SET internal_reason=NULL,external_message=NULL WHERE id=decision_record.id;
    processed=processed+1;
    processed_by_tribe=jsonb_set(processed_by_tribe,ARRAY[request_record.tribe_id::text],to_jsonb(coalesce((processed_by_tribe->>request_record.tribe_id::text)::integer,0)+1));
  END LOOP;
  observed_at=clock_timestamp(); cutoff_at=public.admission_terminal_private_material_cutoff(observed_at);
  FOR scope IN SELECT key::uuid AS tribe_id,value::integer AS processed FROM jsonb_each_text(processed_by_tribe)
  LOOP
    SELECT EXISTS (SELECT 1 FROM public.academy_admission_requests request JOIN public.academy_admission_decisions decision ON decision.id=request.decision_id
      WHERE request.tribe_id=scope.tribe_id AND request.status<>'pending' AND request.private_material_minimized_at IS NULL AND decision.decided_at<=cutoff_at) INTO has_remaining;
    INSERT INTO public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,metadata,created_at)
      VALUES(scope.tribe_id,'retention_run',run_id,'retention_completed','minimize_terminal_admission_requests',
        jsonb_build_object('owner','admission_requests','processed',scope.processed,'remaining',has_remaining,'cutoff',to_char(cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'durationMs',greatest(0,ceil(extract(epoch FROM observed_at-started_at)*1000))),observed_at);
  END LOOP;
  RETURN processed;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_admission_security_audit(requested_limit integer DEFAULT 500)
RETURNS TABLE(live_purged integer,archived_purged integer) LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE candidate record; scope record; deleted_id uuid; cutoff_at timestamptz;
  started_at timestamptz=clock_timestamp();
  observed_at timestamptz=started_at; run_id uuid=gen_random_uuid(); has_remaining boolean;
  live_by_tribe jsonb='{}'::jsonb; archived_by_tribe jsonb='{}'::jsonb;
BEGIN
  IF public.current_app_user_id() IS NOT NULL THEN RAISE EXCEPTION 'admission audit retention requires a backend maintenance context' USING ERRCODE='42501'; END IF;
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>2000 THEN RAISE EXCEPTION 'admission audit retention batch is invalid' USING ERRCODE='23514'; END IF;
  live_purged=0; archived_purged=0; cutoff_at=public.admission_security_audit_cutoff(observed_at);
  FOR candidate IN
    SELECT eligible.id,eligible.tribe_id,eligible.archived FROM (
      SELECT id,tribe_id,created_at,archived FROM (
        SELECT id,tribe_id,created_at,false AS archived FROM public.academy_admission_audit_events WHERE created_at<=cutoff_at
          ORDER BY created_at,id LIMIT requested_limit FOR UPDATE SKIP LOCKED
      ) live_candidates
      UNION ALL SELECT id,tribe_id,created_at,archived FROM (
        SELECT id,tribe_id,created_at,true AS archived FROM public.academy_admission_retired_audit_events WHERE created_at<=cutoff_at
          ORDER BY created_at,id LIMIT requested_limit FOR UPDATE SKIP LOCKED
      ) archived_candidates
    ) eligible ORDER BY eligible.created_at,eligible.id,eligible.archived LIMIT requested_limit
  LOOP
    deleted_id=NULL;
    BEGIN
      IF candidate.archived THEN
        PERFORM tribe_id FROM public.academy_admission_tribe_namespaces WHERE tribe_id=candidate.tribe_id AND retired_at IS NOT NULL FOR SHARE NOWAIT;
      ELSE PERFORM id FROM public.tribes WHERE id=candidate.tribe_id FOR SHARE NOWAIT;
      END IF;
      IF NOT FOUND THEN CONTINUE; END IF;
    EXCEPTION WHEN lock_not_available THEN CONTINUE;
    END;
    cutoff_at=public.admission_security_audit_cutoff(clock_timestamp());
    IF candidate.archived THEN
      WITH selected AS (SELECT id FROM public.academy_admission_retired_audit_events WHERE id=candidate.id AND tribe_id=candidate.tribe_id AND created_at<=cutoff_at FOR UPDATE SKIP LOCKED)
        DELETE FROM public.academy_admission_retired_audit_events event USING selected WHERE event.id=selected.id RETURNING event.id INTO deleted_id;
      IF deleted_id IS NOT NULL THEN
        archived_purged=archived_purged+1;
        archived_by_tribe=jsonb_set(archived_by_tribe,ARRAY[candidate.tribe_id::text],to_jsonb(coalesce((archived_by_tribe->>candidate.tribe_id::text)::integer,0)+1));
      END IF;
    ELSE
      WITH selected AS (SELECT id FROM public.academy_admission_audit_events WHERE id=candidate.id AND tribe_id=candidate.tribe_id AND created_at<=cutoff_at FOR UPDATE SKIP LOCKED)
        DELETE FROM public.academy_admission_audit_events event USING selected WHERE event.id=selected.id RETURNING event.id INTO deleted_id;
      IF deleted_id IS NOT NULL THEN
        live_purged=live_purged+1;
        live_by_tribe=jsonb_set(live_by_tribe,ARRAY[candidate.tribe_id::text],to_jsonb(coalesce((live_by_tribe->>candidate.tribe_id::text)::integer,0)+1));
      END IF;
    END IF;
  END LOOP;
  observed_at=clock_timestamp(); cutoff_at=public.admission_security_audit_cutoff(observed_at);
  FOR scope IN SELECT key::uuid AS tribe_id,value::integer AS processed FROM jsonb_each_text(live_by_tribe)
  LOOP
    SELECT EXISTS(SELECT 1 FROM public.academy_admission_audit_events WHERE tribe_id=scope.tribe_id AND created_at<=cutoff_at) INTO has_remaining;
    INSERT INTO public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,metadata,created_at)
      VALUES(scope.tribe_id,'retention_run',run_id,'retention_completed','purge_admission_security_audit',
        jsonb_build_object('owner','admission_audit','processed',scope.processed,'remaining',has_remaining,'cutoff',to_char(cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'durationMs',greatest(0,ceil(extract(epoch FROM observed_at-started_at)*1000))),observed_at);
  END LOOP;
  FOR scope IN SELECT key::uuid AS tribe_id,value::integer AS processed FROM jsonb_each_text(archived_by_tribe)
  LOOP
    SELECT EXISTS(SELECT 1 FROM public.academy_admission_retired_audit_events WHERE tribe_id=scope.tribe_id AND created_at<=cutoff_at) INTO has_remaining;
    INSERT INTO public.academy_admission_retired_audit_events(id,tribe_id,resource_type,resource_id,event_type,rule,metadata,created_at,retired_at)
      VALUES(gen_random_uuid(),scope.tribe_id,'retention_run',run_id,'retention_completed','purge_admission_security_audit',
        jsonb_build_object('owner','admission_audit','processed',scope.processed,'remaining',has_remaining,'cutoff',to_char(cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'durationMs',greatest(0,ceil(extract(epoch FROM observed_at-started_at)*1000))),observed_at,observed_at);
  END LOOP;
  RETURN NEXT;
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
        || CASE WHEN audit.metadata ? 'durationMs' THEN jsonb_build_object('durationMs',audit.metadata->'durationMs') ELSE '{}'::jsonb END
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
    UNION ALL SELECT 'retention',(metadata->>'durationMs')::numeric FROM public.academy_admission_audit_events
      WHERE tribe_id=p_tribe_id AND resource_type='retention_run' AND event_type='retention_completed'
        AND rule IN ('minimize_terminal_admission_requests','purge_admission_security_audit','purge_allowlist_import_material')
        AND metadata->>'owner' IN ('admission_requests','admission_audit','allowlist_import_material') AND metadata->>'durationMs' IS NOT NULL
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
    -- These are committed positive effects, not synthetic driver runs or read observations.
    'lastSuccessfulRun',(SELECT jsonb_build_object('operation',operation,'at',finished_at) FROM (
      SELECT run_id,operation,finished_at FROM public.academy_admission_worker_runs WHERE tribe_id=p_tribe_id
      UNION ALL SELECT run_id,'messaging_dispatch'::text,finished_at FROM public.messaging_dispatch_runs WHERE tribe_id=p_tribe_id AND outcome='completed'
      UNION ALL SELECT id,'admission_retention',created_at FROM public.academy_admission_audit_events
        WHERE tribe_id=p_tribe_id AND resource_type='retention_run' AND event_type='retention_completed'
          AND rule IN ('minimize_terminal_admission_requests','purge_admission_security_audit','purge_allowlist_import_material')
          AND metadata->>'owner' IN ('admission_requests','admission_audit','allowlist_import_material')
      UNION ALL SELECT id,'notification_materialization',created_at FROM public.academy_admission_audit_events
        WHERE tribe_id=p_tribe_id AND resource_type='admission_notification' AND event_type='notification_materialized'
    ) runs WHERE finished_at<=observed_at ORDER BY finished_at DESC,run_id DESC LIMIT 1),
    'durations',coalesce((SELECT jsonb_agg(jsonb_build_object('phase',phase,'sampleCount',samples,'p95Ms',p95) ORDER BY phase) FROM durations),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.minimize_terminal_admission_requests(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.purge_expired_admission_security_audit(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.archive_deleted_admission_tribe() FROM PUBLIC;

-- CREATE OR REPLACE preserves the original reader EXECUTE grant; its SQL authority checks remain mandatory.
