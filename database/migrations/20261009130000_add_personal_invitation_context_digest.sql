-- New personal invitations store an indexable lookup HMAC and a separate
-- immutable resource-bound verification HMAC. Existing history is not backfilled
-- with invented cryptographic material and remains unavailable to the new owner.
ALTER TABLE public.academy_personal_invitations
  ADD COLUMN token_context_digest bytea,
  ADD CONSTRAINT admission_invitation_context_digest_check
    CHECK (token_context_digest IS NULL OR octet_length(token_context_digest)=32);

CREATE OR REPLACE FUNCTION public.guard_admission_invitation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.contact_type,NEW.normalized_contact,NEW.requires_allowlist,NEW.expires_at,NEW.token_hash,NEW.token_key_id,NEW.token_context_digest,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.contact_type,OLD.normalized_contact,OLD.requires_allowlist,OLD.expires_at,OLD.token_hash,OLD.token_key_id,OLD.token_context_digest,OLD.created_at) THEN
    RAISE EXCEPTION 'admission invitation recipient and token are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status<>'active' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'admission invitation terminal state is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.authorization_revoked_at IS NOT NULL AND NEW.authorization_revoked_at IS DISTINCT FROM OLD.authorization_revoked_at THEN
    RAISE EXCEPTION 'admission redeemed authorization revocation is irreversible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_invitation_identity() FROM PUBLIC;
