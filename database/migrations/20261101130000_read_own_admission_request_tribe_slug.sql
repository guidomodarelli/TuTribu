-- A request link sent before the tribe was part of its address (/admissions/requests/<id> without ?tribe=) still opens the
-- applicant's own request: this read returns the slug of that request's tribe only to its own account with a live session.
-- Tribes stay unreadable to non-members through RLS, so the lookup is a narrow SECURITY DEFINER read with no other column.
CREATE FUNCTION public.read_own_admission_request_tribe_slug(p_session_id text,p_request_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT tribe.slug
  FROM public.academy_admission_requests request
  JOIN public.tribes tribe ON tribe.id=request.tribe_id
  WHERE request.id=p_request_id
    AND request.user_id=public.current_app_user_id()
    AND EXISTS(SELECT 1 FROM public.session session WHERE session.id=p_session_id
      AND session."userId"=request.user_id AND session."expiresAt">clock_timestamp());
$$;
REVOKE ALL ON FUNCTION public.read_own_admission_request_tribe_slug(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_own_admission_request_tribe_slug(text,uuid) TO PUBLIC;
