-- Authenticated applicant display choices expose no credential, sender, quota,
-- other applicant or sending authority. Keep ordinary roles off private tables.
CREATE FUNCTION public.read_admission_contact_choices(p_tribe_id uuid,p_session_id text)
RETURNS TABLE (
  tribe_id uuid,policy_version integer,contact_type text,
  requires_additional_verification boolean,phone_channel text,allow_sms_alternative boolean,
  usage_policy_version integer,allowed_countries text[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_id text := public.current_app_user_id();
BEGIN
  IF actor_id IS NULL THEN RETURN; END IF;
  PERFORM tribe.id FROM public.tribes tribe WHERE tribe.id=p_tribe_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM session.id FROM public.session session
    WHERE session.id=p_session_id AND session."userId"=actor_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM policy.tribe_id FROM public.academy_admission_policies policy
    WHERE policy.tribe_id=p_tribe_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM usage.tribe_id FROM public.messaging_usage_policies usage
    WHERE usage.tribe_id=p_tribe_id FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.session session WHERE session.id=p_session_id
    AND session."userId"=actor_id AND session."expiresAt">clock_timestamp()) THEN RETURN; END IF;
  RETURN QUERY
    SELECT policy.tribe_id,policy.version,policy.contact_type,
      policy.requires_additional_verification,policy.phone_channel,policy.allow_sms_alternative,
      usage.version,usage.allowed_countries
    FROM public.academy_admission_policies policy
    LEFT JOIN public.messaging_usage_policies usage ON usage.tribe_id=policy.tribe_id
    WHERE policy.tribe_id=p_tribe_id;
END;
$$;
REVOKE ALL ON FUNCTION public.read_admission_contact_choices(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_admission_contact_choices(uuid,text) TO PUBLIC;
