-- Lock canonical leadership without granting request roles membership UPDATE.
-- SELECT FOR SHARE is governed by UPDATE policies and can hide a legitimate
-- leader from a non-bypass request role that has only ownership SELECT access.
CREATE FUNCTION public.lock_admission_canonical_leader(target_tribe_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE actor text=public.current_app_user_id(); leader_count integer; leader_id text;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tribe_members
    WHERE tribe_id=target_tribe_id AND user_id=actor AND role='leader' AND status='active'
  ) THEN RETURN false; END IF;
  -- Readers already own a tribe share lock; never upgrade it here. Command
  -- owners take their stronger tribe update lock before calling this helper.
  PERFORM id FROM public.tribes WHERE id=target_tribe_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM user_id FROM public.tribe_members
  WHERE tribe_id=target_tribe_id AND role='leader' AND status='active'
  ORDER BY user_id FOR SHARE;
  SELECT count(*),min(user_id) INTO leader_count,leader_id
  FROM public.tribe_members
  WHERE tribe_id=target_tribe_id AND role='leader' AND status='active';
  RETURN leader_count=1 AND leader_id=actor;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_admission_canonical_leader(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_admission_canonical_leader(uuid) TO PUBLIC;
