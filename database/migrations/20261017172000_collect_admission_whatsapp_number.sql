-- Declared group data remains independent of contact evidence and messaging readiness.
ALTER TABLE public.academy_admission_policies ADD COLUMN requires_whatsapp_number boolean NOT NULL DEFAULT false;
ALTER TABLE public.academy_admission_requests ADD COLUMN whatsapp_number text,
  ADD CONSTRAINT admission_request_whatsapp_number_check CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^\+[1-9][0-9]{1,14}$');

DROP TRIGGER admission_policy_version_guard ON public.academy_admission_policies;
CREATE TRIGGER admission_policy_version_guard BEFORE UPDATE ON public.academy_admission_policies FOR EACH ROW EXECUTE FUNCTION public.guard_admission_resource_version('mode','contact_type','is_open','allow_common_exceptions','requires_additional_verification','requires_whatsapp_number','phone_channel','allow_sms_alternative','messaging_connection_id','messaging_connection_version','verification_epoch','activated_at');
DROP TRIGGER admission_request_version_guard ON public.academy_admission_requests;
CREATE TRIGGER admission_request_version_guard BEFORE UPDATE ON public.academy_admission_requests FOR EACH ROW EXECUTE FUNCTION public.guard_admission_resource_version('contact_type','normalized_contact','whatsapp_number','evidence_source','global_identity_evidence_id','proof_id','binding_id','status','decision_id','cancel_reason','retry_allowed_at');

-- Finalized private data can only be destroyed by the existing age/principal guard.
CREATE FUNCTION public.guard_admission_declared_whatsapp() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number THEN
    IF OLD.private_material_minimized_at IS NULL AND NEW.private_material_minimized_at IS NOT NULL AND NEW.whatsapp_number IS NULL THEN RETURN NEW; END IF;
    IF OLD.status<>'pending' OR NEW.status<>'pending' OR OLD.private_material_minimized_at IS NOT NULL THEN
      RAISE EXCEPTION 'admission declared number can change only on a pending request' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_declared_whatsapp() FROM PUBLIC;
CREATE TRIGGER admission_request_declared_whatsapp_guard BEFORE UPDATE ON public.academy_admission_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_declared_whatsapp();
ALTER TABLE public.academy_admission_requests DROP CONSTRAINT admission_request_private_minimization_check,
  ADD CONSTRAINT admission_request_private_minimization_check CHECK (
    private_material_minimized_at IS NULL OR (
      status<>'pending' AND private_material_minimized_at>=submitted_at
      AND contact_type IS NULL AND normalized_contact IS NULL AND whatsapp_number IS NULL
      AND contact_fingerprint IS NULL AND fingerprint_key_id IS NULL AND applicant_message IS NULL
    )
  );

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
      'whatsappNumber',request.whatsapp_number,'applicantMessage',request.applicant_message,'status',request.status,'submittedAt',request.submitted_at,
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
      'requiresWhatsappNumber',policy.requires_whatsapp_number,'requiresAdditionalVerification',policy.requires_additional_verification,'phoneChannel',policy.phone_channel,
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

-- Own eligibility reads current server facts without creating reviewer authority.
-- Scope and native session are mandatory; this helper returns no internal review note.
CREATE OR REPLACE FUNCTION public.read_own_admission_request_eligibility(p_tribe_id uuid,p_session_id text,p_request_id uuid)
RETURNS TABLE(record jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object(
    'request',jsonb_build_object('id',request.id,'tribeId',request.tribe_id,'userId',request.user_id,
      'source',request.source,'invitationId',request.invitation_id,'legacyInvitationId',request.legacy_invitation_id,
      'requiresAllowlist',request.requires_allowlist,'contactType',request.contact_type,'contactValue',request.normalized_contact,
      'evidenceKind',request.evidence_source,'identityEvidenceId',request.global_identity_evidence_id,
      'proofId',request.proof_id,'bindingId',request.binding_id,'originalPolicy',request.original_policy_snapshot,
      'whatsappNumber',request.whatsapp_number,'applicantMessage',request.applicant_message,'status',request.status,'submittedAt',request.submitted_at,
      'expiresAt',request.expires_at,'version',request.version,'decisionId',request.decision_id,
      'cancelReason',request.cancel_reason,'retryAllowedAt',request.retry_allowed_at,'resolvedAt',decision.decided_at,
      'evidenceVerifiedAt',CASE WHEN request.evidence_source='base' THEN evidence.verified_at ELSE proof.verified_at END),
    'applicantName',applicant.name,'applicantEmail',applicant.email,
    'googleAccount',CASE WHEN account.id IS NULL THEN NULL ELSE jsonb_build_object('id',account.id,'subject',account."accountId") END,
    'baseEvidence',CASE WHEN current_evidence.id IS NULL THEN NULL ELSE jsonb_build_object('userId',current_evidence.user_id,
      'accountId',current_evidence.account_id,'subject',current_evidence.provider_subject,'normalizedEmail',current_evidence.normalized_email,
      'authority',current_evidence.classification,'invalidated',current_evidence.invalidated_at IS NOT NULL) END,
    'reviewer',NULL,
    'tribe',jsonb_build_object('id',p_tribe_id,'isAcademy',settings.access_model='academy',
      'controlActivated',tribe.admissions_control_activated_at IS NOT NULL,'evaluatorEnabled',settings.admission_enabled),
    'policy',CASE WHEN policy.tribe_id IS NULL THEN NULL ELSE jsonb_build_object('id',policy.tribe_id,'tribeId',policy.tribe_id,
      'mode',policy.mode,'contactType',policy.contact_type,'isOpen',policy.is_open,'allowCommonExceptions',policy.allow_common_exceptions,
      'requiresWhatsappNumber',policy.requires_whatsapp_number,'requiresAdditionalVerification',policy.requires_additional_verification,'phoneChannel',policy.phone_channel,
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
    'internalReason',NULL,'externalMessage',NULL
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

  WHERE request.tribe_id=p_tribe_id AND request.id=p_request_id
    AND request.user_id=public.current_app_user_id()
    AND EXISTS(SELECT 1 FROM public.session session WHERE session.id=p_session_id
      AND session."userId"=request.user_id AND session."expiresAt">clock_timestamp());
$$;
REVOKE ALL ON FUNCTION public.read_own_admission_request_eligibility(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_own_admission_request_eligibility(uuid,text,uuid) TO PUBLIC;

-- The public shape adds only the tribe requirement, never an applicant number.
DROP FUNCTION public.read_public_admission_overview(text);
-- Public admission setup excludes list membership, exception flags, invitation recipients and secrets.
CREATE FUNCTION public.read_public_admission_overview(p_slug text)
RETURNS TABLE (
  tribe_id uuid,slug text,name text,control_activated boolean,evaluator_enabled boolean,
  mode text,contact_type text,requires_additional_verification boolean,is_open boolean,policy_version integer,requires_whatsapp_number boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT tribe.id,tribe.slug,tribe.name,tribe.admissions_control_activated_at IS NOT NULL,
    coalesce(settings.admission_enabled AND settings.access_model='academy',false),policy.mode,policy.contact_type,policy.requires_additional_verification,
    policy.is_open,policy.version,policy.requires_whatsapp_number
  FROM public.tribes tribe
  LEFT JOIN public.tribe_academy_settings settings ON settings.tribe_id=tribe.id
  LEFT JOIN public.academy_admission_policies policy ON policy.tribe_id=tribe.id
  WHERE tribe.slug=p_slug AND (settings.access_model='academy' OR tribe.admissions_control_activated_at IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.read_public_admission_overview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_public_admission_overview(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.minimize_terminal_admission_requests(requested_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE candidate record; request_record public.academy_admission_requests%ROWTYPE;
  decision_record public.academy_admission_decisions%ROWTYPE; scope record;
  processed integer=0; processed_by_tribe jsonb='{}'::jsonb; run_id uuid=gen_random_uuid();
  observed_at timestamptz=clock_timestamp(); cutoff_at timestamptz; has_remaining boolean;
BEGIN
  IF public.current_app_user_id() IS NOT NULL THEN RAISE EXCEPTION 'admission retention requires a backend maintenance context' USING ERRCODE='42501'; END IF;
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>500 THEN RAISE EXCEPTION 'admission request retention batch is invalid' USING ERRCODE='23514'; END IF;
  cutoff_at=public.admission_terminal_private_material_cutoff(observed_at);
  FOR candidate IN SELECT request.id,request.tribe_id FROM public.academy_admission_decisions decision
    JOIN public.academy_admission_requests request ON request.decision_id=decision.id AND request.id=decision.request_id AND request.tribe_id=decision.tribe_id
    WHERE request.status<>'pending' AND request.private_material_minimized_at IS NULL AND decision.decided_at<=cutoff_at
    ORDER BY decision.decided_at,request.id LIMIT requested_limit FOR UPDATE OF request SKIP LOCKED
  LOOP
    -- Never wait backwards on a deleting tribe after retaining one of its children.
    BEGIN
      PERFORM id FROM public.tribes WHERE id=candidate.tribe_id FOR SHARE NOWAIT;
      IF NOT FOUND THEN CONTINUE; END IF;
    EXCEPTION WHEN lock_not_available THEN CONTINUE;
    END;
    SELECT * INTO request_record FROM public.academy_admission_requests WHERE id=candidate.id AND tribe_id=candidate.tribe_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR request_record.status='pending' OR request_record.private_material_minimized_at IS NOT NULL THEN CONTINUE; END IF;
    SELECT * INTO decision_record FROM public.academy_admission_decisions
      WHERE id=request_record.decision_id AND request_id=request_record.id AND tribe_id=request_record.tribe_id AND user_id=request_record.user_id AND outcome=request_record.status FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    observed_at=clock_timestamp();
    IF decision_record.decided_at>public.admission_terminal_private_material_cutoff(observed_at) THEN CONTINUE; END IF;
    UPDATE public.academy_admission_requests SET contact_type=NULL,normalized_contact=NULL,contact_fingerprint=NULL,fingerprint_key_id=NULL,
      applicant_message=NULL,whatsapp_number=NULL,private_material_minimized_at=observed_at WHERE id=request_record.id AND version=request_record.version;
    UPDATE public.academy_admission_decisions SET internal_reason=NULL,external_message=NULL WHERE id=decision_record.id;
    processed=processed+1;
    processed_by_tribe=jsonb_set(processed_by_tribe,ARRAY[request_record.tribe_id::text],to_jsonb(coalesce((processed_by_tribe->>request_record.tribe_id::text)::integer,0)+1));
  END LOOP;
  observed_at=clock_timestamp(); cutoff_at=public.admission_terminal_private_material_cutoff(observed_at);
  FOR scope IN SELECT key::uuid AS tribe_id,value::integer AS processed FROM jsonb_each_text(processed_by_tribe)
  LOOP
    SELECT EXISTS (SELECT 1 FROM public.academy_admission_requests request JOIN public.academy_admission_decisions decision ON decision.id=request.decision_id
      WHERE request.tribe_id=scope.tribe_id AND request.status<>'pending' AND request.private_material_minimized_at IS NULL AND decision.decided_at<=cutoff_at) INTO has_remaining;
    INSERT INTO public.academy_admission_audit_events(tribe_id,resource_type,resource_id,event_type,rule,metadata,created_at)
      VALUES(scope.tribe_id,'retention_run',run_id,'retention_completed','minimize_terminal_admission_requests',
        jsonb_build_object('owner','admission_requests','processed',scope.processed,'remaining',has_remaining,'cutoff',to_char(cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),observed_at);
  END LOOP;
  RETURN processed;
END;
$$;
REVOKE ALL ON FUNCTION public.minimize_terminal_admission_requests(integer) FROM PUBLIC;
