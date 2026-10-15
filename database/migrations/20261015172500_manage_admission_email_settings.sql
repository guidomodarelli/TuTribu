-- Independent notification email epochs. No OTP policy or messaging selection is changed.
ALTER TABLE public.admission_email_settings
  ADD COLUMN time_zone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';
ALTER TABLE public.admission_email_settings FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_admission_email_settings_version()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.time_zone) THEN
    RAISE EXCEPTION 'admission email time zone is unavailable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 THEN RAISE EXCEPTION 'admission email settings must start at version one' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.tribe_id IS DISTINCT FROM OLD.tribe_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'admission email settings identity is immutable' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.enabled,NEW.time_zone) IS DISTINCT FROM ROW(OLD.enabled,OLD.time_zone) THEN
    IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'admission email change requires one version increment' USING ERRCODE='23514'; END IF;
    NEW.enabled_at=CASE WHEN NEW.enabled THEN clock_timestamp() ELSE NULL END;
    NEW.updated_at=clock_timestamp();
  ELSIF ROW(NEW.version,NEW.enabled_at,NEW.updated_at) IS DISTINCT FROM ROW(OLD.version,OLD.enabled_at,OLD.updated_at) THEN
    RAISE EXCEPTION 'admission email no-op cannot change its epoch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_email_settings_version() FROM PUBLIC;
DROP TRIGGER admission_email_settings_version_guard ON public.admission_email_settings;
CREATE TRIGGER admission_email_settings_version_guard BEFORE INSERT OR UPDATE ON public.admission_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_email_settings_version();

CREATE UNIQUE INDEX admission_email_settings_audit_fact_key ON public.academy_admission_audit_events(tribe_id,resource_version)
  WHERE resource_type='admission_email_settings' AND event_type='admission_email_settings_changed';

-- Retain only the new owner's fixed safe metadata after physical tribe deletion.
CREATE OR REPLACE FUNCTION public.project_retired_admission_owner_metadata(requested_resource text,requested_event text,source_metadata jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(field.name,CASE WHEN requested_resource='admission_policy' AND field.name IN ('fromPolicy','toPolicy')
    THEN public.project_retired_admission_policy_snapshot(source_metadata->field.name) ELSE source_metadata->field.name END),'{}'::jsonb)
  FROM unnest(CASE
    WHEN requested_resource='admission_email_settings' AND requested_event='admission_email_settings_changed' THEN ARRAY['previousVersion','enabled','timeZone']::text[]
    WHEN requested_resource='admission_policy' AND requested_event IN ('initialize_admission_policy','update_admission_policy','activate_admission_policy','pause_admission_policy') THEN ARRAY['previousVersion','fromPolicy','toPolicy']::text[]
    WHEN requested_resource='admission_policy' AND requested_event='messaging_selection_replaced' THEN ARRAY['previousVersion','previousConnectionId','previousConnectionVersion','connectionId','connectionVersion','verificationEpoch']::text[]
    WHEN requested_resource='message_delivery' AND requested_event='notification_delivery_recovered' THEN ARRAY['originalDeliveryId','targetConnectionId','originalConnectionId','originalConnectionVersion','originalFromState','originalToState','previousOriginalVersion','originalVersion','originalAttemptId','originalAuthorizedUsagePolicyVersion']::text[]
    WHEN requested_resource='admission_request' THEN ARRAY['fromStatus','toStatus','previousVersion','previousRequestVersion','policyVersion','verificationEpoch','proofId','decisionId','invitationId','previousRetryAllowedAt','retryAllowedAt']::text[]
    WHEN requested_resource='allowlist_entry' THEN ARRAY['fromStatus','toStatus','previousVersion','importId','contactType']::text[]
    WHEN requested_resource='personal_invitation' THEN ARRAY['fromStatus','toStatus','previousVersion','requestId','fromAuthorizationRevoked','toAuthorizationRevoked']::text[]
    WHEN requested_resource='messaging_usage_policy' THEN ARRAY['previousVersion','allowedCountries','verificationDailyLimit','notificationDailyLimit']::text[]
    WHEN requested_resource='messaging_connection' THEN ARRAY['fromState','toState','previousVersion','configurationVersion','previousConfigurationVersion','channel','previousCredentialState','credentialState','credentialMode']::text[]
    WHEN requested_resource='authorized_exposure' THEN ARRAY['surface','itemCount','resourceKind']::text[]
    WHEN requested_resource='messaging_protection' THEN ARRAY['purpose','previousKeyId','activeKeyId','securityEpoch']::text[]
    WHEN requested_resource='membership' THEN ARRAY['membershipInstanceId','fromRole','toRole','fromStatus','toStatus','requestId','decisionId']::text[]
    WHEN requested_resource='admission_proof' THEN ARRAY['fromState','toState','challengeId','requestId','verificationEpoch','channel']::text[]
    ELSE ARRAY[]::text[] END) AS field(name)
  WHERE source_metadata ? field.name;
$$;
REVOKE ALL ON FUNCTION public.project_retired_admission_owner_metadata(text,text,jsonb) FROM PUBLIC;
