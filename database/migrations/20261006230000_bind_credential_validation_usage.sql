-- Credential checks share a tribe/hour budget regardless of key or resource version.
ALTER TABLE public.messaging_usage_events
  ADD COLUMN credential_connection_id uuid,
  ADD COLUMN credential_connection_version integer,
  ADD CONSTRAINT messaging_usage_credential_version_fkey
    FOREIGN KEY(credential_connection_id,tribe_id,credential_connection_version)
    REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version) ON DELETE RESTRICT;
-- Existing unbound historical checks remain in aggregate usage. New checks must
-- carry their exact source; no history is guessed, deleted or reset to install this.
ALTER TABLE public.messaging_usage_events ADD CONSTRAINT messaging_usage_credential_scope_check CHECK (
  (event_type='credential_validation' AND (
    (credential_connection_id IS NULL AND credential_connection_version IS NULL)
    OR (credential_connection_id IS NOT NULL AND credential_connection_version IS NOT NULL
      AND credential_connection_version>0 AND purpose='validate_messaging_connection'
      AND channel IS NULL AND challenge_id IS NULL AND contact_subject_id IS NULL)
  ))
  OR (event_type<>'credential_validation' AND credential_connection_id IS NULL AND credential_connection_version IS NULL)
) NOT VALID;
CREATE INDEX messaging_usage_credential_window_idx ON public.messaging_usage_events(tribe_id,occurred_at)
  WHERE event_type='credential_validation';

CREATE FUNCTION public.guard_credential_validation_usage_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.event_type='credential_validation' AND (
      NEW.credential_connection_id IS NULL OR NEW.credential_connection_version IS NULL
    ) THEN
      RAISE EXCEPTION 'new credential validation accounting requires its exact resource' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.event_type='credential_validation' OR NEW.event_type='credential_validation') AND (
    ROW(NEW.id,NEW.tribe_id,NEW.contact_subject_id,NEW.challenge_id,NEW.purpose,NEW.channel,
      NEW.event_type,NEW.operation_id,NEW.occurred_at,NEW.credential_connection_id,NEW.credential_connection_version)
      IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.contact_subject_id,OLD.challenge_id,OLD.purpose,OLD.channel,
        OLD.event_type,OLD.operation_id,OLD.occurred_at,OLD.credential_connection_id,OLD.credential_connection_version)
    OR (NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id AND NOT (
      NEW.actor_user_id IS NULL AND NOT EXISTS(SELECT 1 FROM public."user" WHERE id=OLD.actor_user_id)
    ))
  ) THEN
    RAISE EXCEPTION 'credential validation accounting identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_credential_validation_usage_identity() FROM PUBLIC;
CREATE TRIGGER credential_validation_usage_identity_guard BEFORE INSERT OR UPDATE ON public.messaging_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_credential_validation_usage_identity();
