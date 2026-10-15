-- Explicit own choices remain independent of email enablement, connections and OTP.
CREATE TABLE public.admission_notification_preferences (
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK(mode IN ('individual','grouped','daily','omitted')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  effective_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_notification_preferences_pkey PRIMARY KEY(tribe_id,recipient_user_id)
);

-- Epochs originate at the actual write; callers cannot backdate subscriptions.
CREATE FUNCTION public.guard_admission_notification_preference()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 THEN
      RAISE EXCEPTION 'admission notification preference must start at version one' USING ERRCODE='23514';
    END IF;
    NEW.effective_from=clock_timestamp();
    NEW.created_at=NEW.effective_from;
  ELSE
    IF ROW(NEW.tribe_id,NEW.recipient_user_id,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.tribe_id,OLD.recipient_user_id,OLD.created_at) THEN
      RAISE EXCEPTION 'admission notification preference identity is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.mode IS DISTINCT FROM OLD.mode THEN
      IF NEW.version<>OLD.version+1 THEN
        RAISE EXCEPTION 'admission notification preference change requires one version increment' USING ERRCODE='23514';
      END IF;
      NEW.effective_from=clock_timestamp();
    ELSIF ROW(NEW.version,NEW.effective_from) IS DISTINCT FROM ROW(OLD.version,OLD.effective_from) THEN
      RAISE EXCEPTION 'admission notification preference no-op cannot change version or epoch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_preference() FROM PUBLIC;
CREATE TRIGGER admission_notification_preference_guard
  BEFORE INSERT OR UPDATE ON public.admission_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_notification_preference();

ALTER TABLE public.admission_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_notification_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_notification_preferences FROM PUBLIC;
CREATE POLICY admission_notification_preference_owner_writer
  ON public.admission_notification_preferences FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_preferences'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_preferences'::regclass));
CREATE POLICY admission_notification_preference_own_read
  ON public.admission_notification_preferences FOR SELECT
  USING(recipient_user_id=public.current_app_user_id() AND EXISTS(
    SELECT 1 FROM public.tribe_members member
    WHERE member.tribe_id=admission_notification_preferences.tribe_id
      AND member.user_id=public.current_app_user_id()
      AND member.role IN ('leader','guardian') AND member.status='active'
  ));
