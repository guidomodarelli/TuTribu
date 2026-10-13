-- Independent admission email capability. Reads do not initialize or enable it.
CREATE TABLE public.admission_email_settings (
  tribe_id uuid PRIMARY KEY REFERENCES public.tribes(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  changed_by_user_id text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_email_enabled_time_check CHECK(NOT enabled OR enabled_at IS NOT NULL)
);

CREATE FUNCTION public.guard_admission_email_settings_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tribe_id IS DISTINCT FROM OLD.tribe_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'admission email settings identity is immutable' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.enabled,NEW.enabled_at) IS DISTINCT FROM ROW(OLD.enabled,OLD.enabled_at) THEN
    IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'admission email change requires one version increment' USING ERRCODE='23514'; END IF;
  ELSIF NEW.version<>OLD.version THEN
    RAISE EXCEPTION 'admission email no-op cannot change version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_email_settings_version() FROM PUBLIC;
CREATE TRIGGER admission_email_settings_version_guard BEFORE UPDATE ON public.admission_email_settings FOR EACH ROW EXECUTE FUNCTION public.guard_admission_email_settings_version();

ALTER TABLE public.admission_email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY admission_email_owner_writer ON public.admission_email_settings FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_email_settings'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_email_settings'::regclass));
