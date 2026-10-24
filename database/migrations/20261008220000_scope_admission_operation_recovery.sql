-- Keep shared challenge issuance out of admission recovery unless its immutable
-- owner metadata explicitly establishes admission. Preserve the existing native
-- session locks, function signature and public projection without material access.
CREATE OR REPLACE FUNCTION public.read_own_admission_operations(p_tribe_id uuid,p_session_id text,p_operation_id uuid)
RETURNS TABLE (
  operation_type text,state text,idempotency_key uuid,public_result jsonb,
  member_role text,member_status text,request_user_id text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  actor_id text := public.current_app_user_id();
  membership_role text;
  membership_status text;
BEGIN
  IF actor_id IS NULL THEN RETURN; END IF;
  PERFORM tribe.id FROM public.tribes tribe WHERE tribe.id=p_tribe_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM session.id FROM public.session session
    WHERE session.id=p_session_id AND session."userId"=actor_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT member.role,member.status INTO membership_role,membership_status
    FROM public.tribe_members member
    WHERE member.tribe_id=p_tribe_id AND member.user_id=actor_id FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.session session WHERE session.id=p_session_id
    AND session."userId"=actor_id AND session."expiresAt">clock_timestamp()) THEN RETURN; END IF;
  RETURN QUERY
    SELECT operation.operation_type,operation.state,operation.idempotency_key,
      operation.public_result,membership_role,membership_status,request.user_id
    FROM public.academy_admission_operations operation
    LEFT JOIN public.academy_admission_requests request
      ON request.tribe_id=operation.tribe_id
      AND request.id::text=operation.public_result->>'admissionRequestId'
    WHERE operation.actor_user_id=actor_id AND operation.tribe_id=p_tribe_id
      AND operation.idempotency_key=p_operation_id
      AND (operation.operation_type NOT IN ('issue_contact_challenge','resend_contact_challenge')
        OR operation.verification_purpose='admission');
END;
$$;
REVOKE ALL ON FUNCTION public.read_own_admission_operations(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_own_admission_operations(uuid,text,uuid) TO PUBLIC;
