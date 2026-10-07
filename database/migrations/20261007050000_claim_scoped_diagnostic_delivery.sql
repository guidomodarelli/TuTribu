-- A request-driven diagnostic may claim only the exact committed obligation.
-- It never drains another tribe's queue or retries an existing external marker.
CREATE FUNCTION public.claim_scoped_messaging_diagnostic(
  requested_delivery uuid, requested_tribe uuid, requested_actor text,
  requested_connection uuid, requested_version integer,
  requested_lease uuid, lease_seconds integer
) RETURNS TABLE(delivery_id uuid,delivery_version integer) LANGUAGE plpgsql AS $$
BEGIN
  IF requested_delivery IS NULL OR requested_tribe IS NULL OR requested_actor IS NULL
    OR requested_connection IS NULL OR requested_version IS NULL OR requested_version<1
    OR requested_lease IS NULL OR lease_seconds IS NULL OR lease_seconds<1 OR lease_seconds>300 THEN
    RAISE EXCEPTION 'messaging diagnostic claim parameters are invalid' USING ERRCODE='23514';
  END IF;
  IF public.current_app_user_id() IS DISTINCT FROM requested_actor THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH claimable AS (
    SELECT delivery.id FROM public.message_deliveries delivery
    JOIN public.tenant_messaging_connections connection
      ON connection.id=delivery.connection_id AND connection.tribe_id=delivery.tribe_id
    JOIN public.messaging_connection_diagnostics diagnostic
      ON diagnostic.id=delivery.source_resource_id AND diagnostic.tribe_id=delivery.tribe_id
        AND diagnostic.connection_id=delivery.connection_id AND diagnostic.connection_version=delivery.connection_version
        AND diagnostic.leader_user_id=requested_actor AND diagnostic.outcome='pending'
    WHERE delivery.id=requested_delivery AND delivery.tribe_id=requested_tribe
      AND delivery.connection_id=requested_connection AND delivery.connection_version=requested_version
      AND delivery.actor_user_id=requested_actor AND delivery.purpose='connection_diagnostic'
      AND connection.contributed_by_user_id=requested_actor
      AND EXISTS(SELECT 1 FROM public.tribe_members member WHERE member.tribe_id=requested_tribe
        AND member.user_id=requested_actor AND member.role='leader' AND member.status='active')
      AND NOT EXISTS(SELECT 1 FROM public.tribe_members member WHERE member.tribe_id=requested_tribe
        AND member.user_id<>requested_actor AND member.role='leader' AND member.status='active')
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
REVOKE ALL ON FUNCTION public.claim_scoped_messaging_diagnostic(uuid,uuid,text,uuid,integer,uuid,integer) FROM PUBLIC;
