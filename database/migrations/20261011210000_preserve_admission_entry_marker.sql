-- Public navigation cannot lose the irreversible cutover marker when settings
-- disappear or the product mode changes. Writers still reauthorize every action.
CREATE OR REPLACE FUNCTION public.academy_offer_requires_admission_request(p_slug text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT coalesce((SELECT tribe.admissions_control_activated_at IS NOT NULL
    FROM public.tribes tribe WHERE tribe.slug=lower(btrim(p_slug))),false);
$$;
REVOKE ALL ON FUNCTION public.academy_offer_requires_admission_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academy_offer_requires_admission_request(text) TO PUBLIC;
