-- A confirmed operation is a historical commit snapshot. Replays cannot alter
-- its identity, normalized-intent MAC, result, completion time or version.
CREATE FUNCTION public.guard_admission_operation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.actor_user_id,NEW.tribe_id,NEW.operation_type,NEW.idempotency_key,NEW.intent_fingerprint,NEW.fingerprint_key_id,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.actor_user_id,OLD.tribe_id,OLD.operation_type,OLD.idempotency_key,OLD.intent_fingerprint,OLD.fingerprint_key_id,OLD.created_at) THEN
    RAISE EXCEPTION 'admission operation identity and intent are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state='completed' THEN
    IF ROW(NEW.state,NEW.public_result,NEW.completed_at,NEW.lease_owner,NEW.lease_until,NEW.version)
       IS DISTINCT FROM ROW(OLD.state,OLD.public_result,OLD.completed_at,OLD.lease_owner,OLD.lease_until,OLD.version) THEN
      RAISE EXCEPTION 'admission operation completed snapshot is immutable' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.state='completed' THEN
    IF NEW.version<>OLD.version+1 OR NEW.lease_owner IS NOT NULL OR NEW.lease_until IS NOT NULL THEN
      RAISE EXCEPTION 'admission operation completion requires one version increment and released claim' USING ERRCODE='23514';
    END IF;
  ELSIF ROW(NEW.lease_owner,NEW.lease_until) IS DISTINCT FROM ROW(OLD.lease_owner,OLD.lease_until) THEN
    IF NEW.version<>OLD.version+1 THEN
      RAISE EXCEPTION 'admission operation claim change requires one version increment' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.version<>OLD.version THEN
    RAISE EXCEPTION 'admission operation no-op cannot increment version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_operation_identity() FROM PUBLIC;
CREATE TRIGGER admission_operation_identity_guard BEFORE UPDATE ON public.academy_admission_operations
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_operation_identity();

ALTER TABLE public.academy_admission_operations ADD CONSTRAINT admission_operation_completed_claim_check
CHECK(state<>'completed' OR (lease_owner IS NULL AND lease_until IS NULL));
