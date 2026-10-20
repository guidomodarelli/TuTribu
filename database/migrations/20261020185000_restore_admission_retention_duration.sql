-- 20261017172000 redefined minimize_terminal_admission_requests to also clear whatsapp_number, but dropped the
-- durationMs that 20261015045000 had added to its retention_completed audit event. Without it the leader metrics
-- count the run but lose its duration sample. This keeps the current body and restores the duration.

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
      applicant_message=NULL,whatsapp_number=NULL,private_material_minimized_at=observed_at WHERE id=request_record.id AND version=request_record.version;
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
REVOKE ALL ON FUNCTION public.minimize_terminal_admission_requests(integer) FROM PUBLIC;
