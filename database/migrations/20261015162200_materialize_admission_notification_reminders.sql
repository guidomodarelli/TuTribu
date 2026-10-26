-- Materialize one logical reminder without changing the original pending request.
-- The protected maintenance owner supplies the outer transaction and commit result.
CREATE FUNCTION public.materialize_admission_notification_reminders(requested_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  reminder_delay CONSTANT interval=interval '72 hours';
  maximum_batch_size CONSTANT integer=100;
  candidate record;
  request_record public.academy_admission_requests%ROWTYPE;
  reviewer_record record;
  obligation_id uuid;
  server_now timestamptz;
  created_count integer=0;
BEGIN
  IF requested_limit IS NULL OR requested_limit<1 OR requested_limit>maximum_batch_size THEN
    RAISE EXCEPTION 'admission reminder materialization batch is invalid' USING ERRCODE='23514';
  END IF;

  -- Skip held fences before limiting available scopes, as other bounded owners do.
  FOR candidate IN
    SELECT tribe.id FROM public.tribes tribe
    WHERE EXISTS (
      SELECT 1 FROM public.academy_admission_requests request
      WHERE request.tribe_id=tribe.id AND request.status='pending'
        AND request.submitted_at<=clock_timestamp()-reminder_delay
        AND request.expires_at>clock_timestamp()
        AND NOT EXISTS (
          SELECT 1 FROM public.academy_admission_notification_obligations obligation
          WHERE obligation.request_id=request.id AND obligation.event_type='reminder'
        )
    )
    ORDER BY tribe.id LIMIT requested_limit FOR UPDATE OF tribe SKIP LOCKED
  LOOP
    -- Pin current recipients before request and obligation locks. No provider work occurs here.
    PERFORM member.id FROM public.tribe_members member
      WHERE member.tribe_id=candidate.id AND member.role IN ('leader','guardian') AND member.status='active'
      ORDER BY member.user_id FOR SHARE;

    FOR request_record IN
      SELECT request.* FROM public.academy_admission_requests request
      WHERE request.tribe_id=candidate.id AND request.status='pending'
        AND request.submitted_at<=clock_timestamp()-reminder_delay
        AND request.expires_at>clock_timestamp()
        AND NOT EXISTS (
          SELECT 1 FROM public.academy_admission_notification_obligations obligation
          WHERE obligation.request_id=request.id AND obligation.event_type='reminder'
        )
      ORDER BY request.submitted_at,request.id
      LIMIT requested_limit-created_count FOR UPDATE OF request SKIP LOCKED
    LOOP
      -- Recheck the native clock and logical original after all source/recipient waits.
      server_now=clock_timestamp();
      IF request_record.status<>'pending' OR request_record.submitted_at>server_now-reminder_delay
        OR request_record.expires_at<=server_now OR EXISTS (
          SELECT 1 FROM public.academy_admission_notification_obligations obligation
          WHERE obligation.request_id=request_record.id AND obligation.event_type='reminder'
        ) THEN CONTINUE; END IF;

      obligation_id=gen_random_uuid();
      PERFORM public.create_admission_notification_obligation(
        obligation_id,request_record.tribe_id,request_record.id,request_record.user_id,'reminder',NULL,server_now
      );
      FOR reviewer_record IN
        SELECT member.user_id FROM public.tribe_members member
        WHERE member.tribe_id=request_record.tribe_id AND member.role IN ('leader','guardian') AND member.status='active'
        ORDER BY member.user_id FOR SHARE
      LOOP
        PERFORM public.enqueue_admission_notification(obligation_id,reviewer_record.user_id,'reviewer');
      END LOOP;
      created_count=created_count+1;
    END LOOP;
    IF created_count>=requested_limit THEN EXIT; END IF;
  END LOOP;
  RETURN created_count;
END;
$$;
REVOKE ALL ON FUNCTION public.materialize_admission_notification_reminders(integer) FROM PUBLIC;
