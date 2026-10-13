-- Keeps the bounded tribe-first expiration owner and its existing private ACL.
-- Only the staged audit projection changes; decisions, notices and clock remain atomic.
CREATE OR REPLACE FUNCTION public.expire_academy_admission_requests(requested_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE candidate record; request_record public.academy_admission_requests%ROWTYPE;
  policy_record public.academy_admission_policies%ROWTYPE;
  server_now timestamptz; expiration_decision_id uuid; obligation_id uuid;
  expired_count integer=0;
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
    expired_count=expired_count+1;
    END LOOP;
    IF expired_count>=requested_limit THEN EXIT; END IF;
  END LOOP;
  RETURN expired_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_academy_admission_requests(integer) FROM PUBLIC;
