-- Current tribe owner mutations retire admission authority; pause never enters this path.
CREATE OR REPLACE FUNCTION public.close_academy_admission_scope(p_tribe_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_user_id text; challenge_record record; closure_time timestamptz;
BEGIN
  IF p_reason NOT IN ('academy_unavailable','tribe_deleted') THEN
    RAISE EXCEPTION 'admission scope retirement reason is unavailable' USING ERRCODE='23514';
  END IF;
  -- Row-trigger callers must already hold this fence or fail instead of waiting backwards.
  PERFORM id FROM public.tribes WHERE id=p_tribe_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission scope tenant is unavailable' USING ERRCODE='42501'; END IF;
  FOR current_user_id IN SELECT user_id FROM public.academy_admission_requests
    WHERE tribe_id=p_tribe_id AND status='pending' ORDER BY user_id LOOP
    PERFORM public.close_unavailable_admission_request(p_tribe_id,current_user_id,'academy_unavailable');
  END LOOP;
  PERFORM id FROM public.academy_personal_invitations WHERE tribe_id=p_tribe_id ORDER BY id FOR UPDATE;
  PERFORM id FROM public.message_deliveries WHERE tribe_id=p_tribe_id AND purpose IN ('admission','admission_notification') ORDER BY id FOR UPDATE;
  PERFORM id FROM public.contact_verification_challenges WHERE tribe_id=p_tribe_id AND purpose='admission' ORDER BY id FOR UPDATE;
  PERFORM id FROM public.academy_admission_verification_proofs WHERE tribe_id=p_tribe_id ORDER BY id FOR UPDATE;
  closure_time=clock_timestamp();
  UPDATE public.academy_personal_invitations SET status='revoked',revoked_at=closure_time,
    version=version+1,updated_at=closure_time WHERE tribe_id=p_tribe_id AND status='active';
  -- A redeemed token stays consumed. Revocation removes remaining authorization, never its attribution.
  UPDATE public.academy_personal_invitations SET authorization_revoked_at=closure_time,
    version=version+1,updated_at=closure_time WHERE tribe_id=p_tribe_id AND status='redeemed' AND authorization_revoked_at IS NULL;
  WITH original_proofs AS MATERIALIZED (
    SELECT proof.id,proof.status AS previous_state,challenge.channel
    FROM public.academy_admission_verification_proofs proof
    JOIN public.contact_verification_challenges challenge ON challenge.id=proof.challenge_id AND challenge.tribe_id=proof.tribe_id
    WHERE proof.tribe_id=p_tribe_id AND proof.status IN ('available','applied')
  ), changed_proofs AS (
    UPDATE public.academy_admission_verification_proofs SET status='invalid',invalidated_at=closure_time,
      invalidation_reason=p_reason WHERE tribe_id=p_tribe_id AND status IN ('available','applied')
    RETURNING id,challenge_id,verification_epoch,applied_request_id,status,invalidated_at
  )
  INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,cause,resource_version,metadata,created_at)
    SELECT p_tribe_id,public.current_app_user_id(),'admission_proof',changed.id,NULL,'proof_invalidated',p_reason,'scope_retired',NULL,
      jsonb_build_object('fromState',original.previous_state,'toState',changed.status,'challengeId',changed.challenge_id,
        'requestId',changed.applied_request_id,'verificationEpoch',changed.verification_epoch,'channel',original.channel),changed.invalidated_at
    FROM changed_proofs changed JOIN original_proofs original ON original.id=changed.id;
  FOR challenge_record IN SELECT id,code_envelope_id FROM public.contact_verification_challenges
    WHERE tribe_id=p_tribe_id AND purpose='admission' AND (is_current OR code_mac IS NOT NULL OR code_envelope_id IS NOT NULL)
    ORDER BY id LOOP
    IF challenge_record.code_envelope_id IS NOT NULL THEN
      PERFORM id FROM public.verification_code_envelopes WHERE id=challenge_record.code_envelope_id FOR UPDATE;
    END IF;
    UPDATE public.contact_verification_challenges SET is_current=false,
      state=CASE WHEN state='verified' THEN state ELSE 'invalidated' END,
      invalidated_at=coalesce(invalidated_at,closure_time),invalidation_reason=coalesce(invalidation_reason,p_reason),
      code_mac=NULL,code_envelope_id=NULL,version=version+1 WHERE id=challenge_record.id;
    IF challenge_record.code_envelope_id IS NOT NULL THEN
      DELETE FROM public.verification_code_envelopes WHERE id=challenge_record.code_envelope_id AND challenge_id=challenge_record.id;
    END IF;
  END LOOP;
  -- No cancellation of committed/uncertain attempts or reset of their budget, identity or lease.
  UPDATE public.message_deliveries delivery SET state='cancelled',last_outcome=p_reason,
    lease_token=NULL,lease_until=NULL,version=version+1
    WHERE tribe_id=p_tribe_id AND purpose IN ('admission','admission_notification') AND state='queued'
      AND NOT EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt WHERE attempt.delivery_id=delivery.id);
END;
$$;
REVOKE ALL ON FUNCTION public.close_academy_admission_scope(uuid,text) FROM PUBLIC;

