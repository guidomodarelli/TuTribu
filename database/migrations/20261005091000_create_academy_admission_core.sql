-- Admission storage is independent of membership and commercial product grants.
-- Requests remain pre-membership records. Application writers own eligibility.
CREATE UNIQUE INDEX global_identity_evidence_user_key ON public.global_identity_evidence(id,user_id);
CREATE UNIQUE INDEX admission_legacy_invitation_scope_key ON public.tribe_invitations(id,tribe_id);
CREATE TABLE public.academy_admission_policies (
  tribe_id uuid PRIMARY KEY CONSTRAINT admission_policy_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'manual_review' CONSTRAINT admission_policy_mode_check CHECK(mode IN ('manual_review','allowlist')),
  contact_type text NOT NULL DEFAULT 'email' CONSTRAINT admission_policy_contact_check CHECK(contact_type IN ('email','phone')),
  is_open boolean NOT NULL DEFAULT false,
  allow_common_exceptions boolean NOT NULL DEFAULT false,
  requires_additional_verification boolean NOT NULL DEFAULT false,
  phone_channel text CONSTRAINT admission_policy_channel_check CHECK(phone_channel IN ('whatsapp','sms')),
  allow_sms_alternative boolean NOT NULL DEFAULT false,
  messaging_connection_id uuid,
  messaging_connection_version integer,
  verification_epoch integer NOT NULL DEFAULT 1 CONSTRAINT admission_policy_epoch_check CHECK(verification_epoch>0),
  version integer NOT NULL DEFAULT 1 CONSTRAINT admission_policy_version_check CHECK(version>0),
  activated_at timestamptz,
  changed_by_user_id text CONSTRAINT admission_policy_changer_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_policy_phone_check CHECK(contact_type<>'phone' OR mode<>'allowlist' OR requires_additional_verification),
  CONSTRAINT admission_policy_alternative_check CHECK(NOT allow_sms_alternative OR (contact_type='phone' AND phone_channel IS NOT DISTINCT FROM 'whatsapp' AND requires_additional_verification)),
  CONSTRAINT admission_policy_connection_pair_check CHECK((messaging_connection_id IS NULL)=(messaging_connection_version IS NULL)),
  CONSTRAINT admission_policy_connection_version_check CHECK(messaging_connection_version IS NULL OR messaging_connection_version>0)
);

CREATE TABLE public.academy_allowlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL CONSTRAINT admission_allowlist_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  contact_type text NOT NULL CONSTRAINT admission_allowlist_contact_check CHECK(contact_type IN ('email','phone')),
  normalized_contact text NOT NULL CONSTRAINT admission_allowlist_normalized_check CHECK(normalized_contact<>'' AND normalized_contact=btrim(normalized_contact)),
  contact_fingerprint bytea NOT NULL,
  fingerprint_key_id text NOT NULL,
  display_name text CONSTRAINT admission_allowlist_name_check CHECK(char_length(display_name)<=100),
  status text NOT NULL DEFAULT 'enabled' CONSTRAINT admission_allowlist_state_check CHECK(status IN ('enabled','disabled')),
  version integer NOT NULL DEFAULT 1 CONSTRAINT admission_allowlist_version_check CHECK(version>0),
  origin text NOT NULL DEFAULT 'manual' CONSTRAINT admission_allowlist_origin_check CHECK(origin IN ('manual','import')),
  import_id uuid,
  created_by_user_id text CONSTRAINT admission_allowlist_creator_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  updated_by_user_id text CONSTRAINT admission_allowlist_updater_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_allowlist_scope_key UNIQUE(id,tribe_id),
  CONSTRAINT admission_allowlist_contact_key UNIQUE(tribe_id,contact_type,normalized_contact)
);
CREATE INDEX admission_allowlist_search_idx ON public.academy_allowlist_entries(tribe_id,status,normalized_contact);

CREATE TABLE public.academy_personal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL CONSTRAINT admission_invitation_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  created_by_user_id text CONSTRAINT admission_invitation_creator_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  internal_name text CONSTRAINT admission_invitation_name_check CHECK(char_length(internal_name)<=100),
  contact_type text NOT NULL CONSTRAINT admission_invitation_contact_check CHECK(contact_type IN ('email','phone')),
  normalized_contact text NOT NULL CONSTRAINT admission_invitation_normalized_check CHECK(normalized_contact<>'' AND normalized_contact=btrim(normalized_contact)),
  contact_fingerprint bytea NOT NULL,
  fingerprint_key_id text NOT NULL,
  requires_allowlist boolean NOT NULL DEFAULT true,
  expires_at timestamptz DEFAULT clock_timestamp()+interval '7 days',
  status text NOT NULL DEFAULT 'active' CONSTRAINT admission_invitation_state_check CHECK(status IN ('active','revoked','expired','redeemed')),
  version integer NOT NULL DEFAULT 1 CONSTRAINT admission_invitation_version_check CHECK(version>0),
  token_hash bytea NOT NULL,
  token_key_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  redeemed_by_user_id text CONSTRAINT admission_invitation_redeemer_fkey REFERENCES public."user"(id) ON DELETE RESTRICT,
  redeemed_request_id uuid,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  authorization_revoked_at timestamptz,
  CONSTRAINT admission_invitation_scope_key UNIQUE(id,tribe_id),
  CONSTRAINT admission_invitation_redemption_scope_key UNIQUE(id,redeemed_request_id,tribe_id,redeemed_by_user_id),
  CONSTRAINT admission_invitation_token_key UNIQUE(token_key_id,token_hash),
  CONSTRAINT admission_invitation_time_check CHECK(expires_at IS NULL OR expires_at>created_at),
  CONSTRAINT admission_invitation_redemption_check CHECK(
    (status='redeemed' AND redeemed_by_user_id IS NOT NULL AND redeemed_request_id IS NOT NULL AND redeemed_at IS NOT NULL)
    OR (status<>'redeemed' AND redeemed_by_user_id IS NULL AND redeemed_request_id IS NULL AND redeemed_at IS NULL)
  ),
  CONSTRAINT admission_invitation_authorization_check CHECK(authorization_revoked_at IS NULL OR status='redeemed')
);
CREATE UNIQUE INDEX admission_invitation_active_recipient_key ON public.academy_personal_invitations(tribe_id,contact_type,normalized_contact) WHERE status='active';

CREATE TABLE public.contact_verification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CONSTRAINT admission_challenge_user_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL CONSTRAINT admission_challenge_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  contact_type text NOT NULL CONSTRAINT admission_challenge_contact_check CHECK(contact_type IN ('email','phone')),
  normalized_contact text NOT NULL,
  contact_fingerprint bytea NOT NULL,
  fingerprint_key_id text NOT NULL,
  purpose text NOT NULL CONSTRAINT admission_challenge_purpose_check CHECK(purpose IN ('admission','connection_diagnostic')),
  verification_epoch integer,
  connection_id uuid NOT NULL,
  connection_version integer NOT NULL CONSTRAINT admission_challenge_connection_version_check CHECK(connection_version>0),
  security_epoch text NOT NULL,
  channel text NOT NULL CONSTRAINT admission_challenge_channel_check CHECK(channel IN ('email','sms','whatsapp')),
  state text NOT NULL DEFAULT 'issued' CONSTRAINT admission_challenge_state_check CHECK(state IN ('issued','verified','invalidated','expired')),
  version integer NOT NULL DEFAULT 1 CONSTRAINT admission_challenge_version_check CHECK(version>0),
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CONSTRAINT admission_challenge_failures_check CHECK(failed_attempts BETWEEN 0 AND 5),
  verified_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  code_mac bytea,
  mac_key_id text NOT NULL,
  code_envelope_id uuid,
  delivery_id uuid NOT NULL,
  CONSTRAINT admission_challenge_scope_key UNIQUE(id,tribe_id,user_id),
  CONSTRAINT admission_challenge_epoch_check CHECK((purpose='admission' AND verification_epoch IS NOT NULL AND verification_epoch>0) OR (purpose='connection_diagnostic' AND verification_epoch IS NULL)),
  CONSTRAINT admission_challenge_time_check CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes'),
  CONSTRAINT admission_challenge_verified_check CHECK((state='verified')=(verified_at IS NOT NULL))
);
CREATE UNIQUE INDEX admission_challenge_current_key ON public.contact_verification_challenges(user_id,tribe_id,contact_type,normalized_contact,purpose) WHERE is_current;
CREATE INDEX admission_challenge_expiry_idx ON public.contact_verification_challenges(expires_at) WHERE state='issued';

CREATE TABLE public.academy_admission_verification_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL CONSTRAINT admission_proof_challenge_key UNIQUE,
  user_id text NOT NULL CONSTRAINT admission_proof_user_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL CONSTRAINT admission_proof_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  contact_type text NOT NULL CONSTRAINT admission_proof_contact_check CHECK(contact_type IN ('email','phone')),
  normalized_contact text NOT NULL,
  verification_epoch integer NOT NULL CONSTRAINT admission_proof_epoch_check CHECK(verification_epoch>0),
  connection_id uuid NOT NULL,
  connection_version integer NOT NULL CONSTRAINT admission_proof_connection_version_check CHECK(connection_version>0),
  security_epoch text NOT NULL,
  verified_at timestamptz NOT NULL,
  apply_before timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available' CONSTRAINT admission_proof_state_check CHECK(status IN ('available','applied','invalid')),
  applied_request_id uuid,
  applied_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  CONSTRAINT admission_proof_scope_key UNIQUE(id,tribe_id,user_id),
  CONSTRAINT admission_proof_application_scope_key UNIQUE(id,applied_request_id,tribe_id,user_id),
  CONSTRAINT admission_proof_challenge_fkey FOREIGN KEY(challenge_id,tribe_id,user_id) REFERENCES public.contact_verification_challenges(id,tribe_id,user_id),
  CONSTRAINT admission_proof_time_check CHECK(apply_before>verified_at AND apply_before<=verified_at+interval '15 minutes'),
  CONSTRAINT admission_proof_application_check CHECK(
    (status='applied' AND applied_request_id IS NOT NULL AND applied_at IS NOT NULL)
    OR (status='available' AND applied_request_id IS NULL AND applied_at IS NULL)
    OR (status='invalid' AND ((applied_request_id IS NULL)=(applied_at IS NULL)))
  )
);

CREATE TABLE public.academy_admission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL CONSTRAINT admission_request_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL CONSTRAINT admission_request_user_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  source text NOT NULL CONSTRAINT admission_request_source_check CHECK(source IN ('common','personal','legacy')),
  invitation_id uuid,
  legacy_invitation_id uuid,
  contact_type text CONSTRAINT admission_request_contact_check CHECK(contact_type IN ('email','phone')),
  normalized_contact text,
  contact_fingerprint bytea,
  fingerprint_key_id text,
  evidence_source text NOT NULL DEFAULT 'none' CONSTRAINT admission_request_evidence_check CHECK(evidence_source IN ('none','declared','base','local')),
  global_identity_evidence_id uuid,
  proof_id uuid,
  binding_id uuid,
  requires_allowlist boolean NOT NULL DEFAULT false,
  original_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  applicant_message text CONSTRAINT admission_request_message_check CHECK(char_length(applicant_message)<=500),
  status text NOT NULL DEFAULT 'pending' CONSTRAINT admission_request_state_check CHECK(status IN ('pending','approved','rejected','cancelled','expired')),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CONSTRAINT admission_request_version_check CHECK(version>0),
  decision_id uuid,
  cancel_reason text,
  retry_allowed_at timestamptz,
  CONSTRAINT admission_request_scope_key UNIQUE(id,tribe_id,user_id),
  CONSTRAINT admission_request_source_scope_check CHECK(
    (source='common' AND invitation_id IS NULL AND legacy_invitation_id IS NULL)
    OR (source='personal' AND invitation_id IS NOT NULL AND legacy_invitation_id IS NULL)
    OR (source='legacy' AND invitation_id IS NULL AND legacy_invitation_id IS NOT NULL)
  ),
  CONSTRAINT admission_request_invitation_fkey FOREIGN KEY(invitation_id,tribe_id) REFERENCES public.academy_personal_invitations(id,tribe_id),
  CONSTRAINT admission_request_legacy_invitation_fkey FOREIGN KEY(legacy_invitation_id,tribe_id) REFERENCES public.tribe_invitations(id,tribe_id) ON DELETE RESTRICT,
  CONSTRAINT admission_request_global_evidence_fkey FOREIGN KEY(global_identity_evidence_id,user_id) REFERENCES public.global_identity_evidence(id,user_id) ON DELETE RESTRICT,
  CONSTRAINT admission_request_redemption_fkey FOREIGN KEY(invitation_id,id,tribe_id,user_id) REFERENCES public.academy_personal_invitations(id,redeemed_request_id,tribe_id,redeemed_by_user_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT admission_request_proof_fkey FOREIGN KEY(proof_id,id,tribe_id,user_id) REFERENCES public.academy_admission_verification_proofs(id,applied_request_id,tribe_id,user_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT admission_request_contact_pair_check CHECK((contact_type IS NULL)=(normalized_contact IS NULL)),
  CONSTRAINT admission_request_time_check CHECK(expires_at>submitted_at AND expires_at<=submitted_at+interval '30 days'),
  CONSTRAINT admission_request_decision_check CHECK((status='pending')=(decision_id IS NULL))
);
CREATE UNIQUE INDEX admission_request_pending_key ON public.academy_admission_requests(tribe_id,user_id) WHERE status='pending';
CREATE INDEX admission_request_inbox_idx ON public.academy_admission_requests(tribe_id,status,submitted_at);
ALTER TABLE public.academy_personal_invitations ADD CONSTRAINT admission_invitation_request_fkey FOREIGN KEY(redeemed_request_id,tribe_id,redeemed_by_user_id) REFERENCES public.academy_admission_requests(id,tribe_id,user_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.academy_admission_verification_proofs ADD CONSTRAINT admission_proof_request_fkey FOREIGN KEY(applied_request_id,tribe_id,user_id) REFERENCES public.academy_admission_requests(id,tribe_id,user_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.academy_admission_contact_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL CONSTRAINT admission_binding_tribe_fkey REFERENCES public.tribes(id) ON DELETE RESTRICT,
  contact_type text NOT NULL CONSTRAINT admission_binding_contact_check CHECK(contact_type IN ('email','phone')),
  normalized_contact text NOT NULL,
  contact_fingerprint bytea NOT NULL,
  fingerprint_key_id text NOT NULL,
  owner_user_id text NOT NULL CONSTRAINT admission_binding_user_fkey REFERENCES public."user"(id) ON DELETE RESTRICT,
  first_request_id uuid,
  first_proof_id uuid,
  evidence_source text NOT NULL CONSTRAINT admission_binding_evidence_check CHECK(evidence_source IN ('base','local')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_binding_scope_key UNIQUE(id,tribe_id,owner_user_id),
  CONSTRAINT admission_binding_contact_key UNIQUE(tribe_id,contact_type,normalized_contact),
  CONSTRAINT admission_binding_request_fkey FOREIGN KEY(first_request_id,tribe_id,owner_user_id) REFERENCES public.academy_admission_requests(id,tribe_id,user_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT admission_binding_proof_fkey FOREIGN KEY(first_proof_id,tribe_id,owner_user_id) REFERENCES public.academy_admission_verification_proofs(id,tribe_id,user_id),
  CONSTRAINT admission_binding_origin_check CHECK(first_request_id IS NOT NULL OR first_proof_id IS NOT NULL)
);
ALTER TABLE public.academy_admission_requests ADD CONSTRAINT admission_request_binding_fkey FOREIGN KEY(binding_id,tribe_id,user_id) REFERENCES public.academy_admission_contact_bindings(id,tribe_id,owner_user_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.academy_admission_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  tribe_id uuid NOT NULL CONSTRAINT admission_decision_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL CONSTRAINT admission_decision_user_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  request_version integer NOT NULL CONSTRAINT admission_decision_version_check CHECK(request_version>0),
  outcome text NOT NULL CONSTRAINT admission_decision_outcome_check CHECK(outcome IN ('approved','rejected','cancelled','expired')),
  actor_user_id text CONSTRAINT admission_decision_actor_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  actor_kind text NOT NULL CONSTRAINT admission_decision_actor_check CHECK(actor_kind IN ('user','system')),
  rule text NOT NULL,
  policy_version integer NOT NULL CONSTRAINT admission_decision_policy_version_check CHECK(policy_version>0),
  verification_epoch integer NOT NULL CONSTRAINT admission_decision_epoch_check CHECK(verification_epoch>0),
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  internal_reason text CONSTRAINT admission_decision_reason_check CHECK(char_length(internal_reason)<=500),
  external_message text CONSTRAINT admission_decision_message_check CHECK(char_length(external_message)<=200),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  membership_effect_id uuid,
  CONSTRAINT admission_decision_request_key UNIQUE(request_id),
  CONSTRAINT admission_decision_scope_key UNIQUE(id,request_id,tribe_id,user_id,outcome),
  CONSTRAINT admission_decision_request_fkey FOREIGN KEY(request_id,tribe_id,user_id) REFERENCES public.academy_admission_requests(id,tribe_id,user_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT admission_decision_effect_check CHECK((outcome='approved')=(membership_effect_id IS NOT NULL))
);
ALTER TABLE public.academy_admission_requests ADD CONSTRAINT admission_request_decision_fkey FOREIGN KEY(decision_id,id,tribe_id,user_id,status) REFERENCES public.academy_admission_decisions(id,request_id,tribe_id,user_id,outcome) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.academy_admission_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id text NOT NULL CONSTRAINT admission_operation_actor_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL CONSTRAINT admission_operation_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  operation_type text NOT NULL,
  idempotency_key uuid NOT NULL,
  intent_fingerprint bytea NOT NULL,
  fingerprint_key_id text NOT NULL,
  state text NOT NULL DEFAULT 'started' CONSTRAINT admission_operation_state_check CHECK(state IN ('started','completed')),
  lease_owner uuid,
  lease_until timestamptz,
  version integer NOT NULL DEFAULT 1 CONSTRAINT admission_operation_version_check CHECK(version>0),
  public_result jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT admission_operation_identity_key UNIQUE(actor_user_id,tribe_id,operation_type,idempotency_key),
  CONSTRAINT admission_operation_result_check CHECK((state='completed' AND public_result IS NOT NULL AND completed_at IS NOT NULL) OR (state='started' AND public_result IS NULL AND completed_at IS NULL)),
  CONSTRAINT admission_operation_lease_pair_check CHECK((lease_owner IS NULL)=(lease_until IS NULL))
);

CREATE TABLE public.academy_allowlist_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL CONSTRAINT admission_import_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL CONSTRAINT admission_import_actor_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  contact_type text NOT NULL CONSTRAINT admission_import_contact_check CHECK(contact_type IN ('email','phone')),
  policy_version integer NOT NULL CONSTRAINT admission_import_policy_version_check CHECK(policy_version>0),
  file_fingerprint bytea NOT NULL,
  fingerprint_key_id text NOT NULL,
  selected_rows integer[] NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1 CONSTRAINT admission_import_version_check CHECK(version>0),
  state text NOT NULL DEFAULT 'preview' CONSTRAINT admission_import_state_check CHECK(state IN ('preview','processing','completed','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  CONSTRAINT admission_import_scope_key UNIQUE(id,tribe_id),
  CONSTRAINT admission_import_time_check CHECK(expires_at>created_at AND purge_after>=expires_at AND purge_after<=created_at+interval '24 hours')
);
CREATE TABLE public.academy_allowlist_import_rows (
  import_id uuid NOT NULL,
  tribe_id uuid NOT NULL,
  row_number integer NOT NULL CONSTRAINT admission_import_row_number_check CHECK(row_number BETWEEN 1 AND 10000),
  input_data jsonb NOT NULL,
  validation_result jsonb NOT NULL,
  outcome text CONSTRAINT admission_import_row_outcome_check CHECK(outcome IN ('added','unchanged','skipped','conflict')),
  entry_id uuid,
  committed_at timestamptz,
  PRIMARY KEY(import_id,row_number),
  CONSTRAINT admission_import_row_import_fkey FOREIGN KEY(import_id,tribe_id) REFERENCES public.academy_allowlist_imports(id,tribe_id) ON DELETE CASCADE,
  CONSTRAINT admission_import_row_entry_fkey FOREIGN KEY(entry_id,tribe_id) REFERENCES public.academy_allowlist_entries(id,tribe_id),
  CONSTRAINT admission_import_row_commit_check CHECK((outcome IS NULL)=(committed_at IS NULL))
);
ALTER TABLE public.academy_allowlist_entries ADD CONSTRAINT admission_allowlist_import_fkey FOREIGN KEY(import_id,tribe_id) REFERENCES public.academy_allowlist_imports(id,tribe_id) ON DELETE RESTRICT;

CREATE TABLE public.academy_admission_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL CONSTRAINT admission_audit_tribe_fkey REFERENCES public.tribes(id) ON DELETE RESTRICT,
  actor_user_id text CONSTRAINT admission_audit_actor_fkey REFERENCES public."user"(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  operation_id uuid,
  event_type text NOT NULL,
  rule text,
  cause text,
  resource_version integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX admission_audit_history_idx ON public.academy_admission_audit_events(tribe_id,created_at DESC);
CREATE TABLE public.academy_admission_notification_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL CONSTRAINT admission_obligation_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  applicant_user_id text NOT NULL CONSTRAINT admission_obligation_applicant_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  event_type text NOT NULL CONSTRAINT admission_obligation_event_check CHECK(event_type IN ('pending_created','approved','rejected','cancelled','expired','reminder')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  materialized_at timestamptz,
  CONSTRAINT admission_obligation_event_key UNIQUE(request_id,event_type),
  CONSTRAINT admission_obligation_request_fkey FOREIGN KEY(request_id,tribe_id,applicant_user_id) REFERENCES public.academy_admission_requests(id,tribe_id,user_id) ON DELETE CASCADE
);

-- Fixed identity fields cannot be rewritten through a privileged runtime.
CREATE FUNCTION public.guard_admission_binding_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.contact_type,NEW.normalized_contact,NEW.owner_user_id,NEW.first_request_id,NEW.first_proof_id,NEW.evidence_source,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.contact_type,OLD.normalized_contact,OLD.owner_user_id,OLD.first_request_id,OLD.first_proof_id,OLD.evidence_source,OLD.created_at) THEN
    RAISE EXCEPTION 'admission binding identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_binding_identity() FROM PUBLIC;
CREATE TRIGGER admission_binding_identity_guard BEFORE UPDATE ON public.academy_admission_contact_bindings FOR EACH ROW EXECUTE FUNCTION public.guard_admission_binding_identity();

CREATE FUNCTION public.guard_admission_request_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.user_id,NEW.source,NEW.invitation_id,NEW.legacy_invitation_id,NEW.submitted_at,NEW.expires_at,NEW.original_policy_snapshot)
     IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.user_id,OLD.source,OLD.invitation_id,OLD.legacy_invitation_id,OLD.submitted_at,OLD.expires_at,OLD.original_policy_snapshot) THEN
    RAISE EXCEPTION 'admission request identity and deadline are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status<>'pending' AND ROW(NEW.status,NEW.decision_id) IS DISTINCT FROM ROW(OLD.status,OLD.decision_id) THEN
    RAISE EXCEPTION 'admission terminal state is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.normalized_contact IS NOT NULL AND ROW(NEW.contact_type,NEW.normalized_contact) IS DISTINCT FROM ROW(OLD.contact_type,OLD.normalized_contact) THEN
    RAISE EXCEPTION 'admission fixed contact is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_request_identity() FROM PUBLIC;
CREATE TRIGGER admission_request_identity_guard BEFORE UPDATE ON public.academy_admission_requests FOR EACH ROW EXECUTE FUNCTION public.guard_admission_request_identity();

-- Version is configuration authority, not a counter for fingerprint rotation,
-- metadata reads or unrelated membership/binding effects.
CREATE FUNCTION public.guard_admission_resource_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field_name text; old_intent jsonb='{}'; new_intent jsonb='{}';
BEGIN
  FOREACH field_name IN ARRAY TG_ARGV LOOP
    old_intent=old_intent||jsonb_build_object(field_name,to_jsonb(OLD)->field_name);
    new_intent=new_intent||jsonb_build_object(field_name,to_jsonb(NEW)->field_name);
  END LOOP;
  IF new_intent IS DISTINCT FROM old_intent THEN
    IF NEW.version<>OLD.version+1 THEN
      RAISE EXCEPTION 'admission effective change requires one version increment' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.version<>OLD.version THEN
    RAISE EXCEPTION 'admission no-op cannot increment version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_resource_version() FROM PUBLIC;
CREATE TRIGGER admission_allowlist_version_guard BEFORE UPDATE ON public.academy_allowlist_entries FOR EACH ROW EXECUTE FUNCTION public.guard_admission_resource_version('display_name','status');
CREATE TRIGGER admission_invitation_version_guard BEFORE UPDATE ON public.academy_personal_invitations FOR EACH ROW EXECUTE FUNCTION public.guard_admission_resource_version('internal_name','status','redeemed_by_user_id','redeemed_request_id','redeemed_at','revoked_at','authorization_revoked_at');
CREATE TRIGGER admission_request_version_guard BEFORE UPDATE ON public.academy_admission_requests FOR EACH ROW EXECUTE FUNCTION public.guard_admission_resource_version('contact_type','normalized_contact','evidence_source','global_identity_evidence_id','proof_id','binding_id','status','decision_id','cancel_reason','retry_allowed_at');
CREATE TRIGGER admission_policy_version_guard BEFORE UPDATE ON public.academy_admission_policies FOR EACH ROW EXECUTE FUNCTION public.guard_admission_resource_version('mode','contact_type','is_open','allow_common_exceptions','requires_additional_verification','phone_channel','allow_sms_alternative','messaging_connection_id','messaging_connection_version','verification_epoch','activated_at');

CREATE FUNCTION public.guard_admission_allowlist_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.contact_type,NEW.normalized_contact,NEW.origin,NEW.import_id,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.contact_type,OLD.normalized_contact,OLD.origin,OLD.import_id,OLD.created_at) THEN
    RAISE EXCEPTION 'admission allowlist identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_allowlist_identity() FROM PUBLIC;
CREATE TRIGGER admission_allowlist_identity_guard BEFORE UPDATE ON public.academy_allowlist_entries FOR EACH ROW EXECUTE FUNCTION public.guard_admission_allowlist_identity();

CREATE FUNCTION public.guard_admission_invitation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.contact_type,NEW.normalized_contact,NEW.requires_allowlist,NEW.expires_at,NEW.token_hash,NEW.token_key_id,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.contact_type,OLD.normalized_contact,OLD.requires_allowlist,OLD.expires_at,OLD.token_hash,OLD.token_key_id,OLD.created_at) THEN
    RAISE EXCEPTION 'admission invitation recipient and token are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status<>'active' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'admission invitation terminal state is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.authorization_revoked_at IS NOT NULL AND NEW.authorization_revoked_at IS DISTINCT FROM OLD.authorization_revoked_at THEN
    RAISE EXCEPTION 'admission redeemed authorization revocation is irreversible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_invitation_identity() FROM PUBLIC;
CREATE TRIGGER admission_invitation_identity_guard BEFORE UPDATE ON public.academy_personal_invitations FOR EACH ROW EXECUTE FUNCTION public.guard_admission_invitation_identity();

-- The deferred check permits either insertion order inside one transaction.
-- It validates structural co-commit, while application owns reviewer eligibility.
CREATE FUNCTION public.guard_admission_decision_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_state text; request_decision_id uuid;
BEGIN
  SELECT status,decision_id INTO request_state,request_decision_id
    FROM public.academy_admission_requests WHERE id=NEW.request_id;
  IF NOT FOUND OR request_state IS DISTINCT FROM NEW.outcome OR request_decision_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'admission terminal decision requires matching request transition' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.academy_admission_notification_obligations
    WHERE request_id=NEW.request_id AND tribe_id=NEW.tribe_id AND applicant_user_id=NEW.user_id AND event_type=NEW.outcome
  ) THEN
    RAISE EXCEPTION 'admission terminal decision requires notification obligation' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.academy_admission_audit_events
    WHERE tribe_id=NEW.tribe_id AND resource_type='admission_request' AND resource_id=NEW.request_id AND event_type=NEW.outcome
  ) THEN
    RAISE EXCEPTION 'admission terminal decision requires audit event' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_decision_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER admission_decision_commit_guard AFTER INSERT ON public.academy_admission_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_admission_decision_commit();

-- Client SQL roles have read policies only. Authoritative backend writers still
-- resolve live scope/role under locks; table ownership never grants eligibility.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'academy_admission_policies','academy_allowlist_entries','academy_personal_invitations',
    'contact_verification_challenges','academy_admission_verification_proofs',
    'academy_admission_requests','academy_admission_contact_bindings',
    'academy_admission_decisions','academy_admission_operations',
    'academy_allowlist_imports','academy_allowlist_import_rows',
    'academy_admission_audit_events','academy_admission_notification_obligations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',table_name);
    EXECUTE format(
      'CREATE POLICY admission_owner_writer ON public.%I FOR ALL USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=%L::regclass)) WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=%L::regclass))',
      table_name,'public.'||table_name,'public.'||table_name
    );
  END LOOP;
END;
$$;
CREATE POLICY admission_request_account_read ON public.academy_admission_requests FOR SELECT USING(user_id=nullif(current_setting('app.current_user_id',true),''));
CREATE POLICY admission_challenge_account_read ON public.contact_verification_challenges FOR SELECT USING(user_id=nullif(current_setting('app.current_user_id',true),''));
CREATE POLICY admission_proof_account_read ON public.academy_admission_verification_proofs FOR SELECT USING(user_id=nullif(current_setting('app.current_user_id',true),''));
CREATE POLICY admission_operation_account_read ON public.academy_admission_operations FOR SELECT USING(actor_user_id=nullif(current_setting('app.current_user_id',true),''));
-- Reviewer/leader policies, membership effect FK and messaging composite FKs
-- are completed by the following versioned integration migrations.
