-- Public offer navigation metadata is informational; every writer keeps its native authorization.
CREATE FUNCTION public.academy_offer_requires_admission_request(p_slug text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT coalesce((SELECT tribe.admissions_control_activated_at IS NOT NULL
    FROM public.tribes tribe JOIN public.tribe_academy_settings settings ON settings.tribe_id=tribe.id
    WHERE tribe.slug=lower(btrim(p_slug)) AND settings.access_model='academy'),false);
$$;
REVOKE ALL ON FUNCTION public.academy_offer_requires_admission_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academy_offer_requires_admission_request(text) TO PUBLIC;
