-- Own list facts for the applicant entry, without private-table access from the
-- request role. The contact is always the current account's own email, read
-- here and never taken from a parameter, so the helper cannot probe the list.
-- It returns no entry id, no other account id, no connection or quota data:
-- only whether the own email has an enabled entry and who holds its binding,
-- relative to the caller.
CREATE FUNCTION public.read_own_admission_allowlist_facts(p_tribe_id uuid,p_session_id text)
RETURNS TABLE (
  tribe_id uuid,policy_version integer,mode text,contact_type text,is_open boolean,
  allow_common_exceptions boolean,requires_additional_verification boolean,
  requires_whatsapp_number boolean,activated_at timestamptz,normalized_email text,
  entry_exists boolean,entry_enabled boolean,entry_bound_to_other boolean,
  binding_exists boolean,binding_owned_by_actor boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  actor_id text := public.current_app_user_id();
  own_email text;
BEGIN
  IF actor_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.session session WHERE session.id=p_session_id
    AND session."userId"=actor_id AND session."expiresAt">clock_timestamp()) THEN RETURN; END IF;
  SELECT lower(btrim(account_user.email)) INTO own_email FROM public."user" account_user WHERE account_user.id=actor_id;
  IF own_email IS NULL OR own_email='' THEN RETURN; END IF;
  RETURN QUERY
    SELECT policy.tribe_id,policy.version,policy.mode,policy.contact_type,policy.is_open,
      policy.allow_common_exceptions,policy.requires_additional_verification,
      policy.requires_whatsapp_number,policy.activated_at,own_email,
      entry.id IS NOT NULL,coalesce(entry.status='enabled',false),
      coalesce(binding.owner_user_id IS NOT NULL AND binding.owner_user_id<>actor_id,false),
      binding.id IS NOT NULL,coalesce(binding.owner_user_id=actor_id,false)
    FROM public.academy_admission_policies policy
    LEFT JOIN public.academy_allowlist_entries entry ON entry.tribe_id=policy.tribe_id
      AND entry.contact_type='email' AND entry.normalized_contact=own_email
    LEFT JOIN public.academy_admission_contact_bindings binding ON binding.tribe_id=policy.tribe_id
      AND binding.contact_type='email' AND binding.normalized_contact=own_email
    WHERE policy.tribe_id=p_tribe_id;
END;
$$;
REVOKE ALL ON FUNCTION public.read_own_admission_allowlist_facts(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_own_admission_allowlist_facts(uuid,text) TO PUBLIC;
