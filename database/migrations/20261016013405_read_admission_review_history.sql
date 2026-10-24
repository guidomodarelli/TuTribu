-- Keep request-review history separate from the leader's complete audit and metrics.
-- The caller selects one resource; the native session and current reviewer role own authority.
CREATE FUNCTION public.read_admission_review_history(
  p_tribe_id uuid,
  p_session_id text,
  p_request_id uuid,
  p_limit integer DEFAULT 26,
  p_before_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
) RETURNS TABLE(
  id uuid,
  tribe_id uuid,
  admission_request_id uuid,
  event_type text,
  from_status text,
  to_status text,
  resource_version integer,
  actor_kind text,
  created_at timestamptz,
  cursor_at text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  actor_record record;
  current_request_version integer;
BEGIN
  IF p_request_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51
    OR ((p_before_at IS NULL)<>(p_before_id IS NULL)) THEN RETURN; END IF;
  IF NOT public.lock_academy_admission_administrative_reader(p_tribe_id,p_session_id) THEN RETURN; END IF;
  SELECT * INTO actor_record FROM public.read_admission_reviewer_context(p_tribe_id,p_session_id);
  IF NOT FOUND OR actor_record.role IS NULL OR actor_record.role NOT IN ('leader','guardian')
    OR actor_record.status IS DISTINCT FROM 'active' THEN RETURN; END IF;

  SELECT request.version INTO current_request_version
    FROM public.academy_admission_requests request
    WHERE request.tribe_id=p_tribe_id AND request.id=p_request_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY SELECT audit.id,audit.tribe_id,p_request_id,audit.event_type,
    audit.metadata->>'fromStatus',audit.metadata->>'toStatus',audit.resource_version,
    -- A missing reference can also follow account erasure; it does not prove automation.
    CASE WHEN audit.actor_user_id IS NULL THEN 'unattributed'::text ELSE 'account'::text END,
    audit.created_at,to_char(audit.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    FROM public.academy_admission_audit_events audit
    WHERE audit.tribe_id=p_tribe_id AND audit.resource_type='admission_request' AND audit.resource_id=p_request_id
      AND (p_before_at IS NULL OR (audit.created_at,audit.id)<(p_before_at,p_before_id))
    ORDER BY audit.created_at DESC,audit.id DESC LIMIT p_limit;

  -- One request was inspected, independently of how many retained events it has.
  -- The access fact uses the existing scoped details owner, never a fabricated command ledger.
  IF NOT public.record_academy_admission_administrative_exposure(
    p_tribe_id,p_session_id,'request_details',p_request_id,current_request_version,1
  ) THEN
    RAISE EXCEPTION 'review history exposure requires current reviewer scope' USING ERRCODE='42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.read_admission_review_history(uuid,text,uuid,integer,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_admission_review_history(uuid,text,uuid,integer,timestamptz,uuid) TO PUBLIC;
