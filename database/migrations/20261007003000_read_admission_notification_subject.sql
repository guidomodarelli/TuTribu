-- Project only an authorized recipient's admission subject when ordinary tribes RLS hides preadmission.
CREATE FUNCTION public.read_admission_notification_subject(p_notification_id uuid)
RETURNS TABLE (request_id uuid,audience text,tribe_name text,tribe_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT obligation.request_id,notification.admission_audience,tribe.name,tribe.slug
  FROM public.notifications notification
  JOIN public.academy_admission_notification_obligations obligation
    ON obligation.id=notification.admission_obligation_id AND obligation.tribe_id=notification.tribe_id
  JOIN public.tribes tribe ON tribe.id=notification.tribe_id
  WHERE notification.id=p_notification_id AND notification.recipient_user_id=public.current_app_user_id()
    AND public.can_read_admission_notification(notification.admission_obligation_id,notification.admission_audience);
$$;
REVOKE ALL ON FUNCTION public.read_admission_notification_subject(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_admission_notification_subject(uuid) TO PUBLIC;
