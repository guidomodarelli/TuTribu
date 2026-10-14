-- One effective obligation/notice fact, within the original transaction and without copied contents.
CREATE UNIQUE INDEX admission_notification_audit_fact_key
  ON public.academy_admission_audit_events(tribe_id,resource_id,event_type)
  WHERE resource_type='admission_notification';

CREATE FUNCTION public.create_admission_notification_obligation(
  p_obligation_id uuid,p_tribe_id uuid,p_request_id uuid,p_applicant_user_id text,p_event_type text,
  p_operation_id uuid DEFAULT NULL,p_created_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_id text=public.current_app_user_id(); request_version integer; created_at_value timestamptz;
BEGIN
  PERFORM id FROM public.tribes WHERE id=p_tribe_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission notification tribe is unavailable' USING ERRCODE='23503'; END IF;
  IF actor_id IS NOT NULL THEN PERFORM id FROM public."user" WHERE id=actor_id FOR SHARE; END IF;
  IF p_operation_id IS NOT NULL THEN
    PERFORM id FROM public.academy_admission_operations WHERE id=p_operation_id AND tribe_id=p_tribe_id AND actor_user_id=actor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'admission notification original is unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT version INTO request_version FROM public.academy_admission_requests
    WHERE id=p_request_id AND tribe_id=p_tribe_id AND user_id=p_applicant_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission notification request is unavailable' USING ERRCODE='23503'; END IF;
  INSERT INTO public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type,created_at)
    VALUES(p_obligation_id,p_tribe_id,p_request_id,p_applicant_user_id,p_event_type,coalesce(p_created_at,clock_timestamp())) RETURNING created_at INTO created_at_value;
  INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,resource_version,metadata,created_at)
    VALUES(p_tribe_id,actor_id,'admission_notification',p_obligation_id,p_operation_id,'notification_obligation_created','record_admission_notification_obligation',NULL,
      jsonb_build_object('obligationId',p_obligation_id,'requestId',p_request_id,'requestVersion',request_version,'sourceEvent',p_event_type,'audience',NULL,'durationMs',NULL),created_at_value);
END;
$$;
REVOKE ALL ON FUNCTION public.create_admission_notification_obligation(uuid,uuid,uuid,text,text,uuid,timestamptz) FROM PUBLIC;

CREATE FUNCTION public.audit_materialized_admission_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE obligation public.academy_admission_notification_obligations%ROWTYPE; original_id uuid; request_version integer; materialized_at_value timestamptz;
BEGIN
  IF NEW.type NOT IN ('admission_pending_created','admission_approved','admission_rejected','admission_cancelled','admission_expired','admission_reminder') THEN RETURN NEW; END IF;
  SELECT * INTO obligation FROM public.academy_admission_notification_obligations WHERE id=NEW.admission_obligation_id AND tribe_id=NEW.tribe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'materialized admission notification original is unavailable' USING ERRCODE='23503'; END IF;
  SELECT operation_id INTO original_id FROM public.academy_admission_audit_events WHERE tribe_id=NEW.tribe_id
    AND resource_type='admission_notification' AND resource_id=obligation.id AND event_type='notification_obligation_created';
  SELECT version INTO request_version FROM public.academy_admission_requests WHERE id=obligation.request_id AND tribe_id=obligation.tribe_id;
  materialized_at_value:=clock_timestamp();
  INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,resource_version,metadata,created_at)
    VALUES(NEW.tribe_id,public.current_app_user_id(),'admission_notification',NEW.id,original_id,'notification_materialized','materialize_admission_notification',NULL,
      jsonb_build_object('obligationId',obligation.id,'requestId',obligation.request_id,'requestVersion',request_version,'sourceEvent',obligation.event_type,'audience',NEW.admission_audience,
        'durationMs',greatest(0,ceil(extract(epoch FROM materialized_at_value-obligation.created_at)*1000))),materialized_at_value);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_materialized_admission_notification() FROM PUBLIC;
CREATE TRIGGER admission_notification_materialization_audit AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.audit_materialized_admission_notification();
