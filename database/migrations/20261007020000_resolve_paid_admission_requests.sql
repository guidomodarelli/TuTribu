-- Runtime callers receive one receipt-scoped writer, never direct admission DML.
-- Deferred structural checks execute at COMMIT after the writer has returned;
-- they must retain owner read access rather than require caller table grants.
ALTER FUNCTION public.guard_admission_decision_commit() SECURITY DEFINER;
ALTER FUNCTION public.guard_admission_decision_commit() SET search_path=pg_catalog,public;

CREATE FUNCTION public.resolve_paid_admission_request(p_effect_id uuid,p_tribe_id uuid,p_user_id text)
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
  INSERT INTO public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type)
    VALUES(resolution_obligation_id,p_tribe_id,request_record.id,p_user_id,resolution_status);
  INSERT INTO public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,resource_version,metadata,created_at)
    VALUES(p_tribe_id,'admission_request',request_record.id,resolution_status,resolution_rule,request_record.version+1,
      jsonb_build_object('subscriptionMembershipEffectId',p_effect_id),final_now);
  PERFORM public.enqueue_admission_notification(resolution_obligation_id,p_user_id,'applicant');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_paid_admission_request(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_paid_admission_request(uuid,uuid,text) TO PUBLIC;
