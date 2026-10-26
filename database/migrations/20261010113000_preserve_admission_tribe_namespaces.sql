-- Keep a private namespace after physical deletion. Admission-dependent
-- deletion remains restricted until its full retirement transaction is wired.
-- Serialize creation/deletion through the migration transaction before sampling
-- existing rows; otherwise a concurrent INSERT can miss both backfill and trigger.
LOCK TABLE public.tribes IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.academy_admission_tribe_namespaces (
  tribe_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at timestamptz,
  CONSTRAINT admission_tribe_namespace_retirement_check
    CHECK(retired_at IS NULL OR retired_at>=created_at)
);

INSERT INTO public.academy_admission_tribe_namespaces(tribe_id)
  SELECT id FROM public.tribes;

ALTER TABLE public.academy_admission_tribe_namespaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_admission_tribe_namespaces FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_admission_tribe_namespaces FROM PUBLIC;
CREATE POLICY admission_tribe_namespace_owner_writer
  ON public.academy_admission_tribe_namespaces FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class
    WHERE oid='public.academy_admission_tribe_namespaces'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class
    WHERE oid='public.academy_admission_tribe_namespaces'::regclass));

CREATE FUNCTION public.guard_admission_tribe_namespace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'admission tribe namespace cannot be released'
      USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.tribe_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.tribe_id,OLD.created_at)
    OR OLD.retired_at IS NOT NULL
    OR NEW.retired_at IS NULL
    OR EXISTS(SELECT 1 FROM public.tribes WHERE id=OLD.tribe_id) THEN
    RAISE EXCEPTION 'admission tribe namespace retirement requires physical deletion'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_tribe_namespace() FROM PUBLIC;
CREATE TRIGGER admission_tribe_namespace_guard BEFORE UPDATE OR DELETE
  ON public.academy_admission_tribe_namespaces FOR EACH ROW
  EXECUTE FUNCTION public.guard_admission_tribe_namespace();

CREATE FUNCTION public.register_admission_tribe_namespace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF EXISTS(SELECT 1 FROM public.academy_admission_tribe_namespaces
      WHERE tribe_id=NEW.id) THEN
      RAISE EXCEPTION 'admission tribe namespace cannot be reused'
        USING ERRCODE='23514';
    END IF;
    INSERT INTO public.academy_admission_tribe_namespaces(tribe_id) VALUES(NEW.id);
    RETURN NEW;
  END IF;
  UPDATE public.academy_admission_tribe_namespaces
    SET retired_at=clock_timestamp() WHERE tribe_id=OLD.id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.register_admission_tribe_namespace() FROM PUBLIC;
CREATE TRIGGER admission_tribe_namespace_registration AFTER INSERT OR DELETE
  ON public.tribes FOR EACH ROW
  EXECUTE FUNCTION public.register_admission_tribe_namespace();
