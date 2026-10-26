-- Messaging owns countries, immutable resource versions and attempt budgets.
CREATE UNIQUE INDEX messaging_challenge_tenant_scope_key ON public.contact_verification_challenges(id,tribe_id);
CREATE FUNCTION public.messaging_country_set_is_normalized(countries text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT countries IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM unnest(countries) country WHERE country IS NULL OR country !~ '^[A-Z]{2}$'
  ) AND cardinality(countries)=(SELECT count(DISTINCT country) FROM unnest(countries) country);
$$;
REVOKE ALL ON FUNCTION public.messaging_country_set_is_normalized(text[]) FROM PUBLIC;

CREATE TABLE public.messaging_usage_policies (
  tribe_id uuid PRIMARY KEY CONSTRAINT messaging_usage_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  verification_daily_limit integer NOT NULL DEFAULT 100 CONSTRAINT messaging_usage_verification_limit_check CHECK(verification_daily_limit BETWEEN 0 AND 1000),
  notification_daily_limit integer NOT NULL DEFAULT 200 CONSTRAINT messaging_usage_notification_limit_check CHECK(notification_daily_limit BETWEEN 0 AND 5000),
  allowed_countries text[] NOT NULL DEFAULT '{}',
  platform_verification_daily_maximum integer NOT NULL DEFAULT 1000 CONSTRAINT messaging_usage_platform_verification_check CHECK(platform_verification_daily_maximum BETWEEN 0 AND 1000),
  platform_notification_daily_maximum integer NOT NULL DEFAULT 5000 CONSTRAINT messaging_usage_platform_notification_check CHECK(platform_notification_daily_maximum BETWEEN 0 AND 5000),
  version integer NOT NULL DEFAULT 1 CONSTRAINT messaging_usage_version_check CHECK(version>0),
  changed_by_user_id text CONSTRAINT messaging_usage_changer_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT messaging_usage_countries_check CHECK(public.messaging_country_set_is_normalized(allowed_countries)),
  CONSTRAINT messaging_usage_platform_ceiling_check CHECK(verification_daily_limit<=platform_verification_daily_maximum AND notification_daily_limit<=platform_notification_daily_maximum)
);

CREATE TABLE public.tenant_messaging_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL CONSTRAINT messaging_connection_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'zavu' CONSTRAINT messaging_connection_provider_check CHECK(provider='zavu'),
  contributed_by_user_id text CONSTRAINT messaging_connection_contributor_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'draft' CONSTRAINT messaging_connection_state_check CHECK(state IN ('draft','ready','active','degraded','suspended','disconnected')),
  state_reason text,
  environment text NOT NULL,
  security_epoch text NOT NULL,
  is_selected boolean NOT NULL DEFAULT false,
  is_candidate boolean NOT NULL DEFAULT true,
  selected_version integer,
  candidate_version integer,
  version integer NOT NULL DEFAULT 1 CONSTRAINT messaging_connection_version_check CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at timestamptz,
  CONSTRAINT messaging_connection_scope_key UNIQUE(id,tribe_id),
  CONSTRAINT messaging_connection_environment_scope_key UNIQUE(id,tribe_id,environment,security_epoch),
  CONSTRAINT messaging_connection_selected_version_check CHECK(selected_version IS NULL OR selected_version>0),
  CONSTRAINT messaging_connection_candidate_version_check CHECK(candidate_version IS NULL OR candidate_version>0)
);
CREATE UNIQUE INDEX messaging_connection_selected_key ON public.tenant_messaging_connections(tribe_id) WHERE is_selected;
CREATE UNIQUE INDEX messaging_connection_candidate_key ON public.tenant_messaging_connections(tribe_id) WHERE is_candidate;

CREATE TABLE public.messaging_connection_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  tribe_id uuid NOT NULL,
  version integer NOT NULL CONSTRAINT messaging_resource_version_check CHECK(version>0),
  environment text NOT NULL,
  security_epoch text NOT NULL,
  secret_ref uuid,
  email_sender_id text,
  sms_sender_id text,
  whatsapp_sender_id text,
  whatsapp_template_id text,
  whatsapp_template_language text,
  credential_validation_status text NOT NULL DEFAULT 'not_validated' CONSTRAINT messaging_credential_validation_check CHECK(credential_validation_status IN ('not_validated','valid','invalid','unavailable')),
  credential_validated_at timestamptz,
  is_test_mode boolean,
  provider_project_ref text,
  provider_team_ref text,
  provider_key_ref text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at timestamptz,
  purge_after timestamptz,
  CONSTRAINT messaging_version_scope_key UNIQUE(connection_id,tribe_id,version),
  CONSTRAINT messaging_version_environment_scope_key UNIQUE(connection_id,tribe_id,version,environment,security_epoch),
  CONSTRAINT messaging_version_connection_fkey FOREIGN KEY(connection_id,tribe_id,environment,security_epoch) REFERENCES public.tenant_messaging_connections(id,tribe_id,environment,security_epoch) ON DELETE CASCADE
);
ALTER TABLE public.tenant_messaging_connections ADD CONSTRAINT messaging_selected_version_fkey FOREIGN KEY(id,tribe_id,selected_version) REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.tenant_messaging_connections ADD CONSTRAINT messaging_candidate_version_fkey FOREIGN KEY(id,tribe_id,candidate_version) REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.messaging_secret_envelopes (
  secret_ref uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  connection_version integer NOT NULL,
  environment text NOT NULL,
  security_epoch text NOT NULL,
  purpose text NOT NULL DEFAULT 'credential' CONSTRAINT messaging_secret_purpose_check CHECK(purpose='credential'),
  format integer NOT NULL DEFAULT 1 CONSTRAINT messaging_secret_format_check CHECK(format=1),
  key_id text NOT NULL,
  iv bytea NOT NULL CONSTRAINT messaging_secret_iv_check CHECK(octet_length(iv)=12),
  ciphertext bytea NOT NULL CONSTRAINT messaging_secret_ciphertext_check CHECK(octet_length(ciphertext)>=16),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at timestamptz,
  purge_after timestamptz,
  CONSTRAINT messaging_secret_scope_key UNIQUE(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch),
  CONSTRAINT messaging_secret_version_fkey FOREIGN KEY(connection_id,tribe_id,connection_version,environment,security_epoch) REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch) ON DELETE CASCADE
);
ALTER TABLE public.messaging_connection_versions ADD CONSTRAINT messaging_version_secret_fkey FOREIGN KEY(secret_ref,tribe_id,connection_id,version,environment,security_epoch) REFERENCES public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.messaging_connection_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  connection_version integer NOT NULL,
  channel text NOT NULL CONSTRAINT messaging_capability_channel_check CHECK(channel IN ('email','sms','whatsapp')),
  sender_id text NOT NULL,
  template_id text,
  template_language text,
  state text NOT NULL DEFAULT 'unprepared' CONSTRAINT messaging_capability_state_check CHECK(state IN ('unprepared','prepared','unavailable')),
  checked_at timestamptz,
  tested_at timestamptz,
  platform_restrictions jsonb NOT NULL DEFAULT '[]',
  CONSTRAINT messaging_capability_scope_key UNIQUE(id,tribe_id,connection_id,connection_version),
  CONSTRAINT messaging_capability_channel_key UNIQUE(connection_id,connection_version,channel),
  CONSTRAINT messaging_capability_version_fkey FOREIGN KEY(connection_id,tribe_id,connection_version) REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version) ON DELETE CASCADE,
  CONSTRAINT messaging_capability_whatsapp_check CHECK(channel<>'whatsapp' OR (template_id IS NOT NULL AND template_language IS NOT NULL)),
  CONSTRAINT messaging_capability_prepared_check CHECK(state<>'prepared' OR (checked_at IS NOT NULL AND tested_at IS NOT NULL))
);

CREATE TABLE public.messaging_connection_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  connection_version integer NOT NULL,
  leader_user_id text CONSTRAINT messaging_diagnostic_leader_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  challenge_id uuid NOT NULL UNIQUE,
  channel text NOT NULL CONSTRAINT messaging_diagnostic_channel_check CHECK(channel IN ('email','sms','whatsapp')),
  sender_id text NOT NULL,
  template_id text,
  template_language text,
  outcome text NOT NULL DEFAULT 'pending' CONSTRAINT messaging_diagnostic_outcome_check CHECK(outcome IN ('pending','verified','failed','expired','invalidated')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  validated_at timestamptz,
  CONSTRAINT messaging_diagnostic_version_fkey FOREIGN KEY(connection_id,tribe_id,connection_version) REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version),
  CONSTRAINT messaging_diagnostic_challenge_fkey FOREIGN KEY(challenge_id,tribe_id,leader_user_id) REFERENCES public.contact_verification_challenges(id,tribe_id,user_id)
);

CREATE TABLE public.messaging_contact_budget_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.messaging_contact_fingerprint_aliases (
  subject_id uuid NOT NULL CONSTRAINT messaging_contact_alias_subject_fkey REFERENCES public.messaging_contact_budget_subjects(id) ON DELETE RESTRICT,
  fingerprint_key_id text NOT NULL,
  contact_fingerprint bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(fingerprint_key_id,contact_fingerprint)
);

CREATE TABLE public.message_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  connection_version integer NOT NULL,
  environment text NOT NULL,
  security_epoch text NOT NULL,
  purpose text NOT NULL CONSTRAINT messaging_delivery_purpose_check CHECK(purpose IN ('admission','connection_diagnostic','admission_notification')),
  source_resource_id uuid NOT NULL,
  actor_user_id text CONSTRAINT messaging_delivery_actor_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  contact_subject_id uuid CONSTRAINT messaging_delivery_subject_fkey REFERENCES public.messaging_contact_budget_subjects(id),
  recipient_ref text NOT NULL,
  recipient_country text,
  channel text NOT NULL CONSTRAINT messaging_delivery_channel_check CHECK(channel IN ('email','sms','whatsapp')),
  idempotency_key uuid NOT NULL,
  payload_fingerprint bytea NOT NULL,
  payload_mac_key_id text NOT NULL,
  frozen_intent jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued' CONSTRAINT messaging_delivery_state_check CHECK(state IN ('queued','accepted','delivered','failed','unknown','suppressed','cancelled')),
  queued_usage_policy_version integer NOT NULL CONSTRAINT messaging_delivery_usage_version_check CHECK(queued_usage_policy_version>0),
  due_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL,
  lease_token uuid,
  lease_until timestamptz,
  version integer NOT NULL DEFAULT 1 CONSTRAINT messaging_delivery_version_check CHECK(version>0),
  last_outcome text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT messaging_delivery_scope_key UNIQUE(id,tribe_id,connection_id,connection_version),
  CONSTRAINT messaging_delivery_logical_key UNIQUE(tribe_id,purpose,source_resource_id,recipient_ref),
  CONSTRAINT messaging_delivery_idempotency_key UNIQUE(connection_id,idempotency_key),
  CONSTRAINT messaging_delivery_version_fkey FOREIGN KEY(connection_id,tribe_id,connection_version,environment,security_epoch) REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch),
  CONSTRAINT messaging_delivery_lease_check CHECK((lease_token IS NULL)=(lease_until IS NULL)),
  CONSTRAINT messaging_delivery_phone_country_check CHECK(channel='email' OR (recipient_country IS NOT NULL AND recipient_country ~ '^[A-Z]{2}$')),
  CONSTRAINT messaging_delivery_deadline_check CHECK(deadline_at>created_at AND deadline_at<=created_at+interval '24 hours')
);
CREATE INDEX messaging_delivery_due_idx ON public.message_deliveries(due_at,id) WHERE state='queued';

CREATE TABLE public.verification_code_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  connection_version integer NOT NULL,
  challenge_id uuid NOT NULL UNIQUE,
  delivery_id uuid NOT NULL UNIQUE,
  environment text NOT NULL,
  security_epoch text NOT NULL,
  purpose text NOT NULL DEFAULT 'otp_envelope' CONSTRAINT messaging_otp_purpose_check CHECK(purpose='otp_envelope'),
  format integer NOT NULL DEFAULT 1 CONSTRAINT messaging_otp_format_check CHECK(format=1),
  key_id text NOT NULL,
  iv bytea NOT NULL CONSTRAINT messaging_otp_iv_check CHECK(octet_length(iv)=12),
  ciphertext bytea NOT NULL CONSTRAINT messaging_otp_ciphertext_check CHECK(octet_length(ciphertext)>=16),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT messaging_otp_scope_key UNIQUE(id,tribe_id,connection_id,connection_version),
  CONSTRAINT messaging_otp_challenge_fkey FOREIGN KEY(challenge_id,tribe_id) REFERENCES public.contact_verification_challenges(id,tribe_id),
  CONSTRAINT messaging_otp_delivery_fkey FOREIGN KEY(delivery_id,tribe_id,connection_id,connection_version) REFERENCES public.message_deliveries(id,tribe_id,connection_id,connection_version) ON DELETE CASCADE,
  CONSTRAINT messaging_otp_version_fkey FOREIGN KEY(connection_id,tribe_id,connection_version,environment,security_epoch) REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch),
  CONSTRAINT messaging_otp_expiry_check CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes')
);

CREATE TABLE public.message_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL,
  tribe_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  connection_version integer NOT NULL,
  sequence integer NOT NULL CONSTRAINT messaging_attempt_sequence_check CHECK(sequence>0),
  reservation_id uuid NOT NULL UNIQUE,
  lease_token uuid NOT NULL,
  send_authorized_at timestamptz NOT NULL,
  authorized_usage_policy_version integer NOT NULL CONSTRAINT messaging_attempt_usage_version_check CHECK(authorized_usage_policy_version>0),
  recipient_country text,
  state text NOT NULL DEFAULT 'in_flight' CONSTRAINT messaging_attempt_state_check CHECK(state IN ('in_flight','accepted','delivered','rejected','unknown')),
  completed_at timestamptz,
  correlation_id text,
  provider_message_id text,
  safe_reason text,
  version integer NOT NULL DEFAULT 1 CONSTRAINT messaging_attempt_version_check CHECK(version>0),
  CONSTRAINT messaging_attempt_scope_key UNIQUE(id,tribe_id,delivery_id),
  CONSTRAINT messaging_attempt_sequence_key UNIQUE(delivery_id,sequence),
  CONSTRAINT messaging_attempt_delivery_fkey FOREIGN KEY(delivery_id,tribe_id,connection_id,connection_version) REFERENCES public.message_deliveries(id,tribe_id,connection_id,connection_version)
);
CREATE UNIQUE INDEX messaging_attempt_unresolved_key ON public.message_delivery_attempts(delivery_id) WHERE state IN ('in_flight','unknown','accepted','delivered');
CREATE UNIQUE INDEX messaging_attempt_provider_message_key ON public.message_delivery_attempts(connection_id,provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE public.messaging_usage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL,
  attempt_id uuid NOT NULL UNIQUE,
  delivery_id uuid NOT NULL,
  category text NOT NULL CONSTRAINT messaging_reservation_category_check CHECK(category IN ('verification','notification')),
  state text NOT NULL DEFAULT 'consumed' CONSTRAINT messaging_reservation_state_check CHECK(state IN ('consumed','released')),
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  released_at timestamptz,
  absence_evidence text,
  CONSTRAINT messaging_reservation_scope_key UNIQUE(id,tribe_id,attempt_id),
  CONSTRAINT messaging_reservation_attempt_fkey FOREIGN KEY(attempt_id,tribe_id,delivery_id) REFERENCES public.message_delivery_attempts(id,tribe_id,delivery_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT messaging_reservation_policy_fkey FOREIGN KEY(tribe_id) REFERENCES public.messaging_usage_policies(tribe_id),
  CONSTRAINT messaging_reservation_release_check CHECK((state='consumed' AND released_at IS NULL AND absence_evidence IS NULL) OR (state='released' AND released_at IS NOT NULL AND absence_evidence IS NOT NULL AND btrim(absence_evidence)<>''))
);
ALTER TABLE public.message_delivery_attempts ADD CONSTRAINT messaging_attempt_reservation_fkey FOREIGN KEY(reservation_id,tribe_id,id) REFERENCES public.messaging_usage_reservations(id,tribe_id,attempt_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX messaging_reservation_consumption_idx ON public.messaging_usage_reservations(tribe_id,category,reserved_at) WHERE state='consumed';

CREATE TABLE public.messaging_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL CONSTRAINT messaging_usage_event_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  actor_user_id text CONSTRAINT messaging_usage_event_actor_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  contact_subject_id uuid CONSTRAINT messaging_usage_event_subject_fkey REFERENCES public.messaging_contact_budget_subjects(id),
  challenge_id uuid,
  purpose text NOT NULL,
  channel text,
  event_type text NOT NULL CONSTRAINT messaging_usage_event_type_check CHECK(event_type IN ('code_request','code_failure','diagnostic_request','credential_validation')),
  operation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT messaging_usage_event_operation_key UNIQUE(event_type,operation_id)
);
CREATE INDEX messaging_usage_account_window_idx ON public.messaging_usage_events(actor_user_id,event_type,occurred_at);
CREATE INDEX messaging_usage_contact_window_idx ON public.messaging_usage_events(contact_subject_id,event_type,occurred_at);
CREATE INDEX messaging_usage_tribe_window_idx ON public.messaging_usage_events(tribe_id,event_type,channel,occurred_at);

-- Cross-owner references are added after both factories' tables exist. These
-- deferred cycles bind each protected envelope to its exact challenge/delivery.
ALTER TABLE public.academy_admission_policies ADD CONSTRAINT admission_policy_messaging_version_fkey
  FOREIGN KEY(messaging_connection_id,tribe_id,messaging_connection_version)
  REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.contact_verification_challenges ADD CONSTRAINT admission_challenge_messaging_version_fkey
  FOREIGN KEY(connection_id,tribe_id,connection_version)
  REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.academy_admission_verification_proofs ADD CONSTRAINT admission_proof_messaging_version_fkey
  FOREIGN KEY(connection_id,tribe_id,connection_version)
  REFERENCES public.messaging_connection_versions(connection_id,tribe_id,version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.contact_verification_challenges ADD CONSTRAINT admission_challenge_delivery_fkey
  FOREIGN KEY(delivery_id,tribe_id,connection_id,connection_version)
  REFERENCES public.message_deliveries(id,tribe_id,connection_id,connection_version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.verification_code_envelopes ADD CONSTRAINT messaging_otp_exact_source_key
  UNIQUE(id,challenge_id,delivery_id,tribe_id,connection_id,connection_version);
ALTER TABLE public.contact_verification_challenges ADD CONSTRAINT admission_challenge_otp_fkey
  FOREIGN KEY(code_envelope_id,id,delivery_id,tribe_id,connection_id,connection_version)
  REFERENCES public.verification_code_envelopes(id,challenge_id,delivery_id,tribe_id,connection_id,connection_version) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.guard_messaging_otp_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE challenge public.contact_verification_challenges%ROWTYPE; delivery public.message_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO challenge FROM public.contact_verification_challenges source WHERE source.id=NEW.challenge_id;
  SELECT * INTO delivery FROM public.message_deliveries source WHERE source.id=NEW.delivery_id;
  IF challenge.id IS NULL OR delivery.id IS NULL THEN RAISE EXCEPTION 'messaging code source is absent' USING ERRCODE='23503'; END IF;
  IF ROW(NEW.tribe_id,NEW.connection_id,NEW.connection_version,NEW.security_epoch,NEW.created_at,NEW.expires_at)
     IS DISTINCT FROM ROW(challenge.tribe_id,challenge.connection_id,challenge.connection_version,challenge.security_epoch,challenge.created_at,challenge.expires_at)
     OR ROW(delivery.tribe_id,delivery.connection_id,delivery.connection_version,delivery.security_epoch,delivery.environment,delivery.purpose,delivery.channel)
     IS DISTINCT FROM ROW(challenge.tribe_id,challenge.connection_id,challenge.connection_version,challenge.security_epoch,NEW.environment,challenge.purpose,challenge.channel)
     OR challenge.delivery_id<>NEW.delivery_id OR challenge.code_envelope_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'messaging code scope and source window are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_messaging_otp_origin() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER messaging_otp_origin_guard AFTER INSERT OR UPDATE ON public.verification_code_envelopes
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_otp_origin();

CREATE FUNCTION public.guard_messaging_version_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.connection_id,NEW.tribe_id,NEW.version,NEW.environment,NEW.security_epoch,NEW.secret_ref,NEW.email_sender_id,NEW.sms_sender_id,NEW.whatsapp_sender_id,NEW.whatsapp_template_id,NEW.whatsapp_template_language,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.connection_id,OLD.tribe_id,OLD.version,OLD.environment,OLD.security_epoch,OLD.secret_ref,OLD.email_sender_id,OLD.sms_sender_id,OLD.whatsapp_sender_id,OLD.whatsapp_template_id,OLD.whatsapp_template_language,OLD.created_at) THEN
    RAISE EXCEPTION 'messaging configuration version is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
    RAISE EXCEPTION 'messaging configuration retirement is irreversible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_messaging_version_identity() FROM PUBLIC;
CREATE TRIGGER messaging_version_identity_guard BEFORE UPDATE ON public.messaging_connection_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_version_identity();

CREATE FUNCTION public.guard_messaging_delivery_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.connection_id,NEW.connection_version,NEW.environment,NEW.security_epoch,NEW.purpose,NEW.source_resource_id,NEW.contact_subject_id,NEW.recipient_ref,NEW.recipient_country,NEW.channel,NEW.idempotency_key,NEW.payload_fingerprint,NEW.payload_mac_key_id,NEW.frozen_intent,NEW.queued_usage_policy_version,NEW.created_at,NEW.deadline_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.connection_id,OLD.connection_version,OLD.environment,OLD.security_epoch,OLD.purpose,OLD.source_resource_id,OLD.contact_subject_id,OLD.recipient_ref,OLD.recipient_country,OLD.channel,OLD.idempotency_key,OLD.payload_fingerprint,OLD.payload_mac_key_id,OLD.frozen_intent,OLD.queued_usage_policy_version,OLD.created_at,OLD.deadline_at) THEN
    RAISE EXCEPTION 'messaging delivery intent is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_messaging_delivery_identity() FROM PUBLIC;
CREATE TRIGGER messaging_delivery_identity_guard BEFORE UPDATE ON public.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_delivery_identity();

CREATE FUNCTION public.guard_messaging_usage_policy_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_countries text[]; next_countries text[];
BEGIN
  SELECT coalesce(array_agg(country ORDER BY country),'{}') INTO previous_countries FROM unnest(OLD.allowed_countries) country;
  SELECT coalesce(array_agg(country ORDER BY country),'{}') INTO next_countries FROM unnest(NEW.allowed_countries) country;
  IF NEW.tribe_id IS DISTINCT FROM OLD.tribe_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'messaging usage policy identity is immutable' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.verification_daily_limit,NEW.notification_daily_limit,NEW.platform_verification_daily_maximum,NEW.platform_notification_daily_maximum,next_countries)
     IS DISTINCT FROM ROW(OLD.verification_daily_limit,OLD.notification_daily_limit,OLD.platform_verification_daily_maximum,OLD.platform_notification_daily_maximum,previous_countries) THEN
    IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'messaging usage effective change requires one version increment' USING ERRCODE='23514'; END IF;
  ELSIF NEW.version<>OLD.version THEN
    RAISE EXCEPTION 'messaging usage no-op cannot increment version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_messaging_usage_policy_version() FROM PUBLIC;
CREATE TRIGGER messaging_usage_policy_version_guard BEFORE UPDATE ON public.messaging_usage_policies FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_usage_policy_version();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'messaging_usage_policies','tenant_messaging_connections','messaging_connection_versions',
    'messaging_secret_envelopes','messaging_connection_capabilities','messaging_connection_diagnostics',
    'messaging_contact_budget_subjects','messaging_contact_fingerprint_aliases','message_deliveries',
    'verification_code_envelopes','message_delivery_attempts','messaging_usage_reservations','messaging_usage_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',table_name);
    EXECUTE format('CREATE POLICY messaging_owner_writer ON public.%I FOR ALL USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=%L::regclass)) WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=%L::regclass))',table_name,'public.'||table_name,'public.'||table_name);
  END LOOP;
END;
$$;
-- Current leader metadata projections and protected writer functions are wired
-- by the subsequent owner integration; secrets never get ordinary read grants.
