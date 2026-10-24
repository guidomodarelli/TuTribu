-- Private global evidence derived only by the verified auth callback.
-- No JWT, OAuth access/refresh token, provider profile or plaintext nonce is added.
CREATE UNIQUE INDEX account_identity_scope_key ON public.account (id, "userId", "providerId", "accountId");
CREATE UNIQUE INDEX account_subject_user_key ON public.account (id, "userId", "accountId");
CREATE UNIQUE INDEX session_user_scope_key ON public.session (id, "userId");

CREATE TABLE public.global_identity_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CONSTRAINT global_identity_user_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  provider_id text NOT NULL CONSTRAINT global_identity_provider_check CHECK (provider_id = 'google'),
  provider_subject text NOT NULL,
  normalized_email text NOT NULL CONSTRAINT global_identity_email_check CHECK (normalized_email <> '' AND normalized_email = lower(btrim(normalized_email))),
  email_verified_claim boolean NOT NULL,
  hosted_domain text,
  classification text NOT NULL CONSTRAINT global_identity_classification_check CHECK (classification IN ('gmail','workspace','insufficient')),
  issuer text NOT NULL,
  audience text NOT NULL,
  token_issued_at timestamptz NOT NULL,
  token_expires_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CONSTRAINT global_identity_version_check CHECK (version > 0),
  invalidated_at timestamptz,
  invalidation_reason text,
  CONSTRAINT global_identity_account_scope_fkey FOREIGN KEY (account_id,user_id,provider_id,provider_subject)
    REFERENCES public.account(id,"userId","providerId","accountId") ON DELETE CASCADE,
  CONSTRAINT global_identity_time_check CHECK (token_expires_at > token_issued_at),
  CONSTRAINT global_identity_authority_check CHECK (
    classification = 'insufficient' OR (email_verified_claim AND
      ((classification='gmail' AND normalized_email LIKE '%@gmail.com') OR
       (classification='workspace' AND hosted_domain IS NOT NULL AND btrim(hosted_domain)<>'')))
  ),
  CONSTRAINT global_identity_invalidation_check CHECK ((invalidated_at IS NULL) = (invalidation_reason IS NULL))
);
CREATE UNIQUE INDEX global_identity_current_account_key ON public.global_identity_evidence(account_id,provider_id) WHERE invalidated_at IS NULL;
CREATE INDEX global_identity_user_history_idx ON public.global_identity_evidence(user_id,verified_at DESC);

CREATE TABLE public.global_reauthentication_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CONSTRAINT reauthentication_user_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  original_session_id text NOT NULL,
  account_id text NOT NULL,
  provider_subject text NOT NULL,
  tribe_id uuid NOT NULL CONSTRAINT reauthentication_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  operation text NOT NULL CONSTRAINT reauthentication_operation_check CHECK (operation<>''),
  resource_id text NOT NULL CONSTRAINT reauthentication_resource_check CHECK (resource_id<>''),
  return_path text NOT NULL CONSTRAINT reauthentication_return_path_check CHECK (return_path LIKE '/%' AND return_path NOT LIKE '//%' AND position(chr(92) IN return_path)=0 AND return_path !~ '[[:cntrl:]]'),
  nonce_hash bytea,
  state text NOT NULL DEFAULT 'created' CONSTRAINT reauthentication_state_values_check CHECK (state IN ('created','authorizing','consumed','expired')),
  version integer NOT NULL DEFAULT 1 CONSTRAINT reauthentication_version_check CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT reauthentication_original_session_fkey FOREIGN KEY(original_session_id,user_id) REFERENCES public.session(id,"userId") ON DELETE CASCADE,
  CONSTRAINT reauthentication_account_fkey FOREIGN KEY(account_id,user_id,provider_subject) REFERENCES public.account(id,"userId","accountId") ON DELETE CASCADE,
  CONSTRAINT reauthentication_scope_key UNIQUE(id,user_id,account_id,provider_subject,tribe_id,operation,resource_id),
  CONSTRAINT reauthentication_time_check CHECK (expires_at>created_at),
  CONSTRAINT reauthentication_nonce_check CHECK (nonce_hash IS NULL OR octet_length(nonce_hash)=32),
  CONSTRAINT reauthentication_state_check CHECK (
    (state='created' AND nonce_hash IS NULL AND consumed_at IS NULL) OR
    (state='authorizing' AND nonce_hash IS NOT NULL AND consumed_at IS NULL) OR
    (state='consumed' AND nonce_hash IS NOT NULL AND consumed_at IS NOT NULL) OR
    (state='expired' AND consumed_at IS NULL)
  )
);
CREATE INDEX reauthentication_expiry_idx ON public.global_reauthentication_intents(expires_at) WHERE state IN ('created','authorizing');

CREATE TABLE public.recent_authentication_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL CONSTRAINT recent_authentication_intent_key UNIQUE,
  user_id text NOT NULL CONSTRAINT recent_authentication_user_fkey REFERENCES public."user"(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  provider_subject text NOT NULL,
  session_id text NOT NULL,
  tribe_id uuid NOT NULL CONSTRAINT recent_authentication_tribe_fkey REFERENCES public.tribes(id) ON DELETE CASCADE,
  operation text NOT NULL,
  resource_id text NOT NULL,
  authenticated_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  invalidated_at timestamptz,
  CONSTRAINT recent_authentication_scope_fkey FOREIGN KEY(intent_id,user_id,account_id,provider_subject,tribe_id,operation,resource_id)
    REFERENCES public.global_reauthentication_intents(id,user_id,account_id,provider_subject,tribe_id,operation,resource_id) ON DELETE CASCADE,
  CONSTRAINT recent_authentication_session_fkey FOREIGN KEY(session_id,user_id) REFERENCES public.session(id,"userId") ON DELETE CASCADE,
  CONSTRAINT recent_authentication_window_check CHECK (authenticated_at<=verified_at AND valid_until>authenticated_at AND valid_until<=authenticated_at+interval '10 minutes')
);
CREATE INDEX recent_authentication_active_scope_idx ON public.recent_authentication_evidence(user_id,session_id,tribe_id,operation,resource_id,valid_until) WHERE invalidated_at IS NULL;

CREATE FUNCTION public.guard_global_reauthentication_intent_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.user_id,NEW.original_session_id,NEW.account_id,NEW.provider_subject,NEW.tribe_id,NEW.operation,NEW.resource_id,NEW.return_path,NEW.created_at,NEW.expires_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.original_session_id,OLD.account_id,OLD.provider_subject,OLD.tribe_id,OLD.operation,OLD.resource_id,OLD.return_path,OLD.created_at,OLD.expires_at) THEN
    RAISE EXCEPTION 'reauthentication scope is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state OR NEW.nonce_hash IS DISTINCT FROM OLD.nonce_hash OR NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
    IF NOT ((OLD.state='created' AND NEW.state IN ('authorizing','expired')) OR (OLD.state='authorizing' AND NEW.state IN ('consumed','expired'))) THEN
      RAISE EXCEPTION 'reauthentication transition is not allowed' USING ERRCODE='23514';
    END IF;
    IF OLD.nonce_hash IS NOT NULL AND NEW.nonce_hash IS DISTINCT FROM OLD.nonce_hash THEN
      RAISE EXCEPTION 'reauthentication nonce is immutable after issuance' USING ERRCODE='23514';
    END IF;
    IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'reauthentication transition requires one version increment' USING ERRCODE='23514'; END IF;
  ELSIF NEW.version<>OLD.version THEN
    RAISE EXCEPTION 'reauthentication no-op cannot increment version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_global_reauthentication_intent_transition() FROM PUBLIC;
CREATE TRIGGER global_reauthentication_intent_transition BEFORE UPDATE ON public.global_reauthentication_intents FOR EACH ROW EXECUTE FUNCTION public.guard_global_reauthentication_intent_transition();

-- Emission and nonce consumption share the writer transaction. The foreign key
-- remains responsible for exact user/account/tribe/operation/resource scope.
CREATE FUNCTION public.guard_recent_authentication_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE intent_state text;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT state INTO intent_state FROM public.global_reauthentication_intents
      WHERE id=NEW.intent_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'recent authentication intent is absent' USING ERRCODE='23503';
    END IF;
    IF intent_state<>'consumed' THEN
      RAISE EXCEPTION 'recent authentication requires consumed intent' USING ERRCODE='23514';
    END IF;
  ELSE
    IF ROW(NEW.id,NEW.intent_id,NEW.user_id,NEW.account_id,NEW.provider_subject,NEW.session_id,NEW.tribe_id,NEW.operation,NEW.resource_id,NEW.authenticated_at,NEW.verified_at,NEW.valid_until)
       IS DISTINCT FROM ROW(OLD.id,OLD.intent_id,OLD.user_id,OLD.account_id,OLD.provider_subject,OLD.session_id,OLD.tribe_id,OLD.operation,OLD.resource_id,OLD.authenticated_at,OLD.verified_at,OLD.valid_until) THEN
      RAISE EXCEPTION 'recent authentication origin and window are immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.invalidated_at IS NOT NULL AND NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at THEN
      RAISE EXCEPTION 'recent authentication invalidation is irreversible' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_recent_authentication_evidence() FROM PUBLIC;
CREATE TRIGGER recent_authentication_evidence_guard BEFORE INSERT OR UPDATE ON public.recent_authentication_evidence FOR EACH ROW EXECUTE FUNCTION public.guard_recent_authentication_evidence();

ALTER TABLE public.global_identity_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_reauthentication_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recent_authentication_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY global_identity_own_user ON public.global_identity_evidence FOR ALL USING(user_id=nullif(current_setting('app.current_user_id',true),'')) WITH CHECK(user_id=nullif(current_setting('app.current_user_id',true),''));
CREATE POLICY global_reauthentication_own_user ON public.global_reauthentication_intents FOR ALL USING(user_id=nullif(current_setting('app.current_user_id',true),'')) WITH CHECK(user_id=nullif(current_setting('app.current_user_id',true),''));
CREATE POLICY recent_authentication_own_user ON public.recent_authentication_evidence FOR ALL USING(user_id=nullif(current_setting('app.current_user_id',true),'')) WITH CHECK(user_id=nullif(current_setting('app.current_user_id',true),''));
REVOKE ALL ON public.global_identity_evidence,public.global_reauthentication_intents,public.recent_authentication_evidence FROM PUBLIC;
