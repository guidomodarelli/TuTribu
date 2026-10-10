-- Deleted accounts retain only an irreversible private contact reservation.
ALTER TABLE public.academy_admission_contact_bindings
  ADD COLUMN owner_reference_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN minimized_at timestamptz,
  ALTER COLUMN normalized_contact DROP NOT NULL,
  ALTER COLUMN owner_user_id DROP NOT NULL,
  DROP CONSTRAINT admission_binding_user_fkey,
  DROP CONSTRAINT admission_binding_origin_check,
  ADD CONSTRAINT admission_binding_user_fkey FOREIGN KEY(owner_user_id)
    REFERENCES public."user"(id) ON DELETE SET NULL,
  ADD CONSTRAINT admission_binding_origin_check CHECK(
    minimized_at IS NOT NULL OR first_request_id IS NOT NULL OR first_proof_id IS NOT NULL
  ),
  ADD CONSTRAINT admission_binding_minimization_check CHECK(
    (minimized_at IS NULL AND owner_user_id IS NOT NULL AND normalized_contact IS NOT NULL)
    OR (minimized_at IS NOT NULL AND owner_user_id IS NULL AND normalized_contact IS NULL
      AND first_request_id IS NULL AND first_proof_id IS NULL AND minimized_at>=created_at)
  );

CREATE INDEX admission_minimized_contact_lookup_idx
  ON public.academy_admission_contact_bindings(tribe_id,contact_type,fingerprint_key_id,contact_fingerprint)
  WHERE normalized_contact IS NULL;

CREATE OR REPLACE FUNCTION public.guard_admission_binding_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.owner_user_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public."user" WHERE id=OLD.owner_user_id) THEN
    IF ROW(NEW.id,NEW.tribe_id,NEW.contact_type,NEW.contact_fingerprint,
      NEW.fingerprint_key_id,NEW.owner_reference_id,NEW.evidence_source,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.contact_type,OLD.contact_fingerprint,
      OLD.fingerprint_key_id,OLD.owner_reference_id,OLD.evidence_source,OLD.created_at) THEN
      RAISE EXCEPTION 'admission minimized contact reservation is immutable' USING ERRCODE='23514';
    END IF;
    NEW.owner_user_id := NULL;
    NEW.normalized_contact := NULL;
    NEW.first_request_id := NULL;
    NEW.first_proof_id := NULL;
    NEW.minimized_at := clock_timestamp();
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.tribe_id,NEW.contact_type,NEW.normalized_contact,NEW.owner_user_id,
    NEW.first_request_id,NEW.first_proof_id,NEW.evidence_source,NEW.created_at,
    NEW.owner_reference_id,NEW.minimized_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.contact_type,OLD.normalized_contact,OLD.owner_user_id,
    OLD.first_request_id,OLD.first_proof_id,OLD.evidence_source,OLD.created_at,
    OLD.owner_reference_id,OLD.minimized_at)
    OR OLD.minimized_at IS NOT NULL AND ROW(NEW.contact_fingerprint,NEW.fingerprint_key_id)
      IS DISTINCT FROM ROW(OLD.contact_fingerprint,OLD.fingerprint_key_id) THEN
    RAISE EXCEPTION 'admission binding identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_binding_identity() FROM PUBLIC;

-- Audit references keep their ledger identity after the account disappears.
ALTER TABLE public.academy_admission_operations
  ADD COLUMN actor_reference_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN minimized_at timestamptz,
  ALTER COLUMN actor_user_id DROP NOT NULL,
  DROP CONSTRAINT admission_operation_actor_fkey,
  ADD CONSTRAINT admission_operation_actor_fkey FOREIGN KEY(actor_user_id)
    REFERENCES public."user"(id) ON DELETE SET NULL,
  ADD CONSTRAINT admission_operation_minimization_check CHECK(
    (minimized_at IS NULL AND actor_user_id IS NOT NULL)
    OR (minimized_at IS NOT NULL AND actor_user_id IS NULL AND minimized_at>=created_at)
  );

CREATE OR REPLACE FUNCTION public.guard_admission_operation_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM public."user" WHERE id=OLD.actor_user_id) THEN
    IF ROW(NEW.id,NEW.tribe_id,NEW.operation_type,NEW.idempotency_key,
      NEW.intent_fingerprint,NEW.fingerprint_key_id,NEW.created_at,NEW.actor_reference_id)
      IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.operation_type,OLD.idempotency_key,
      OLD.intent_fingerprint,OLD.fingerprint_key_id,OLD.created_at,OLD.actor_reference_id) THEN
      RAISE EXCEPTION 'admission retained operation provenance is immutable' USING ERRCODE='23514';
    END IF;
    NEW.minimized_at := clock_timestamp();
    NEW.public_result := CASE WHEN OLD.state='completed' THEN '{"minimized":true}'::jsonb ELSE NULL END;
    NEW.state := OLD.state;
    NEW.completed_at := OLD.completed_at;
    NEW.version := OLD.version;
    NEW.lease_owner := NULL;
    NEW.lease_until := NULL;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.actor_user_id,NEW.tribe_id,NEW.operation_type,NEW.idempotency_key,
    NEW.intent_fingerprint,NEW.fingerprint_key_id,NEW.created_at,NEW.actor_reference_id,NEW.minimized_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.actor_user_id,OLD.tribe_id,OLD.operation_type,OLD.idempotency_key,
    OLD.intent_fingerprint,OLD.fingerprint_key_id,OLD.created_at,OLD.actor_reference_id,OLD.minimized_at) THEN
    RAISE EXCEPTION 'admission operation identity and intent are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state='completed' OR OLD.minimized_at IS NOT NULL THEN
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

-- Retired membership provenance cannot authorize an account that no longer exists.
ALTER TABLE public.academy_admission_membership_effects
  ADD COLUMN account_reference_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN minimized_at timestamptz,
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT academy_admission_membership_effects_user_id_fkey,
  ADD CONSTRAINT academy_admission_membership_effects_user_id_fkey FOREIGN KEY(user_id)
    REFERENCES public."user"(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT admission_membership_effect_minimization_check CHECK(
    (minimized_at IS NULL AND user_id IS NOT NULL)
    OR (minimized_at IS NOT NULL AND user_id IS NULL AND member_id IS NULL
      AND minimized_at>=created_at AND (applied_at IS NULL OR revoked_at IS NOT NULL))
  );

CREATE OR REPLACE FUNCTION public.guard_admission_membership_effect_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."user" WHERE id=OLD.user_id) THEN
    IF ROW(NEW.id,NEW.decision_id,NEW.request_id,NEW.tribe_id,NEW.outcome,NEW.target_status,
      NEW.created_at,NEW.applied_at,NEW.account_reference_id)
      IS DISTINCT FROM ROW(OLD.id,OLD.decision_id,OLD.request_id,OLD.tribe_id,OLD.outcome,OLD.target_status,
      OLD.created_at,OLD.applied_at,OLD.account_reference_id) THEN
      RAISE EXCEPTION 'admission minimized membership provenance is immutable' USING ERRCODE='23514';
    END IF;
    NEW.user_id := NULL;
    NEW.member_id := NULL;
    NEW.minimized_at := clock_timestamp();
    IF OLD.applied_at IS NOT NULL THEN
      NEW.revoked_at := coalesce(OLD.revoked_at,clock_timestamp());
      NEW.revocation_reason := coalesce(OLD.revocation_reason,'account_deleted');
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.decision_id,NEW.request_id,NEW.tribe_id,NEW.user_id,NEW.outcome,
    NEW.target_status,NEW.created_at,NEW.account_reference_id,NEW.minimized_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.decision_id,OLD.request_id,OLD.tribe_id,OLD.user_id,OLD.outcome,
    OLD.target_status,OLD.created_at,OLD.account_reference_id,OLD.minimized_at) THEN
    RAISE EXCEPTION 'admission membership effect origin is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.member_id IS DISTINCT FROM OLD.member_id AND NOT(
    OLD.member_id IS NOT NULL AND NEW.member_id IS NULL AND NEW.revoked_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.tribe_members member WHERE member.id=OLD.member_id)
  ) THEN RAISE EXCEPTION 'admission membership instance cannot be reassigned' USING ERRCODE='23514'; END IF;
  IF OLD.applied_at IS NOT NULL AND NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
    RAISE EXCEPTION 'admission membership consumption is irreversible' USING ERRCODE='23514';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND ROW(NEW.revoked_at,NEW.revocation_reason)
    IS DISTINCT FROM ROW(OLD.revoked_at,OLD.revocation_reason) THEN
    RAISE EXCEPTION 'admission membership revocation is irreversible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_membership_effect_transition() FROM PUBLIC;
