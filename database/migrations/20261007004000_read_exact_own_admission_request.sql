-- Read an explicit own history item without substituting a newer request or granting membership.
CREATE FUNCTION public.read_own_admission_request_summary(p_tribe_id uuid,p_session_id text,p_request_id uuid)
RETURNS TABLE (
  id uuid,status text,version integer,submitted_at timestamptz,expires_at timestamptz,
  source text,contact_type text,normalized_contact text,evidence_source text,
  retry_allowed_at timestamptz,external_message text,decided_at timestamptz,
  requires_additional_verification boolean,verification_epoch integer,
  proof_status text,proof_verification_epoch integer,applied_request_id uuid
)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT request.id,request.status,request.version,request.submitted_at,request.expires_at,
    request.source,request.contact_type,request.normalized_contact,request.evidence_source,
    request.retry_allowed_at,decision.external_message,decision.decided_at,
    policy.requires_additional_verification,policy.verification_epoch,
    proof.status,proof.verification_epoch,proof.applied_request_id
  FROM public.academy_admission_requests request
  LEFT JOIN public.academy_admission_decisions decision
    ON decision.id=request.decision_id AND decision.tribe_id=request.tribe_id AND decision.user_id=request.user_id
  LEFT JOIN public.academy_admission_policies policy ON policy.tribe_id=request.tribe_id
  LEFT JOIN public.academy_admission_verification_proofs proof
    ON proof.id=request.proof_id AND proof.tribe_id=request.tribe_id AND proof.user_id=request.user_id
  WHERE request.tribe_id=p_tribe_id AND request.id=p_request_id
    AND request.user_id=public.current_app_user_id()
    AND EXISTS(SELECT 1 FROM public.session session WHERE session.id=p_session_id
      AND session."userId"=request.user_id AND session."expiresAt">clock_timestamp());
$$;
REVOKE ALL ON FUNCTION public.read_own_admission_request_summary(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_own_admission_request_summary(uuid,text,uuid) TO PUBLIC;
