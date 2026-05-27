DROP POLICY IF EXISTS "Authors can update own tribe messages"
ON public.messages;

CREATE POLICY "Authors can update own tribe messages"
ON public.messages
FOR UPDATE
USING (
  author_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
)
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
);
