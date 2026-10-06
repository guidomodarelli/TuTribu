-- Structural evidence lineage is checked independently of provider delivery.
-- Current policy, actor, code MAC and expiry are revalidated by the atomic writer.
CREATE FUNCTION public.guard_admission_proof_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE challenge public.contact_verification_challenges%ROWTYPE;
BEGIN
  SELECT * INTO challenge FROM public.contact_verification_challenges
    WHERE id=NEW.challenge_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admission proof challenge is absent' USING ERRCODE='23503';
  END IF;
  IF challenge.purpose<>'admission' OR challenge.state<>'verified' OR NOT challenge.is_current OR challenge.verified_at IS NULL OR challenge.invalidated_at IS NOT NULL OR challenge.invalidation_reason IS NOT NULL THEN
    RAISE EXCEPTION 'admission proof requires current verified admission challenge' USING ERRCODE='23514';
  END IF;
  IF NEW.status<>'available' OR NEW.applied_request_id IS NOT NULL OR NEW.applied_at IS NOT NULL OR NEW.invalidated_at IS NOT NULL OR NEW.invalidation_reason IS NOT NULL THEN
    RAISE EXCEPTION 'admission proof creation requires unused available state' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.user_id,NEW.tribe_id,NEW.contact_type,NEW.normalized_contact,NEW.verification_epoch,NEW.connection_id,NEW.connection_version,NEW.security_epoch,NEW.verified_at)
     IS DISTINCT FROM ROW(challenge.user_id,challenge.tribe_id,challenge.contact_type,challenge.normalized_contact,challenge.verification_epoch,challenge.connection_id,challenge.connection_version,challenge.security_epoch,challenge.verified_at) THEN
    RAISE EXCEPTION 'admission proof source scope is immutable' USING ERRCODE='23514';
  END IF;
  IF challenge.verified_at<challenge.created_at OR challenge.verified_at>=challenge.expires_at THEN
    RAISE EXCEPTION 'admission proof authentication is outside challenge validity' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_proof_origin() FROM PUBLIC;
CREATE TRIGGER admission_proof_origin_guard BEFORE INSERT ON public.academy_admission_verification_proofs FOR EACH ROW EXECUTE FUNCTION public.guard_admission_proof_origin();

CREATE FUNCTION public.guard_admission_proof_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='invalid' THEN
    IF NEW.invalidated_at IS NULL OR NEW.invalidation_reason IS NULL OR btrim(NEW.invalidation_reason)='' THEN
      RAISE EXCEPTION 'admission invalid proof requires invalidation record' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.invalidated_at IS NOT NULL OR NEW.invalidation_reason IS NOT NULL THEN
    RAISE EXCEPTION 'admission proof invalidation requires invalid state' USING ERRCODE='23514';
  END IF;
  IF OLD.invalidated_at IS NOT NULL AND ROW(NEW.invalidated_at,NEW.invalidation_reason) IS DISTINCT FROM ROW(OLD.invalidated_at,OLD.invalidation_reason) THEN
    RAISE EXCEPTION 'admission proof invalidation is irreversible' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.id,NEW.challenge_id,NEW.user_id,NEW.tribe_id,NEW.contact_type,NEW.normalized_contact,NEW.verification_epoch,NEW.connection_id,NEW.connection_version,NEW.security_epoch,NEW.verified_at,NEW.apply_before)
     IS DISTINCT FROM ROW(OLD.id,OLD.challenge_id,OLD.user_id,OLD.tribe_id,OLD.contact_type,OLD.normalized_contact,OLD.verification_epoch,OLD.connection_id,OLD.connection_version,OLD.security_epoch,OLD.verified_at,OLD.apply_before) THEN
    RAISE EXCEPTION 'admission proof origin and freshness window are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.applied_request_id IS NOT NULL AND ROW(NEW.applied_request_id,NEW.applied_at) IS DISTINCT FROM ROW(OLD.applied_request_id,OLD.applied_at) THEN
    RAISE EXCEPTION 'admission proof application is irreversible' USING ERRCODE='23514';
  END IF;
  IF OLD.applied_request_id IS NULL AND NEW.applied_request_id IS NOT NULL AND NOT (OLD.status='available' AND NEW.status='applied') THEN
    RAISE EXCEPTION 'admission proof application requires available transition' USING ERRCODE='23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='available' AND NEW.status IN ('applied','invalid')) OR
    (OLD.status='applied' AND NEW.status='invalid')
  ) THEN
    RAISE EXCEPTION 'admission proof transition is not allowed' USING ERRCODE='23514';
  END IF;
  IF OLD.status='available' AND NEW.status='applied' AND (
    NEW.applied_at IS NULL OR NEW.applied_at<NEW.verified_at OR NEW.applied_at>=NEW.apply_before OR clock_timestamp()>=NEW.apply_before
  ) THEN
    RAISE EXCEPTION 'admission proof application requires original freshness' USING ERRCODE='23514';
  END IF;
  IF OLD.status='invalid' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'admission invalid proof is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_proof_transition() FROM PUBLIC;
CREATE TRIGGER admission_proof_transition_guard BEFORE UPDATE ON public.academy_admission_verification_proofs FOR EACH ROW EXECUTE FUNCTION public.guard_admission_proof_transition();
