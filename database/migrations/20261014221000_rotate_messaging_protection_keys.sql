-- Private bounded cipher rotation never changes BYOK identity, lifecycle or usage.
CREATE INDEX messaging_secret_rotation_idx ON public.messaging_secret_envelopes(environment,security_epoch,key_id,secret_ref)
  WHERE retired_at IS NULL AND purged_at IS NULL;

CREATE FUNCTION public.messaging_secret_rotation_scope_is_current(
  requested_ref uuid,requested_tribe uuid,requested_connection uuid,requested_version integer,
  requested_environment text,requested_epoch text,requested_key_id text
) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT public.current_app_user_id() IS NULL AND EXISTS(
    SELECT 1 FROM public.messaging_secret_envelopes envelope
    JOIN public.messaging_connection_versions resource ON resource.secret_ref=envelope.secret_ref
      AND resource.tribe_id=envelope.tribe_id AND resource.connection_id=envelope.connection_id AND resource.version=envelope.connection_version
    JOIN public.tenant_messaging_connections connection ON connection.id=resource.connection_id AND connection.tribe_id=resource.tribe_id
    JOIN public.academy_admission_tribe_namespaces namespace ON namespace.tribe_id=connection.tribe_id
    WHERE envelope.secret_ref=requested_ref AND envelope.tribe_id=requested_tribe
      AND envelope.connection_id=requested_connection AND envelope.connection_version=requested_version
      AND envelope.environment=requested_environment AND envelope.security_epoch=requested_epoch AND envelope.key_id=requested_key_id
      AND resource.environment=requested_environment AND resource.security_epoch=requested_epoch
      AND connection.environment=requested_environment AND connection.security_epoch=requested_epoch
      AND namespace.retired_at IS NULL AND connection.retired_at IS NULL AND resource.retired_at IS NULL
      AND envelope.retired_at IS NULL AND envelope.purged_at IS NULL AND envelope.iv IS NOT NULL AND envelope.ciphertext IS NOT NULL
      AND connection.created_at<=clock_timestamp() AND resource.created_at<=clock_timestamp() AND envelope.created_at<=clock_timestamp()
      AND ((connection.is_selected AND connection.selected_version=resource.version)
        OR (connection.is_candidate AND connection.candidate_version=resource.version
          AND resource.last_activity_at<=clock_timestamp() AND resource.last_activity_at+interval '168 hours'>clock_timestamp()))
  );
$$;
REVOKE ALL ON FUNCTION public.messaging_secret_rotation_scope_is_current(uuid,uuid,uuid,integer,text,text,text) FROM PUBLIC;

CREATE FUNCTION public.claim_messaging_secret_key_rotation(requested_environment text,requested_epoch text,requested_active_key_id text,requested_limit integer DEFAULT 25)
RETURNS TABLE(secret_ref uuid,tribe_id uuid,connection_id uuid,connection_version integer,environment text,security_epoch text,key_id text,format integer,iv bytea,ciphertext bytea)
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE candidate record; original_key_id text;
BEGIN
  IF public.current_app_user_id() IS NOT NULL THEN RAISE EXCEPTION 'key rotation requires backend context' USING ERRCODE='42501'; END IF;
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>100
    OR nullif(btrim(requested_environment),'') IS NULL OR nullif(btrim(requested_epoch),'') IS NULL OR nullif(btrim(requested_active_key_id),'') IS NULL THEN
    RAISE EXCEPTION 'key rotation batch is invalid' USING ERRCODE='23514';
  END IF;
  -- Acquire the surviving namespace before connection/version/envelope, and
  -- never wait in reverse order behind another resource owner.
  FOR candidate IN
    SELECT envelope.secret_ref,envelope.tribe_id,envelope.connection_id,envelope.connection_version,envelope.key_id
    FROM public.academy_admission_tribe_namespaces namespace
    JOIN public.messaging_secret_envelopes envelope ON envelope.tribe_id=namespace.tribe_id
    WHERE envelope.environment=requested_environment AND envelope.security_epoch=requested_epoch
      AND envelope.key_id<>requested_active_key_id AND envelope.retired_at IS NULL AND envelope.purged_at IS NULL
      AND public.messaging_secret_rotation_scope_is_current(envelope.secret_ref,envelope.tribe_id,envelope.connection_id,envelope.connection_version,requested_environment,requested_epoch,envelope.key_id)
    ORDER BY namespace.tribe_id,envelope.secret_ref LIMIT requested_limit FOR UPDATE OF namespace SKIP LOCKED
  LOOP
    BEGIN
      -- Pin the audit FK parent without waiting behind a tribe deletion that
      -- already owns it and is about to retire this namespace.
      PERFORM 1 FROM public.tribes tribe WHERE tribe.id=candidate.tribe_id FOR KEY SHARE NOWAIT;
      IF NOT FOUND THEN CONTINUE; END IF;
      PERFORM 1 FROM public.tenant_messaging_connections connection WHERE connection.id=candidate.connection_id AND connection.tribe_id=candidate.tribe_id FOR UPDATE NOWAIT;
      IF NOT FOUND THEN CONTINUE; END IF;
      PERFORM 1 FROM public.messaging_connection_versions resource WHERE resource.connection_id=candidate.connection_id AND resource.tribe_id=candidate.tribe_id AND resource.version=candidate.connection_version FOR UPDATE NOWAIT;
      IF NOT FOUND THEN CONTINUE; END IF;
      SELECT envelope.key_id INTO original_key_id FROM public.messaging_secret_envelopes envelope WHERE envelope.secret_ref=candidate.secret_ref FOR UPDATE NOWAIT;
      IF NOT FOUND OR original_key_id<>candidate.key_id THEN CONTINUE; END IF;
      IF NOT public.messaging_secret_rotation_scope_is_current(candidate.secret_ref,candidate.tribe_id,candidate.connection_id,candidate.connection_version,requested_environment,requested_epoch,original_key_id) THEN CONTINUE; END IF;
      RETURN QUERY SELECT envelope.secret_ref,envelope.tribe_id,envelope.connection_id,envelope.connection_version,envelope.environment,envelope.security_epoch,envelope.key_id,envelope.format,envelope.iv,envelope.ciphertext
        FROM public.messaging_secret_envelopes envelope WHERE envelope.secret_ref=candidate.secret_ref;
    EXCEPTION WHEN lock_not_available THEN CONTINUE;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_messaging_secret_key_rotation(text,text,text,integer) FROM PUBLIC;

CREATE FUNCTION public.rotate_current_messaging_secret_material(
  requested_ref uuid,requested_tribe uuid,requested_connection uuid,requested_version integer,
  requested_environment text,requested_epoch text,expected_key_id text,next_key_id text,next_iv bytea,next_ciphertext bytea
) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NOT public.messaging_secret_rotation_scope_is_current(requested_ref,requested_tribe,requested_connection,requested_version,requested_environment,requested_epoch,expected_key_id) THEN RETURN false; END IF;
  IF NOT public.rewrap_messaging_secret_material(requested_ref,requested_tribe,requested_connection,requested_version,requested_environment,requested_epoch,expected_key_id,next_key_id,next_iv,next_ciphertext) THEN RETURN false; END IF;
  INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,cause,resource_version,metadata,created_at)
    VALUES(requested_tribe,NULL,'messaging_protection',requested_ref,NULL,'protection_keys_rotated','protection_keys_rotated',NULL,NULL,
      jsonb_build_object('purpose','credential','previousKeyId',expected_key_id,'activeKeyId',next_key_id,'securityEpoch',requested_epoch),clock_timestamp());
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_current_messaging_secret_material(uuid,uuid,uuid,integer,text,text,text,text,bytea,bytea) FROM PUBLIC;
