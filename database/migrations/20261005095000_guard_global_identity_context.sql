-- Bind the native completed login to its actual account without changing public auth DTOs.
CREATE TABLE public.global_session_identity_bindings (
  session_id text PRIMARY KEY,
  user_id text NOT NULL,
  account_id text CONSTRAINT global_session_identity_account_reference_fkey REFERENCES public.account(id) ON DELETE SET NULL,
  provider_subject text NOT NULL,
  normalized_email text NOT NULL CHECK(normalized_email<>'' AND normalized_email=lower(btrim(normalized_email))),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  invalidated_at timestamptz,
  CONSTRAINT global_session_identity_session_fkey FOREIGN KEY(session_id,user_id) REFERENCES public.session(id,"userId") ON DELETE CASCADE,
  CONSTRAINT global_session_identity_account_fkey FOREIGN KEY(account_id,user_id,provider_subject) REFERENCES public.account(id,"userId","accountId") DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE public.global_session_identity_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY global_session_identity_own_user ON public.global_session_identity_bindings FOR SELECT USING(user_id=nullif(current_setting('app.current_user_id',true),''));
REVOKE ALL ON public.global_session_identity_bindings FROM PUBLIC;

CREATE FUNCTION public.guard_global_session_identity_binding() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF ROW(NEW.session_id,NEW.user_id,NEW.provider_subject,NEW.normalized_email,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.session_id,OLD.user_id,OLD.provider_subject,OLD.normalized_email,OLD.created_at) THEN
    RAISE EXCEPTION 'global session identity cannot be reassigned' USING ERRCODE='23514';
  END IF;
  IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    -- Keep a retired origin when the native unlink removes the account but not this session.
    IF OLD.account_id IS NULL OR NEW.account_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.account WHERE id=OLD.account_id) THEN
      RAISE EXCEPTION 'global session account cannot be rebound' USING ERRCODE='23514';
    END IF;
    NEW.invalidated_at:=coalesce(OLD.invalidated_at,NEW.invalidated_at,clock_timestamp());
  END IF;
  IF OLD.invalidated_at IS NOT NULL AND NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at THEN
    RAISE EXCEPTION 'global session identity invalidation is irreversible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_global_session_identity_binding() FROM PUBLIC;
CREATE TRIGGER global_session_identity_binding_guard BEFORE UPDATE ON public.global_session_identity_bindings FOR EACH ROW EXECUTE FUNCTION public.guard_global_session_identity_binding();

CREATE FUNCTION public.guard_global_identity_capture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.user_id,NEW.account_id,NEW.provider_id,NEW.provider_subject,NEW.normalized_email,NEW.email_verified_claim,NEW.hosted_domain,NEW.classification,NEW.issuer,NEW.audience,NEW.token_issued_at,NEW.token_expires_at,NEW.verified_at,NEW.version)
    IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.account_id,OLD.provider_id,OLD.provider_subject,OLD.normalized_email,OLD.email_verified_claim,OLD.hosted_domain,OLD.classification,OLD.issuer,OLD.audience,OLD.token_issued_at,OLD.token_expires_at,OLD.verified_at,OLD.version) THEN
    RAISE EXCEPTION 'global identity capture origin is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.invalidated_at IS NOT NULL AND ROW(NEW.invalidated_at,NEW.invalidation_reason) IS DISTINCT FROM ROW(OLD.invalidated_at,OLD.invalidation_reason) THEN
    RAISE EXCEPTION 'global identity capture invalidation is irreversible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_global_identity_capture() FROM PUBLIC;
CREATE TRIGGER global_identity_capture_guard BEFORE UPDATE ON public.global_identity_evidence FOR EACH ROW EXECUTE FUNCTION public.guard_global_identity_capture();

-- Metadata-only security invalidation. It never verifies a contact or changes login/session lifetime.
CREATE FUNCTION public.invalidate_global_identity_after_email_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed_at timestamptz;
BEGIN
  IF lower(btrim(NEW.email)) IS NOT DISTINCT FROM lower(btrim(OLD.email)) THEN RETURN NEW; END IF;
  changed_at:=clock_timestamp();
  UPDATE public.global_identity_evidence SET invalidated_at=changed_at,invalidation_reason='identity_changed' WHERE user_id=NEW.id AND invalidated_at IS NULL;
  UPDATE public.global_session_identity_bindings SET invalidated_at=changed_at WHERE user_id=NEW.id AND invalidated_at IS NULL;
  UPDATE public.recent_authentication_evidence SET invalidated_at=changed_at WHERE user_id=NEW.id AND invalidated_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_global_identity_after_email_change() FROM PUBLIC;
CREATE TRIGGER global_identity_email_invalidation AFTER UPDATE OF email ON public."user" FOR EACH ROW EXECUTE FUNCTION public.invalidate_global_identity_after_email_change();

-- The trigger also works when a no-bypass table owner services an auth update without request settings.
CREATE POLICY global_identity_owner_invalidation ON public.global_identity_evidence FOR UPDATE TO PUBLIC USING(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.global_identity_evidence'::regclass))) WITH CHECK(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.global_identity_evidence'::regclass)));
CREATE POLICY global_session_identity_owner_invalidation ON public.global_session_identity_bindings FOR UPDATE TO PUBLIC USING(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.global_session_identity_bindings'::regclass))) WITH CHECK(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.global_session_identity_bindings'::regclass)));
CREATE POLICY recent_authentication_owner_invalidation ON public.recent_authentication_evidence FOR UPDATE TO PUBLIC USING(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.recent_authentication_evidence'::regclass))) WITH CHECK(current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.recent_authentication_evidence'::regclass)));
