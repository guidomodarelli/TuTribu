-- A failed or unavailable tenant still yields its turn; these locators never grant dispatch authority.
CREATE TABLE public.admission_notification_producer_progress (
  tribe_id uuid PRIMARY KEY REFERENCES public.tribes(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  last_selected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_notification_producer_progress_version_check CHECK(version>0),
  CONSTRAINT admission_notification_producer_progress_clock_check CHECK(
    isfinite(last_selected_at) AND abs(extract(epoch FROM last_selected_at)*1000000)<=9007199254740991)
);
ALTER TABLE public.admission_notification_producer_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_notification_producer_progress FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_notification_producer_progress FROM PUBLIC;
CREATE POLICY admission_notification_producer_progress_owner ON public.admission_notification_producer_progress FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_producer_progress'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_producer_progress'::regclass));

CREATE FUNCTION public.guard_admission_notification_producer_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.version<>1 OR TG_OP='UPDATE' AND (NEW.tribe_id<>OLD.tribe_id OR NEW.version<>OLD.version+1) THEN
    RAISE EXCEPTION 'admission notification producer requires a new native selection turn' USING ERRCODE='23514';
  END IF;
  NEW.last_selected_at=clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_producer_progress() FROM PUBLIC;
CREATE TRIGGER admission_notification_producer_progress_guard BEFORE INSERT OR UPDATE ON public.admission_notification_producer_progress
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_notification_producer_progress();
