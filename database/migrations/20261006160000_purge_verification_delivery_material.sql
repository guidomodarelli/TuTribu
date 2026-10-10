-- Backend-only bounded destruction. Code MAC and transport history are not evidence of each other.
CREATE FUNCTION public.purge_messaging_verification_envelopes(requested_limit integer DEFAULT 100, requested_delivery uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE candidate record; delivery_record public.message_deliveries%ROWTYPE;
  challenge_record public.contact_verification_challenges%ROWTYPE;
  envelope_record public.verification_code_envelopes%ROWTYPE; server_now timestamptz; purged_count integer=0;
BEGIN
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>100 THEN
    RAISE EXCEPTION 'verification material purge batch is invalid' USING ERRCODE='23514';
  END IF;
  -- Lock delivery before challenge/envelope, consistently with issue/resend and marker writers.
  FOR candidate IN
    SELECT envelope.id,envelope.delivery_id
    FROM public.verification_code_envelopes envelope
    INNER JOIN public.contact_verification_challenges challenge ON challenge.id=envelope.challenge_id AND challenge.tribe_id=envelope.tribe_id
    INNER JOIN public.message_deliveries delivery ON delivery.id=envelope.delivery_id AND delivery.tribe_id=envelope.tribe_id
    WHERE (requested_delivery IS NULL OR delivery.id=requested_delivery) AND (
      envelope.expires_at<=clock_timestamp() OR challenge.state<>'issued' OR NOT challenge.is_current
      OR challenge.invalidated_at IS NOT NULL OR challenge.code_envelope_id IS DISTINCT FROM envelope.id
      OR delivery.state IN ('accepted','delivered','cancelled')
    )
    ORDER BY envelope.expires_at,envelope.id LIMIT requested_limit FOR UPDATE OF delivery SKIP LOCKED
  LOOP
    SELECT * INTO delivery_record FROM public.message_deliveries WHERE id=candidate.delivery_id FOR UPDATE;
    SELECT * INTO challenge_record FROM public.contact_verification_challenges WHERE delivery_id=candidate.delivery_id AND tribe_id=delivery_record.tribe_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT * INTO envelope_record FROM public.verification_code_envelopes WHERE id=candidate.id AND challenge_id=challenge_record.id AND delivery_id=delivery_record.id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    server_now=clock_timestamp();
    IF envelope_record.expires_at>server_now AND challenge_record.state='issued' AND challenge_record.is_current
       AND challenge_record.invalidated_at IS NULL AND challenge_record.code_envelope_id=envelope_record.id
       AND delivery_record.state NOT IN ('accepted','delivered','cancelled') THEN CONTINUE; END IF;
    IF challenge_record.code_envelope_id=envelope_record.id THEN
      UPDATE public.contact_verification_challenges SET code_envelope_id=NULL,version=version+1 WHERE id=challenge_record.id;
    END IF;
    DELETE FROM public.verification_code_envelopes WHERE id=envelope_record.id;
    purged_count=purged_count+1;
  END LOOP;
  RETURN purged_count;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_messaging_verification_envelopes(integer,uuid) FROM PUBLIC;
