-- Current tribe owner mutations retire admission authority; pause never enters this path.
CREATE FUNCTION public.close_academy_admission_scope(p_tribe_id uuid,p_reason text)
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
  UPDATE public.academy_admission_verification_proofs SET status='invalid',invalidated_at=closure_time,
    invalidation_reason=p_reason WHERE tribe_id=p_tribe_id AND status IN ('available','applied');
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

CREATE OR REPLACE FUNCTION public.close_admissions_after_academy_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  -- A cascading settings DELETE runs after its tribe disappeared; its BEFORE DELETE
  -- trigger already retired the scope. A direct settings DELETE still closes it here.
  IF (TG_OP='DELETE' AND EXISTS(SELECT 1 FROM public.tribes WHERE id=OLD.tribe_id))
    OR (TG_OP='UPDATE' AND OLD.access_model='academy' AND NEW.access_model<>'academy') THEN
    PERFORM public.close_academy_admission_scope(OLD.tribe_id,'academy_unavailable');
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.close_admissions_after_academy_lifecycle() FROM PUBLIC;

CREATE FUNCTION public.close_admission_scope_before_tribe_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.close_academy_admission_scope(OLD.id,'tribe_deleted');
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.close_admission_scope_before_tribe_deletion() FROM PUBLIC;
-- Runs before provenance archival and messaging retirement so terminal events are archived together.
CREATE TRIGGER admission_scope_close_before_delete BEFORE DELETE ON public.tribes
  FOR EACH ROW EXECUTE FUNCTION public.close_admission_scope_before_tribe_deletion();

-- Original lifecycle outcomes survive physical deletion and cannot be associated with a reused slug.
CREATE TABLE public.tribe_lifecycle_operations (
  actor_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  actor_reference_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('exit_academy','delete_tribe')),
  fingerprint_key_id text NOT NULL,
  intent_fingerprint bytea NOT NULL,
  public_result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tribe_id,operation_id),
  CHECK(jsonb_typeof(public_result)='object')
);
ALTER TABLE public.tribe_lifecycle_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_lifecycle_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tribe_lifecycle_operations FROM PUBLIC;
CREATE POLICY tribe_lifecycle_operation_owner ON public.tribe_lifecycle_operations FOR ALL
  USING(actor_user_id=public.current_app_user_id()) WITH CHECK(actor_user_id=public.current_app_user_id());
CREATE FUNCTION public.guard_tribe_lifecycle_operation_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'tribe lifecycle original cannot be deleted' USING ERRCODE='23514'; END IF;
  IF NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id AND NEW.actor_user_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM public."user" WHERE id=OLD.actor_user_id)
    AND (to_jsonb(NEW)-'actor_user_id')=(to_jsonb(OLD)-'actor_user_id') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'tribe lifecycle original is immutable' USING ERRCODE='23514';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_tribe_lifecycle_operation_origin() FROM PUBLIC;
CREATE TRIGGER tribe_lifecycle_operation_origin_guard BEFORE UPDATE OR DELETE ON public.tribe_lifecycle_operations
  FOR EACH ROW EXECUTE FUNCTION public.guard_tribe_lifecycle_operation_origin();
