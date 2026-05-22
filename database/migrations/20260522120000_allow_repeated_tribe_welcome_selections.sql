DROP INDEX IF EXISTS public.tribe_welcome_selections_link_user_key;

CREATE INDEX IF NOT EXISTS idx_tribe_welcome_selections_link_user
ON public.tribe_welcome_selections(welcome_link_id, user_id);
