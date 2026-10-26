-- Claim one eligible head per tribe so a saturated tenant cannot fill every slot.
CREATE INDEX messaging_delivery_tenant_due_idx ON public.message_deliveries(tribe_id,due_at,id) WHERE state='queued';

CREATE FUNCTION public.claim_messaging_deliveries_fairly(requested_lease uuid,requested_limit integer,lease_seconds integer)
RETURNS TABLE(delivery_id uuid,delivery_version integer) LANGUAGE plpgsql AS $$
BEGIN
  IF requested_lease IS NULL OR requested_limit IS NULL OR requested_limit<1 OR requested_limit>100
    OR lease_seconds IS NULL OR lease_seconds<1 OR lease_seconds>300 THEN
    RAISE EXCEPTION 'messaging fair claim parameters are invalid' USING ERRCODE='23514';
  END IF;
  RETURN QUERY
  WITH tenant_heads AS (
    SELECT DISTINCT ON (delivery.tribe_id) delivery.id,delivery.tribe_id,delivery.due_at
    FROM public.message_deliveries delivery
    WHERE delivery.state='queued' AND delivery.due_at<=clock_timestamp() AND delivery.deadline_at>clock_timestamp()
      AND (delivery.lease_token IS NULL OR delivery.lease_until<=clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt WHERE attempt.delivery_id=delivery.id)
    ORDER BY delivery.tribe_id,delivery.due_at,delivery.id
  ), claimable AS (
    SELECT delivery.id FROM tenant_heads head JOIN public.message_deliveries delivery ON delivery.id=head.id
    WHERE delivery.state='queued' AND delivery.due_at<=clock_timestamp() AND delivery.deadline_at>clock_timestamp()
      AND (delivery.lease_token IS NULL OR delivery.lease_until<=clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt WHERE attempt.delivery_id=delivery.id)
    ORDER BY head.due_at,head.tribe_id,head.id FOR UPDATE OF delivery SKIP LOCKED LIMIT requested_limit
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
REVOKE ALL ON FUNCTION public.claim_messaging_deliveries_fairly(uuid,integer,integer) FROM PUBLIC;
