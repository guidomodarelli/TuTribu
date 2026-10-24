-- Only the private backend may fence a live tribe for externally controlled recovery.
-- This function neither reads keys nor treats restored rows as recovery authority.
CREATE FUNCTION public.claim_messaging_recovery_scope(requested_tribe uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF public.current_app_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'messaging recovery requires backend context' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.academy_admission_tribe_namespaces namespace
    WHERE namespace.tribe_id=requested_tribe AND namespace.retired_at IS NULL FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Never wait in reverse order behind the owner of a concurrent tribe deletion.
  PERFORM 1 FROM public.tribes tribe WHERE tribe.id=requested_tribe FOR UPDATE NOWAIT;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_messaging_recovery_scope(uuid) FROM PUBLIC;
