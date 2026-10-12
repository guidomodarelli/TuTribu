-- Select only expired candidate versions under the existing tribe/connection/resource lock order.
-- The private adapter owns retirement, original deadlines, recovery and authority revalidation.
CREATE FUNCTION public.claim_expired_messaging_candidates(requested_limit integer DEFAULT 50)
RETURNS TABLE(connection_id uuid,tribe_id uuid,candidate_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>100 THEN
    RAISE EXCEPTION 'messaging candidate expiration batch is invalid' USING ERRCODE='23514';
  END IF;
  RETURN QUERY
    SELECT connection.id,connection.tribe_id,resource.version
    FROM public.tribes tribe
    JOIN public.tenant_messaging_connections connection ON connection.tribe_id=tribe.id
    JOIN public.messaging_connection_versions resource
      ON resource.connection_id=connection.id AND resource.tribe_id=connection.tribe_id
      AND resource.version=connection.candidate_version
    WHERE connection.is_candidate AND connection.candidate_version IS NOT NULL
      AND connection.retired_at IS NULL AND resource.retired_at IS NULL
      AND connection.selected_version IS DISTINCT FROM resource.version
      AND resource.last_activity_at<=clock_timestamp()-interval '168 hours'
    ORDER BY tribe.id,connection.id,resource.version
    LIMIT requested_limit
    FOR UPDATE OF tribe,connection,resource SKIP LOCKED;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_expired_messaging_candidates(integer) FROM PUBLIC;

CREATE INDEX messaging_abandoned_candidate_activity_idx
  ON public.messaging_connection_versions(last_activity_at,tribe_id,connection_id,version)
  WHERE retired_at IS NULL;
