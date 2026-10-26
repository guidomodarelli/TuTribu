-- Lifecycle facts come from actual owner row changes, never a browser reason flag.
CREATE FUNCTION public.close_unavailable_admission_request(p_tribe_id uuid,p_user_id text,p_reason text)
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
  INSERT INTO public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type)
    VALUES(resolution_obligation_id,p_tribe_id,request_record.id,p_user_id,resolution_status);
  INSERT INTO public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,resource_version,created_at)
    VALUES(p_tribe_id,'admission_request',request_record.id,resolution_status,resolution_rule,request_record.version+1,final_now);
  PERFORM public.enqueue_admission_notification(resolution_obligation_id,p_user_id,'applicant');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.close_unavailable_admission_request(uuid,text,text) FROM PUBLIC;

-- Check lock order before the older membership-source guard takes FOR SHARE.
-- Trigger names run alphabetically; academy_admission precedes academy_membership.
CREATE FUNCTION public.lock_admission_member_lifecycle_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' OR (NEW.status='blocked' AND NEW.status_reason<>'payment_blocked')
    OR (NEW.status='removed' AND NEW.status_reason<>'subscription_inactive') THEN
    -- An in-flight submit may hold the tribe before its pending row exists.
    -- Checking only visible requests would still permit a reverse lock cycle.
    PERFORM id FROM public.tribes WHERE id=OLD.tribe_id FOR UPDATE NOWAIT;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_admission_member_lifecycle_scope() FROM PUBLIC;
CREATE TRIGGER academy_admission_lifecycle_lock BEFORE UPDATE OF status,status_reason OR DELETE ON public.tribe_members
  FOR EACH ROW EXECUTE FUNCTION public.lock_admission_member_lifecycle_scope();

CREATE FUNCTION public.close_admissions_after_member_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.close_unavailable_admission_request(OLD.tribe_id,OLD.user_id,'membership_deleted');
    RETURN OLD;
  END IF;
  IF (NEW.status='blocked' AND NEW.status_reason<>'payment_blocked')
    OR (NEW.status='removed' AND NEW.status_reason<>'subscription_inactive') THEN
    PERFORM public.close_unavailable_admission_request(NEW.tribe_id,NEW.user_id,'nonrecoverable_membership');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.close_admissions_after_member_lifecycle() FROM PUBLIC;
CREATE TRIGGER admission_member_unavailable AFTER UPDATE OF status,status_reason OR DELETE ON public.tribe_members
  FOR EACH ROW EXECUTE FUNCTION public.close_admissions_after_member_lifecycle();

CREATE FUNCTION public.close_admissions_after_academy_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pending_user_id text;
BEGIN
  IF TG_OP='DELETE' OR (OLD.access_model='academy' AND NEW.access_model<>'academy') THEN
    FOR pending_user_id IN SELECT user_id FROM public.academy_admission_requests
      WHERE tribe_id=OLD.tribe_id AND status='pending' ORDER BY user_id LOOP
      PERFORM public.close_unavailable_admission_request(OLD.tribe_id,pending_user_id,'academy_unavailable');
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.close_admissions_after_academy_lifecycle() FROM PUBLIC;
CREATE TRIGGER admission_academy_unavailable AFTER UPDATE OF access_model OR DELETE ON public.tribe_academy_settings
  FOR EACH ROW EXECUTE FUNCTION public.close_admissions_after_academy_lifecycle();

CREATE FUNCTION public.close_admissions_before_account_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pending_tribe_id uuid;
BEGIN
  FOR pending_tribe_id IN SELECT tribe_id FROM public.academy_admission_requests
    WHERE user_id=OLD.id AND status='pending' ORDER BY tribe_id LOOP
    PERFORM public.close_unavailable_admission_request(pending_tribe_id,OLD.id,'account_deleted');
  END LOOP;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.close_admissions_before_account_deletion() FROM PUBLIC;
CREATE TRIGGER admission_account_unavailable BEFORE DELETE ON public."user"
  FOR EACH ROW EXECUTE FUNCTION public.close_admissions_before_account_deletion();

-- User deletion legitimately cascades the already-closed request and decision.
-- A surviving decision still requires all structural co-commit invariants.
CREATE OR REPLACE FUNCTION public.guard_admission_decision_commit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE request_state text; request_decision_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.academy_admission_decisions WHERE id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM public.academy_admission_requests WHERE id=NEW.request_id) THEN RETURN NEW; END IF;
  SELECT status,decision_id INTO request_state,request_decision_id FROM public.academy_admission_requests WHERE id=NEW.request_id;
  IF NOT FOUND OR request_state IS DISTINCT FROM NEW.outcome OR request_decision_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'admission terminal decision requires matching request transition' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.academy_admission_notification_obligations
    WHERE request_id=NEW.request_id AND tribe_id=NEW.tribe_id AND applicant_user_id=NEW.user_id AND event_type=NEW.outcome) THEN
    RAISE EXCEPTION 'admission terminal decision requires notification obligation' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.academy_admission_audit_events
    WHERE tribe_id=NEW.tribe_id AND resource_type='admission_request' AND resource_id=NEW.request_id AND event_type=NEW.outcome) THEN
    RAISE EXCEPTION 'admission terminal decision requires audit event' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_decision_commit() FROM PUBLIC;
