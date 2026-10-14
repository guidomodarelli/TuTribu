-- Retention removes unnecessary contents, never the decision, binding or charged history.
ALTER TABLE public.academy_admission_requests
  ADD COLUMN private_material_minimized_at timestamptz,
  ADD CONSTRAINT admission_request_private_minimization_check CHECK (
    private_material_minimized_at IS NULL OR (
      status<>'pending' AND private_material_minimized_at>=submitted_at
      AND contact_type IS NULL AND normalized_contact IS NULL
      AND contact_fingerprint IS NULL AND fingerprint_key_id IS NULL AND applicant_message IS NULL
    )
  );
CREATE INDEX admission_request_private_retention_idx ON public.academy_admission_requests(decision_id,id)
  WHERE private_material_minimized_at IS NULL AND status<>'pending';
CREATE INDEX admission_decision_retention_idx ON public.academy_admission_decisions(decided_at,id);
CREATE INDEX admission_audit_retention_idx ON public.academy_admission_audit_events(created_at,id);
CREATE INDEX retired_admission_audit_retention_idx ON public.academy_admission_retired_audit_events(created_at,id);

-- UTC makes both product lifetimes independent of the caller's database time zone.
CREATE FUNCTION public.admission_terminal_private_material_cutoff(observed_at timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
  SELECT ((observed_at AT TIME ZONE 'UTC')-interval '180 days') AT TIME ZONE 'UTC';
$$;
CREATE FUNCTION public.admission_security_audit_cutoff(observed_at timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
  SELECT ((observed_at AT TIME ZONE 'UTC')-interval '365 days') AT TIME ZONE 'UTC';
$$;
REVOKE ALL ON FUNCTION public.admission_terminal_private_material_cutoff(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admission_security_audit_cutoff(timestamptz) FROM PUBLIC;

-- Privacy-only destruction preserves the original business version. The request
-- identity guard independently checks the private principal, age and exact fields.
CREATE OR REPLACE FUNCTION public.guard_admission_resource_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE field_name text; old_intent jsonb='{}'; new_intent jsonb='{}';
BEGIN
  IF TG_TABLE_NAME='academy_admission_requests' THEN
    IF OLD.private_material_minimized_at IS NULL AND NEW.private_material_minimized_at IS NOT NULL THEN
      IF NEW.version<>OLD.version THEN RAISE EXCEPTION 'admission minimization preserves its original business version' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END IF;
  END IF;
  FOREACH field_name IN ARRAY TG_ARGV LOOP
    old_intent=old_intent||jsonb_build_object(field_name,to_jsonb(OLD)->field_name);
    new_intent=new_intent||jsonb_build_object(field_name,to_jsonb(NEW)->field_name);
  END LOOP;
  IF new_intent IS DISTINCT FROM old_intent THEN
    IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'admission effective change requires one version increment' USING ERRCODE='23514'; END IF;
  ELSIF NEW.version<>OLD.version THEN RAISE EXCEPTION 'admission no-op cannot increment version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_admission_request_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE minimization boolean=false;
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.user_id,NEW.source,NEW.invitation_id,NEW.legacy_invitation_id,NEW.submitted_at,NEW.expires_at,NEW.original_policy_snapshot)
     IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.user_id,OLD.source,OLD.invitation_id,OLD.legacy_invitation_id,OLD.submitted_at,OLD.expires_at,OLD.original_policy_snapshot) THEN
    RAISE EXCEPTION 'admission request identity and deadline are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status<>'pending' AND ROW(NEW.status,NEW.decision_id) IS DISTINCT FROM ROW(OLD.status,OLD.decision_id) THEN
    RAISE EXCEPTION 'admission terminal state is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.private_material_minimized_at IS NULL AND NEW.private_material_minimized_at IS NOT NULL THEN
    IF current_user<>(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.academy_admission_requests'::regclass)
      OR public.current_app_user_id() IS NOT NULL THEN
      RAISE EXCEPTION 'admission minimization requires its private maintenance owner' USING ERRCODE='42501';
    END IF;
    IF OLD.status='pending' OR ROW(NEW.version,NEW.evidence_source,NEW.global_identity_evidence_id,NEW.proof_id,NEW.binding_id,NEW.requires_allowlist,NEW.cancel_reason,NEW.retry_allowed_at)
      IS DISTINCT FROM ROW(OLD.version,OLD.evidence_source,OLD.global_identity_evidence_id,OLD.proof_id,OLD.binding_id,OLD.requires_allowlist,OLD.cancel_reason,OLD.retry_allowed_at)
      OR NOT EXISTS (SELECT 1 FROM public.academy_admission_decisions decision
        WHERE decision.id=OLD.decision_id AND decision.request_id=OLD.id AND decision.tribe_id=OLD.tribe_id
          AND decision.user_id=OLD.user_id AND decision.outcome=OLD.status
          AND decision.decided_at<=public.admission_terminal_private_material_cutoff(clock_timestamp())) THEN
      RAISE EXCEPTION 'admission private material has not reached its terminal retention deadline' USING ERRCODE='23514';
    END IF;
    NEW.private_material_minimized_at=clock_timestamp();
    minimization=true;
  ELSIF NEW.private_material_minimized_at IS DISTINCT FROM OLD.private_material_minimized_at THEN
    RAISE EXCEPTION 'admission private minimization cannot be postponed or reversed' USING ERRCODE='23514';
  END IF;
  IF OLD.normalized_contact IS NOT NULL AND ROW(NEW.contact_type,NEW.normalized_contact) IS DISTINCT FROM ROW(OLD.contact_type,OLD.normalized_contact) AND NOT minimization THEN
    RAISE EXCEPTION 'admission fixed contact is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_admission_private_material() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME='academy_admission_requests' THEN
    IF NEW.private_material_minimized_at IS NOT NULL THEN
      RAISE EXCEPTION 'new admission requests cannot forge prior minimization' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.internal_reason IS NOT NULL OR NEW.external_message IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.academy_admission_requests request
      WHERE request.id=NEW.request_id AND request.tribe_id=NEW.tribe_id AND request.private_material_minimized_at IS NOT NULL) THEN
      RAISE EXCEPTION 'minimized admission decision contents cannot be restored' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_private_material() FROM PUBLIC;
CREATE TRIGGER admission_request_private_material_insert_guard BEFORE INSERT ON public.academy_admission_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_private_material();
CREATE TRIGGER admission_decision_private_material_guard BEFORE INSERT OR UPDATE ON public.academy_admission_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_private_material();

CREATE FUNCTION public.assert_admission_private_material_minimization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.private_material_minimized_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.academy_admission_requests request JOIN public.academy_admission_decisions decision
      ON decision.id=request.decision_id AND decision.request_id=request.id AND decision.tribe_id=request.tribe_id
    WHERE request.id=NEW.id AND request.private_material_minimized_at IS NOT NULL
      AND (decision.internal_reason IS NOT NULL OR decision.external_message IS NOT NULL)
  ) THEN RAISE EXCEPTION 'admission minimization must clear the original decision contents atomically' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_admission_private_material_minimization() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER admission_private_material_commit_guard AFTER UPDATE ON public.academy_admission_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.assert_admission_private_material_minimization();

CREATE FUNCTION public.minimize_terminal_admission_requests(requested_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE candidate record; request_record public.academy_admission_requests%ROWTYPE;
  decision_record public.academy_admission_decisions%ROWTYPE; scope record;
  processed integer=0; processed_by_tribe jsonb='{}'::jsonb; run_id uuid=gen_random_uuid();
  observed_at timestamptz=clock_timestamp(); cutoff_at timestamptz; has_remaining boolean;
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
        jsonb_build_object('owner','admission_requests','processed',scope.processed,'remaining',has_remaining,'cutoff',to_char(cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),observed_at);
  END LOOP;
  RETURN processed;
END;
$$;
REVOKE ALL ON FUNCTION public.minimize_terminal_admission_requests(integer) FROM PUBLIC;

CREATE FUNCTION public.purge_expired_admission_security_audit(requested_limit integer DEFAULT 500)
RETURNS TABLE(live_purged integer,archived_purged integer) LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE candidate record; scope record; deleted_id uuid; cutoff_at timestamptz;
  observed_at timestamptz=clock_timestamp(); run_id uuid=gen_random_uuid(); has_remaining boolean;
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
        jsonb_build_object('owner','admission_audit','processed',scope.processed,'remaining',has_remaining,'cutoff',to_char(cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),observed_at);
  END LOOP;
  FOR scope IN SELECT key::uuid AS tribe_id,value::integer AS processed FROM jsonb_each_text(archived_by_tribe)
  LOOP
    SELECT EXISTS(SELECT 1 FROM public.academy_admission_retired_audit_events WHERE tribe_id=scope.tribe_id AND created_at<=cutoff_at) INTO has_remaining;
    INSERT INTO public.academy_admission_retired_audit_events(id,tribe_id,resource_type,resource_id,event_type,rule,metadata,created_at,retired_at)
      VALUES(gen_random_uuid(),scope.tribe_id,'retention_run',run_id,'retention_completed','purge_admission_security_audit',
        jsonb_build_object('owner','admission_audit','processed',scope.processed,'remaining',has_remaining,'cutoff',to_char(cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),observed_at,observed_at);
  END LOOP;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_admission_security_audit(integer) FROM PUBLIC;

CREATE FUNCTION public.purge_admission_private_data(request_limit integer DEFAULT 100,audit_limit integer DEFAULT 500)
RETURNS TABLE(requests_minimized integer,audit_events_purged integer,archived_audit_events_purged integer,remaining_requests boolean,remaining_audit_events boolean)
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE observed_at timestamptz;
BEGIN
  requests_minimized=public.minimize_terminal_admission_requests(request_limit);
  SELECT live_purged,archived_purged INTO audit_events_purged,archived_audit_events_purged FROM public.purge_expired_admission_security_audit(audit_limit);
  observed_at=clock_timestamp();
  SELECT EXISTS(SELECT 1 FROM public.academy_admission_requests request JOIN public.academy_admission_decisions decision ON decision.id=request.decision_id
    WHERE request.status<>'pending' AND request.private_material_minimized_at IS NULL AND decision.decided_at<=public.admission_terminal_private_material_cutoff(observed_at)) INTO remaining_requests;
  SELECT EXISTS(SELECT 1 FROM public.academy_admission_audit_events WHERE created_at<=public.admission_security_audit_cutoff(observed_at))
    OR EXISTS(SELECT 1 FROM public.academy_admission_retired_audit_events WHERE created_at<=public.admission_security_audit_cutoff(observed_at)) INTO remaining_audit_events;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_admission_private_data(integer,integer) FROM PUBLIC;

-- Preserve the same four private retention facts when the tribe is physically removed.
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
      WHEN audit.resource_type='retention_run' THEN jsonb_build_object('owner',audit.metadata->'owner','processed',audit.metadata->'processed','remaining',audit.metadata->'remaining','cutoff',audit.metadata->'cutoff')
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
