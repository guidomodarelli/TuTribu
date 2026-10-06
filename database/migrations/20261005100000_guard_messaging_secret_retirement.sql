-- Credentials stay private and immutable for their exact version. Retirement
-- cannot be reversed or postpone the maximum twenty-four-hour purge deadline.
ALTER TABLE public.messaging_secret_envelopes
  ADD COLUMN purged_at timestamptz,
  ALTER COLUMN iv DROP NOT NULL,
  ALTER COLUMN ciphertext DROP NOT NULL;

CREATE FUNCTION public.guard_messaging_secret_origin_retirement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.secret_ref,NEW.tribe_id,NEW.connection_id,NEW.connection_version,NEW.environment,NEW.security_epoch,NEW.purpose,NEW.format,NEW.created_at)
       IS DISTINCT FROM ROW(OLD.secret_ref,OLD.tribe_id,OLD.connection_id,OLD.connection_version,OLD.environment,OLD.security_epoch,OLD.purpose,OLD.format,OLD.created_at) THEN
      RAISE EXCEPTION 'messaging credential origin is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
      RAISE EXCEPTION 'messaging credential retirement is irreversible' USING ERRCODE='23514';
    END IF;
    IF OLD.purge_after IS NOT NULL AND (NEW.purge_after IS NULL OR NEW.purge_after>OLD.purge_after) THEN
      RAISE EXCEPTION 'messaging credential purge cannot be postponed' USING ERRCODE='23514';
    END IF;
    IF OLD.purged_at IS NOT NULL AND NEW.purged_at IS DISTINCT FROM OLD.purged_at THEN
      RAISE EXCEPTION 'messaging credential purge is irreversible' USING ERRCODE='23514';
    END IF;
    IF ROW(NEW.key_id,NEW.iv,NEW.ciphertext) IS DISTINCT FROM ROW(OLD.key_id,OLD.iv,OLD.ciphertext)
       AND NOT coalesce((OLD.retired_at IS NOT NULL AND OLD.purged_at IS NULL AND NEW.purged_at IS NOT NULL AND NEW.iv IS NULL AND NEW.ciphertext IS NULL AND NEW.key_id=OLD.key_id)
         OR (OLD.retired_at IS NULL AND OLD.purged_at IS NULL AND NEW.retired_at IS NULL AND NEW.purged_at IS NULL
           AND NEW.purge_after IS NOT DISTINCT FROM OLD.purge_after AND NEW.key_id<>OLD.key_id
           AND nullif(current_setting('app.messaging_secret_rewrap_reference',true),'')=NEW.secret_ref::text),false) THEN
      RAISE EXCEPTION 'messaging credential material changes require irreversible purge' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.retired_at IS NOT NULL THEN
    NEW.purge_after=coalesce(NEW.purge_after,NEW.retired_at+interval '24 hours');
    IF NEW.purge_after>NEW.retired_at+interval '24 hours' THEN
      RAISE EXCEPTION 'messaging credential purge exceeds retirement deadline' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_messaging_secret_origin_retirement() FROM PUBLIC;
CREATE TRIGGER messaging_secret_origin_retirement_guard BEFORE INSERT OR UPDATE
ON public.messaging_secret_envelopes FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_secret_origin_retirement();

ALTER TABLE public.messaging_secret_envelopes ADD CONSTRAINT messaging_secret_retirement_purge_check
CHECK(retired_at IS NULL OR (purge_after IS NOT NULL AND purge_after<=retired_at+interval '24 hours'));
ALTER TABLE public.messaging_secret_envelopes ADD CONSTRAINT messaging_secret_material_lifecycle_check
CHECK((purged_at IS NULL AND iv IS NOT NULL AND ciphertext IS NOT NULL)
   OR (purged_at IS NOT NULL AND retired_at IS NOT NULL AND purged_at>=retired_at AND iv IS NULL AND ciphertext IS NULL));

-- The FK to an immutable version retains the reference. Remove the private
-- recoverable bytes rather than deleting that referenced historical record.
CREATE FUNCTION public.purge_retired_messaging_secret_material(requested_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE changed_count integer;
BEGIN
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>100 THEN
    RAISE EXCEPTION 'messaging secret purge batch is invalid' USING ERRCODE='23514';
  END IF;
  WITH eligible AS (
    SELECT secret_ref FROM public.messaging_secret_envelopes
    WHERE retired_at IS NOT NULL AND purged_at IS NULL AND purge_after<=clock_timestamp()
    ORDER BY purge_after,secret_ref FOR UPDATE SKIP LOCKED LIMIT requested_limit
  )
  UPDATE public.messaging_secret_envelopes envelope
    SET iv=NULL,ciphertext=NULL,purged_at=clock_timestamp()
    FROM eligible WHERE envelope.secret_ref=eligible.secret_ref;
  GET DIAGNOSTICS changed_count=ROW_COUNT;
  RETURN changed_count;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_retired_messaging_secret_material(integer) FROM PUBLIC;

-- Only a private backend rotation producer can call this CAS primitive. It
-- decrypts/re-encrypts the same BYOK with Web Crypto before passing the new
-- envelope; SQL never receives plaintext or hosting key material.
CREATE FUNCTION public.rewrap_messaging_secret_material(
  requested_ref uuid,requested_tribe uuid,requested_connection uuid,requested_version integer,
  requested_environment text,requested_epoch text,expected_key_id text,next_key_id text,
  next_iv bytea,next_ciphertext bytea
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE previous_scope text; changed_count integer;
BEGIN
  previous_scope=current_setting('app.messaging_secret_rewrap_reference',true);
  IF requested_ref IS NULL OR requested_version IS NULL OR requested_version<1 OR expected_key_id IS NULL
     OR next_key_id IS NULL OR btrim(next_key_id)='' OR next_key_id=expected_key_id
     OR next_iv IS NULL OR octet_length(next_iv)<>12 OR next_ciphertext IS NULL OR octet_length(next_ciphertext)<16 THEN
    RAISE EXCEPTION 'messaging secret rewrap parameters are invalid' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('app.messaging_secret_rewrap_reference',requested_ref::text,true);
  UPDATE public.messaging_secret_envelopes envelope SET key_id=next_key_id,iv=next_iv,ciphertext=next_ciphertext
    WHERE envelope.secret_ref=requested_ref AND envelope.tribe_id=requested_tribe
      AND envelope.connection_id=requested_connection AND envelope.connection_version=requested_version
      AND envelope.environment=requested_environment AND envelope.security_epoch=requested_epoch
      AND envelope.key_id=expected_key_id AND envelope.retired_at IS NULL AND envelope.purged_at IS NULL;
  GET DIAGNOSTICS changed_count=ROW_COUNT;
  PERFORM set_config('app.messaging_secret_rewrap_reference',coalesce(previous_scope,''),true);
  RETURN changed_count=1;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.messaging_secret_rewrap_reference',coalesce(previous_scope,''),true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.rewrap_messaging_secret_material(uuid,uuid,uuid,integer,text,text,text,text,bytea,bytea) FROM PUBLIC;
