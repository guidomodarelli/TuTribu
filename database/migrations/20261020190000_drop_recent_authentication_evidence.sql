-- Phase B of removing Google reauthentication (decision of 2026-10-19): no admission or messaging operation
-- requires recent authentication anymore; the active leader session plus an explicit confirmation is enough.
-- Phase A removed every reader and writer, so the recency evidence and its intents are dead storage.
-- Global identity evidence and session identity bindings stay: they are unrelated to recency.

-- The email-change invalidation keeps invalidating the identity facts that still exist.
CREATE OR REPLACE FUNCTION public.invalidate_global_identity_after_email_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed_at timestamptz;
BEGIN
  IF lower(btrim(NEW.email)) IS NOT DISTINCT FROM lower(btrim(OLD.email)) THEN RETURN NEW; END IF;
  changed_at:=clock_timestamp();
  UPDATE public.global_identity_evidence SET invalidated_at=changed_at,invalidation_reason='identity_changed' WHERE user_id=NEW.id AND invalidated_at IS NULL;
  UPDATE public.global_session_identity_bindings SET invalidated_at=changed_at WHERE user_id=NEW.id AND invalidated_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_global_identity_after_email_change() FROM PUBLIC;

-- Dropping each table removes its policies, triggers, indexes and foreign keys with it.
DROP TABLE public.recent_authentication_evidence;
DROP TABLE public.global_reauthentication_intents;

DROP FUNCTION public.guard_recent_authentication_evidence();
DROP FUNCTION public.guard_global_reauthentication_intent_transition();
