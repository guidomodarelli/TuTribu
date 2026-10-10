-- Public admission setup excludes list membership, exception flags, invitation recipients and secrets.
CREATE FUNCTION public.read_public_admission_overview(p_slug text)
RETURNS TABLE (
  tribe_id uuid,slug text,name text,control_activated boolean,evaluator_enabled boolean,
  mode text,contact_type text,requires_additional_verification boolean,is_open boolean,policy_version integer
)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT tribe.id,tribe.slug,tribe.name,tribe.admissions_control_activated_at IS NOT NULL,
    coalesce(settings.admission_enabled AND settings.access_model='academy',false),policy.mode,policy.contact_type,policy.requires_additional_verification,
    policy.is_open,policy.version
  FROM public.tribes tribe
  LEFT JOIN public.tribe_academy_settings settings ON settings.tribe_id=tribe.id
  LEFT JOIN public.academy_admission_policies policy ON policy.tribe_id=tribe.id
  WHERE tribe.slug=p_slug AND (settings.access_model='academy' OR tribe.admissions_control_activated_at IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.read_public_admission_overview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_public_admission_overview(text) TO PUBLIC;
