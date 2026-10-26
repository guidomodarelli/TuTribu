-- Group transport only: authorization, eligibility, external configuration and
-- the final clock remain with the existing request owner. VOLATILE preserves a
-- fresh READ COMMITTED snapshot for every query after the preceding lock waits.
CREATE FUNCTION public.read_locked_admission_facts(requested_tribe_id uuid,requested_applicant_id text)
RETURNS TABLE(tribe jsonb,policy jsonb,membership jsonb,account jsonb)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE
  tribe_facts jsonb;
  policy_facts jsonb;
  membership_facts jsonb;
  account_facts jsonb;
BEGIN
  SELECT jsonb_build_object(
    'activatedAt',tribe_row.admissions_control_activated_at,
    'accessModel',settings_row.access_model,
    'admissionEnabled',settings_row.admission_enabled
  ) INTO tribe_facts
  FROM public.tribes tribe_row
  JOIN public.tribe_academy_settings settings_row ON settings_row.tribe_id=tribe_row.id
  WHERE tribe_row.id=requested_tribe_id
  FOR SHARE OF settings_row;

  SELECT jsonb_build_object(
    'id',policy_row.tribe_id,'tribeId',policy_row.tribe_id,
    'mode',policy_row.mode,'contactType',policy_row.contact_type,
    'isOpen',policy_row.is_open,'allowCommonExceptions',policy_row.allow_common_exceptions,
    'requiresAdditionalVerification',policy_row.requires_additional_verification,
    'requiresWhatsappNumber',policy_row.requires_whatsapp_number,
    'phoneChannel',policy_row.phone_channel,'allowSmsAlternative',policy_row.allow_sms_alternative,
    'messagingConnectionId',policy_row.messaging_connection_id,
    'messagingConnectionVersion',policy_row.messaging_connection_version,
    'verificationEpoch',policy_row.verification_epoch,'version',policy_row.version,
    'activatedAt',policy_row.activated_at
  ) INTO policy_facts
  FROM public.academy_admission_policies policy_row
  WHERE policy_row.tribe_id=requested_tribe_id
  FOR SHARE;

  SELECT jsonb_build_object(
    'tribeId',membership_row.tribe_id,'userId',membership_row.user_id,
    'role',membership_row.role,'status',membership_row.status,
    'statusReason',membership_row.status_reason,
    'commercialRecoveryStatus',membership_row.commercial_recovery_status
  ) INTO membership_facts
  FROM public.tribe_members membership_row
  WHERE membership_row.tribe_id=requested_tribe_id AND membership_row.user_id=requested_applicant_id
  FOR SHARE;

  SELECT jsonb_build_object('email',account_row.email) INTO account_facts
  FROM public."user" account_row
  WHERE account_row.id=requested_applicant_id
  FOR SHARE;

  RETURN QUERY SELECT tribe_facts,policy_facts,membership_facts,account_facts;
END;
$function$;

REVOKE ALL ON FUNCTION public.read_locked_admission_facts(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_locked_admission_facts(uuid,text) TO PUBLIC;
