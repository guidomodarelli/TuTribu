-- A request-owned admission launch claims only its confirmed applicant challenge.
-- Contributor authority stays distinct from applicant identity; no global queue is drained.
CREATE FUNCTION public.claim_scoped_messaging_admission(
  requested_delivery uuid, requested_tribe uuid, requested_contributor text,
  requested_applicant text, requested_challenge uuid,
  requested_connection uuid, requested_version integer,
  requested_lease uuid, lease_seconds integer
) RETURNS TABLE(delivery_id uuid,delivery_version integer) LANGUAGE plpgsql AS $$
BEGIN
  IF requested_delivery IS NULL OR requested_tribe IS NULL OR requested_contributor IS NULL
    OR requested_applicant IS NULL OR requested_challenge IS NULL
    OR requested_connection IS NULL OR requested_version IS NULL OR requested_version<1
    OR requested_lease IS NULL OR lease_seconds IS NULL OR lease_seconds<1 OR lease_seconds>300 THEN
    RAISE EXCEPTION 'messaging admission claim parameters are invalid' USING ERRCODE='23514';
  END IF;
  IF public.current_app_user_id() IS DISTINCT FROM requested_contributor THEN RETURN; END IF;
  RETURN QUERY
  WITH claimable AS (
    SELECT delivery.id FROM public.message_deliveries delivery
    JOIN public.tenant_messaging_connections connection
      ON connection.id=delivery.connection_id AND connection.tribe_id=delivery.tribe_id
    JOIN public.contact_verification_challenges challenge
      ON challenge.id=requested_challenge AND challenge.delivery_id=delivery.id
        AND challenge.tribe_id=delivery.tribe_id AND challenge.user_id=requested_applicant
        AND challenge.connection_id=delivery.connection_id AND challenge.connection_version=delivery.connection_version
        AND challenge.purpose='admission' AND challenge.channel=delivery.channel
        AND challenge.security_epoch=delivery.security_epoch
        AND challenge.state='issued' AND challenge.is_current AND challenge.invalidated_at IS NULL
        AND challenge.expires_at>clock_timestamp() AND challenge.code_envelope_id IS NOT NULL
    WHERE delivery.id=requested_delivery AND delivery.tribe_id=requested_tribe
      AND delivery.source_resource_id=requested_challenge AND delivery.actor_user_id=requested_applicant
      AND delivery.connection_id=requested_connection AND delivery.connection_version=requested_version
      AND delivery.purpose='admission' AND connection.contributed_by_user_id=requested_contributor
      AND EXISTS(SELECT 1 FROM public.tribe_members member WHERE member.tribe_id=requested_tribe
        AND member.user_id=requested_contributor AND member.role='leader' AND member.status='active')
      AND NOT EXISTS(SELECT 1 FROM public.tribe_members member WHERE member.tribe_id=requested_tribe
        AND member.user_id<>requested_contributor AND member.role='leader' AND member.status='active')
      AND delivery.state='queued' AND delivery.due_at<=clock_timestamp() AND delivery.deadline_at>clock_timestamp()
      AND (delivery.lease_token IS NULL OR delivery.lease_until<=clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt WHERE attempt.delivery_id=delivery.id)
    FOR UPDATE OF delivery SKIP LOCKED
  )
  UPDATE public.message_deliveries delivery
    SET lease_token=requested_lease,lease_until=clock_timestamp()+lease_seconds*interval '1 second',version=delivery.version+1
    FROM claimable WHERE delivery.id=claimable.id
      AND delivery.state='queued' AND delivery.deadline_at>clock_timestamp()
      AND (delivery.lease_token IS NULL OR delivery.lease_until<=clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt WHERE attempt.delivery_id=delivery.id)
    RETURNING delivery.id,delivery.version;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_scoped_messaging_admission(uuid,uuid,text,text,uuid,uuid,integer,uuid,integer) FROM PUBLIC;
