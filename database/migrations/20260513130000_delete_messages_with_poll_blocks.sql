UPDATE public.message_polls
SET status = 'open',
    updated_at = timezone('utc', now())
WHERE status = 'closed';

DROP POLICY IF EXISTS "Authors leaders and guardians can delete tribe messages"
ON public.messages;

CREATE POLICY "Authors leaders and guardians can delete tribe messages"
ON public.messages
FOR DELETE
USING (
  (
    author_id = public.current_app_user_id()
    AND public.is_active_tribe_member(tribe_id)
  )
  OR public.can_pin_tribe_messages(tribe_id)
);
