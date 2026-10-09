-- Review uses the original captured account when base provenance exists.
-- Invalidated captures cannot be silently replaced by another login/account.
CREATE OR REPLACE FUNCTION public.read_admission_reviews(
  p_tribe_id uuid,p_session_id text,p_request_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 25,p_status text DEFAULT NULL,p_source text DEFAULT NULL,
  p_after_time timestamptz DEFAULT NULL,p_after_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_submitted_from timestamptz DEFAULT NULL,p_submitted_until timestamptz DEFAULT NULL
) RETURNS TABLE(record jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  actor_id text := public.current_app_user_id();
  reviewer_role text;
  reviewer_status text;
BEGIN
  IF actor_id IS NULL OR p_limit NOT BETWEEN 1 AND 51 THEN RETURN; END IF;
  PERFORM tribe.id FROM public.tribes tribe WHERE tribe.id=p_tribe_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM session.id FROM public.session session
    WHERE session.id=p_session_id AND session."userId"=actor_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT member.role,member.status INTO reviewer_role,reviewer_status
    FROM public.tribe_members member WHERE member.tribe_id=p_tribe_id AND member.user_id=actor_id FOR SHARE;
  IF reviewer_role IS NULL OR reviewer_role NOT IN ('leader','guardian') OR reviewer_status<>'active'
    OR NOT EXISTS(SELECT 1 FROM public.session session WHERE session.id=p_session_id
      AND session."userId"=actor_id AND session."expiresAt">clock_timestamp()) THEN RETURN; END IF;
  RETURN QUERY SELECT jsonb_build_object(
    'request',jsonb_build_object('id',request.id,'tribeId',request.tribe_id,'userId',request.user_id,
      'source',request.source,'invitationId',request.invitation_id,'legacyInvitationId',request.legacy_invitation_id,
      'requiresAllowlist',request.requires_allowlist,'contactType',request.contact_type,'contactValue',request.normalized_contact,
      'evidenceKind',request.evidence_source,'identityEvidenceId',request.global_identity_evidence_id,
      'proofId',request.proof_id,'bindingId',request.binding_id,'originalPolicy',request.original_policy_snapshot,
      'applicantMessage',request.applicant_message,'status',request.status,'submittedAt',request.submitted_at,
      'expiresAt',request.expires_at,'version',request.version,'decisionId',request.decision_id,
      'cancelReason',request.cancel_reason,'retryAllowedAt',request.retry_allowed_at,'resolvedAt',decision.decided_at,
      'evidenceVerifiedAt',CASE WHEN request.evidence_source='base' THEN evidence.verified_at ELSE proof.verified_at END),
    'applicantName',applicant.name,'applicantEmail',applicant.email,
    'googleAccount',CASE WHEN account.id IS NULL THEN NULL ELSE jsonb_build_object('id',account.id,'subject',account."accountId") END,
    'baseEvidence',CASE WHEN current_evidence.id IS NULL THEN NULL ELSE jsonb_build_object('userId',current_evidence.user_id,
      'accountId',current_evidence.account_id,'subject',current_evidence.provider_subject,'normalizedEmail',current_evidence.normalized_email,
      'authority',current_evidence.classification,'invalidated',current_evidence.invalidated_at IS NOT NULL) END,
    'reviewer',jsonb_build_object('userId',actor_id,'tribeId',p_tribe_id,'role',reviewer_role,'status',reviewer_status),
    'tribe',jsonb_build_object('id',p_tribe_id,'isAcademy',settings.access_model='academy',
      'controlActivated',tribe.admissions_control_activated_at IS NOT NULL,'evaluatorEnabled',settings.admission_enabled),
    'policy',CASE WHEN policy.tribe_id IS NULL THEN NULL ELSE jsonb_build_object('id',policy.tribe_id,'tribeId',policy.tribe_id,
      'mode',policy.mode,'contactType',policy.contact_type,'isOpen',policy.is_open,'allowCommonExceptions',policy.allow_common_exceptions,
      'requiresAdditionalVerification',policy.requires_additional_verification,'phoneChannel',policy.phone_channel,
      'allowSmsAlternative',policy.allow_sms_alternative,'messagingConnectionId',policy.messaging_connection_id,
      'messagingConnectionVersion',policy.messaging_connection_version,'verificationEpoch',policy.verification_epoch,
      'version',policy.version,'activatedAt',policy.activated_at) END,
    'membership',CASE WHEN membership.user_id IS NULL THEN NULL ELSE jsonb_build_object('tribeId',membership.tribe_id,
      'userId',membership.user_id,'role',membership.role,'status',membership.status,'statusReason',membership.status_reason,
      'commercialRecoveryStatus',membership.commercial_recovery_status) END,
    'invitation',CASE WHEN invitation.id IS NULL THEN NULL ELSE jsonb_build_object('tribeId',invitation.tribe_id,
      'contactType',invitation.contact_type,'contactValue',invitation.normalized_contact,'requiresAllowlist',invitation.requires_allowlist,
      'status',invitation.status,'authorizationRevoked',invitation.authorization_revoked_at IS NOT NULL,'expiresAt',invitation.expires_at) END,
    'proof',CASE WHEN proof.id IS NULL THEN NULL ELSE jsonb_build_object('id',proof.id,'userId',proof.user_id,'tribeId',proof.tribe_id,
      'contactType',proof.contact_type,'contactValue',proof.normalized_contact,'appliedRequestId',proof.applied_request_id,
      'verificationEpoch',proof.verification_epoch,'connectionId',proof.connection_id,'connectionVersion',proof.connection_version,
      'securityEpoch',proof.security_epoch,'status',proof.status,'verifiedAt',proof.verified_at,'applyBefore',proof.apply_before) END,
    'connection',CASE WHEN connection.id IS NULL THEN NULL ELSE jsonb_build_object('id',connection.id,
      'version',connection.selected_version,'securityEpoch',connection.security_epoch) END,
    'allowlistEntry',CASE WHEN entry.id IS NULL THEN NULL ELSE jsonb_build_object('tribeId',entry.tribe_id,
      'contactType',entry.contact_type,'contactValue',entry.normalized_contact,'enabled',entry.status='enabled','boundUserId',binding.owner_user_id) END,
    'contactBinding',CASE WHEN binding.id IS NULL THEN NULL ELSE jsonb_build_object('ownerUserId',binding.owner_user_id,
      'contactType',binding.contact_type,'contactValue',binding.normalized_contact) END,
    'internalReason',decision.internal_reason,'externalMessage',decision.external_message
  )
  FROM public.academy_admission_requests request
  JOIN public.tribes tribe ON tribe.id=request.tribe_id
  JOIN public."user" applicant ON applicant.id=request.user_id
  LEFT JOIN public.tribe_academy_settings settings ON settings.tribe_id=request.tribe_id
  LEFT JOIN public.academy_admission_policies policy ON policy.tribe_id=request.tribe_id
  LEFT JOIN public.tribe_members membership ON membership.tribe_id=request.tribe_id AND membership.user_id=request.user_id
  LEFT JOIN public.academy_admission_decisions decision ON decision.id=request.decision_id AND decision.request_id=request.id
  LEFT JOIN public.global_identity_evidence evidence ON evidence.id=request.global_identity_evidence_id AND evidence.user_id=request.user_id
  LEFT JOIN LATERAL (SELECT linked.id,linked."accountId" FROM public.account linked
    WHERE linked."userId"=request.user_id AND linked."providerId"='google'
      AND (
        (request.evidence_source='base' AND linked.id=evidence.account_id AND linked."accountId"=evidence.provider_subject
          AND evidence.invalidated_at IS NULL AND evidence.normalized_email=lower(btrim(applicant.email)))
        OR (request.evidence_source<>'base' AND (SELECT count(*) FROM public.account candidate
          WHERE candidate."userId"=request.user_id AND candidate."providerId"='google')=1)
      )
    ORDER BY linked.id LIMIT 1) account ON true
  LEFT JOIN public.global_identity_evidence current_evidence ON current_evidence.account_id=account.id
    AND current_evidence.user_id=request.user_id AND current_evidence.provider_subject=account."accountId"
    AND current_evidence.provider_id='google' AND current_evidence.invalidated_at IS NULL
  LEFT JOIN public.academy_admission_verification_proofs proof ON proof.id=request.proof_id AND proof.tribe_id=request.tribe_id AND proof.user_id=request.user_id
  LEFT JOIN public.academy_personal_invitations invitation ON invitation.id=request.invitation_id AND invitation.tribe_id=request.tribe_id
  LEFT JOIN public.tenant_messaging_connections connection ON connection.tribe_id=request.tribe_id AND connection.is_selected
    AND connection.selected_version IS NOT NULL AND connection.retired_at IS NULL
  LEFT JOIN public.academy_allowlist_entries entry ON entry.tribe_id=request.tribe_id
    AND entry.contact_type=request.contact_type AND entry.normalized_contact=request.normalized_contact
  LEFT JOIN public.academy_admission_contact_bindings binding ON binding.tribe_id=request.tribe_id
    AND binding.contact_type=request.contact_type AND binding.normalized_contact=request.normalized_contact
  WHERE request.tribe_id=p_tribe_id AND (p_request_id IS NULL OR request.id=p_request_id)
    AND (p_status IS NULL OR request.status=p_status) AND (p_source IS NULL OR request.source=p_source)
    AND (p_after_time IS NULL OR (request.submitted_at,request.id)>(p_after_time,p_after_id))
    AND (p_search IS NULL OR position(lower(p_search) IN lower(applicant.name))>0
      OR position(lower(p_search) IN lower(coalesce(request.normalized_contact,'')))>0)
    AND (p_submitted_from IS NULL OR request.submitted_at>=p_submitted_from)
    AND (p_submitted_until IS NULL OR request.submitted_at<=p_submitted_until)
  ORDER BY request.submitted_at,request.id LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.read_admission_reviews(uuid,text,uuid,integer,text,text,timestamptz,uuid,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_admission_reviews(uuid,text,uuid,integer,text,text,timestamptz,uuid,text,timestamptz,timestamptz) TO PUBLIC;
