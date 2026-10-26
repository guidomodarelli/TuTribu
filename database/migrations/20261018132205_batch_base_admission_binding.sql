-- Preserve the existing advisory namespace and ordered READ COMMITTED snapshots.
-- These helpers group transport only and retain all caller privileges and RLS.
CREATE FUNCTION public.prepare_base_admission_contact_binding(
  requested_tribe_id uuid,requested_contact_type text,
  requested_normalized_contact text,requested_lock_scope text
)
RETURNS TABLE(binding_id uuid,binding_owner_user_id text,has_minimized_bindings boolean)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE
  locked_binding_id uuid;
  locked_owner_user_id text;
  minimized_bindings_exist boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(requested_lock_scope,0));

  SELECT binding.id,binding.owner_user_id INTO locked_binding_id,locked_owner_user_id
  FROM public.academy_admission_contact_bindings binding
  WHERE binding.tribe_id=requested_tribe_id
    AND binding.contact_type=requested_contact_type
    AND binding.normalized_contact=requested_normalized_contact
  FOR UPDATE;

  SELECT EXISTS(
    SELECT 1 FROM public.academy_admission_contact_bindings binding
    WHERE binding.tribe_id=requested_tribe_id
      AND binding.contact_type=requested_contact_type
      AND binding.normalized_contact IS NULL
  ) INTO minimized_bindings_exist;

  RETURN QUERY SELECT locked_binding_id,locked_owner_user_id,minimized_bindings_exist;
END;
$function$;

CREATE FUNCTION public.write_base_admission_contact_binding(
  requested_tribe_id uuid,requested_user_id text,requested_request_id uuid,
  requested_request_version integer,requested_contact_type text,
  requested_normalized_contact text,requested_evidence_id uuid,
  requested_fingerprint bytea,requested_fingerprint_key_id text,
  existing_binding_id uuid
)
RETURNS TABLE(request_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE
  staged_binding_id uuid := existing_binding_id;
BEGIN
  IF staged_binding_id IS NULL THEN
    INSERT INTO public.academy_admission_contact_bindings(
      tribe_id,contact_type,normalized_contact,contact_fingerprint,
      fingerprint_key_id,owner_user_id,first_request_id,evidence_source
    ) VALUES (
      requested_tribe_id,requested_contact_type,requested_normalized_contact,
      requested_fingerprint,requested_fingerprint_key_id,requested_user_id,
      requested_request_id,'base'
    ) RETURNING id INTO staged_binding_id;
  END IF;

  RETURN QUERY UPDATE public.academy_admission_requests request
  SET evidence_source='base',global_identity_evidence_id=requested_evidence_id,
    binding_id=staged_binding_id,contact_fingerprint=requested_fingerprint,
    fingerprint_key_id=requested_fingerprint_key_id,version=request.version+1
  WHERE request.id=requested_request_id AND request.tribe_id=requested_tribe_id
    AND request.user_id=requested_user_id AND request.status='pending'
    AND request.version=requested_request_version AND request.expires_at>clock_timestamp()
  RETURNING request.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_base_admission_contact_binding(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_base_admission_contact_binding(uuid,text,text,text) TO PUBLIC;
REVOKE ALL ON FUNCTION public.write_base_admission_contact_binding(uuid,text,uuid,integer,text,text,uuid,bytea,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_base_admission_contact_binding(uuid,text,uuid,integer,text,text,uuid,bytea,text,uuid) TO PUBLIC;
