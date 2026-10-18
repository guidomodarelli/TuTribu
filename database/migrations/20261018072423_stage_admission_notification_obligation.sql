-- Coordinate the existing audited effects in one caller-owned transaction, without new authority.
CREATE FUNCTION public.stage_admission_notification_obligation(
  p_obligation_id uuid,p_tribe_id uuid,p_request_id uuid,p_applicant_user_id text,
  p_event_type text,p_audience text,p_operation_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE reviewer_ids text[]; recipient_id text;
BEGIN
  IF p_audience IS NULL OR p_audience NOT IN ('applicant','reviewer') THEN
    RAISE EXCEPTION 'stage_admission_notification_obligation failed: invalid_audience tribe_id=%',p_tribe_id USING ERRCODE='23514';
  END IF;
  PERFORM public.create_admission_notification_obligation(
    p_obligation_id,p_tribe_id,p_request_id,p_applicant_user_id,p_event_type,p_operation_id,NULL::timestamptz
  );
  IF p_audience='reviewer' THEN
    -- This separate VOLATILE statement sees rows committed during an earlier lock wait.
    -- Acquire all reviewer locks before enqueueing, in the original deterministic order.
    SELECT coalesce(array_agg(reviewer.user_id ORDER BY reviewer.user_id),ARRAY[]::text[])
      INTO reviewer_ids FROM (
        SELECT member.user_id FROM public.tribe_members member
          WHERE member.tribe_id=p_tribe_id AND member.role IN ('leader','guardian') AND member.status='active'
          ORDER BY member.user_id FOR SHARE
      ) reviewer;
    FOREACH recipient_id IN ARRAY reviewer_ids LOOP
      PERFORM public.enqueue_admission_notification(p_obligation_id,recipient_id,p_audience);
    END LOOP;
  ELSE
    PERFORM public.enqueue_admission_notification(p_obligation_id,p_applicant_user_id,p_audience);
  END IF;
END;
$$;
-- INVOKER retains the caller's existing child-function/table privileges, including dedicated roles.
-- An unprivileged caller cannot invoke the private child effects or gain direct table writes.
REVOKE ALL ON FUNCTION public.stage_admission_notification_obligation(uuid,uuid,uuid,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_admission_notification_obligation(uuid,uuid,uuid,text,text,text,uuid) TO PUBLIC;
