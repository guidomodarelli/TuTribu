-- Routing ids cannot silently represent another key and reset protected identity.
-- These are HMAC attestations of fixed platform metadata, never raw keys or PII.
CREATE TABLE public.messaging_key_material_proofs (
  purpose text NOT NULL,
  key_id text NOT NULL,
  verifier bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT messaging_key_material_proofs_pkey PRIMARY KEY(purpose,key_id),
  CONSTRAINT messaging_key_material_purpose_check CHECK(purpose IN ('contact_fingerprint','operation_payload')),
  CONSTRAINT messaging_key_material_proof_check CHECK(octet_length(verifier)=32)
);
ALTER TABLE public.messaging_key_material_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_key_material_proofs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.messaging_key_material_proofs FROM PUBLIC;
CREATE POLICY messaging_key_material_owner_writer ON public.messaging_key_material_proofs FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_key_material_proofs'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_key_material_proofs'::regclass));

CREATE FUNCTION public.guard_messaging_key_material_proof_original() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'platform key material attestation is immutable' USING ERRCODE='23514';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_messaging_key_material_proof_original() FROM PUBLIC;
CREATE TRIGGER messaging_key_material_proof_original_guard BEFORE UPDATE OR DELETE
ON public.messaging_key_material_proofs FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_key_material_proof_original();

CREATE FUNCTION public.assert_messaging_key_material_proof(requested_purpose text,requested_key_id text,requested_verifier bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE existing_verifier bytea;
BEGIN
  IF requested_purpose IS NULL OR requested_purpose NOT IN ('contact_fingerprint','operation_payload')
    OR nullif(btrim(requested_key_id),'') IS NULL OR requested_verifier IS NULL OR octet_length(requested_verifier)<>32 THEN
    RAISE EXCEPTION 'platform key material attestation input is invalid' USING ERRCODE='23514';
  END IF;
  SELECT proof.verifier INTO existing_verifier FROM public.messaging_key_material_proofs proof
    WHERE proof.purpose=requested_purpose AND proof.key_id=requested_key_id;
  IF FOUND THEN RETURN existing_verifier=requested_verifier; END IF;
  INSERT INTO public.messaging_key_material_proofs(purpose,key_id,verifier)
    VALUES(requested_purpose,requested_key_id,requested_verifier) ON CONFLICT(purpose,key_id) DO NOTHING;
  SELECT proof.verifier INTO existing_verifier FROM public.messaging_key_material_proofs proof
    WHERE proof.purpose=requested_purpose AND proof.key_id=requested_key_id;
  RETURN existing_verifier=requested_verifier;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_messaging_key_material_proof(text,text,bytea) FROM PUBLIC;

-- Existing historical ids need reconciliation by an explicitly private platform
-- operation; ordinary requests and routine rotation never enroll them silently.
CREATE FUNCTION public.check_messaging_key_material_proof(requested_purpose text,requested_key_id text,requested_verifier bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  -- Historical ids need explicit platform reconciliation, not first-use
  -- enrollment by an ordinary request after a hosting configuration change.
  IF NOT EXISTS(SELECT 1 FROM public.messaging_key_material_proofs proof WHERE proof.purpose=requested_purpose AND proof.key_id=requested_key_id) THEN
    IF requested_purpose='contact_fingerprint' AND (
      EXISTS(SELECT 1 FROM public.messaging_contact_fingerprint_aliases WHERE fingerprint_key_id=requested_key_id)
      OR EXISTS(SELECT 1 FROM public.academy_admission_contact_bindings WHERE fingerprint_key_id=requested_key_id)
      OR EXISTS(SELECT 1 FROM public.academy_allowlist_entries WHERE fingerprint_key_id=requested_key_id)
      OR EXISTS(SELECT 1 FROM public.academy_personal_invitations WHERE fingerprint_key_id=requested_key_id)
      OR EXISTS(SELECT 1 FROM public.academy_admission_requests WHERE fingerprint_key_id=requested_key_id)
      OR EXISTS(SELECT 1 FROM public.contact_verification_challenges WHERE fingerprint_key_id=requested_key_id)
      OR EXISTS(SELECT 1 FROM public.academy_admission_retired_bindings WHERE fingerprint_key_id=requested_key_id)
    ) THEN RETURN false; END IF;
    IF requested_purpose='operation_payload' AND (
      EXISTS(SELECT 1 FROM public.academy_admission_operations WHERE fingerprint_key_id=requested_key_id)
      OR EXISTS(SELECT 1 FROM public.message_deliveries WHERE payload_mac_key_id=requested_key_id)
      OR EXISTS(SELECT 1 FROM public.academy_admission_retired_operations WHERE fingerprint_key_id=requested_key_id)
    ) THEN RETURN false; END IF;
  END IF;
  RETURN public.assert_messaging_key_material_proof(requested_purpose,requested_key_id,requested_verifier);
END;
$$;
REVOKE ALL ON FUNCTION public.check_messaging_key_material_proof(text,text,bytea) FROM PUBLIC;

CREATE FUNCTION public.messaging_key_material_context_is_current() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT public.current_app_user_id() IS NOT NULL AND EXISTS(SELECT 1 FROM public."user" account WHERE account.id=public.current_app_user_id());
$$;
GRANT EXECUTE ON FUNCTION public.messaging_key_material_context_is_current() TO PUBLIC;

CREATE FUNCTION public.assert_authorized_messaging_key_material_proof(requested_purpose text,requested_key_id text,requested_verifier bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NOT public.messaging_key_material_context_is_current() THEN
    RAISE EXCEPTION 'platform key material attestation requires current identity' USING ERRCODE='42501';
  END IF;
  IF requested_purpose IS NULL OR requested_purpose NOT IN ('contact_fingerprint','operation_payload')
    OR nullif(btrim(requested_key_id),'') IS NULL OR requested_verifier IS NULL OR octet_length(requested_verifier)<>32 THEN
    RAISE EXCEPTION 'platform key material attestation input is invalid' USING ERRCODE='23514';
  END IF;
  -- Request roles only compare previously enrolled platform metadata.
  -- New keys are enrolled by the private rotation/reconciliation owner.
  RETURN EXISTS(SELECT 1 FROM public.messaging_key_material_proofs proof
    WHERE proof.purpose=requested_purpose AND proof.key_id=requested_key_id AND proof.verifier=requested_verifier);
END;
$$;
GRANT EXECUTE ON FUNCTION public.assert_authorized_messaging_key_material_proof(text,text,bytea) TO PUBLIC;
