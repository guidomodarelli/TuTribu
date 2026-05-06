ALTER TABLE public.messages
ALTER COLUMN created_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.messages
ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.message_replies
ALTER COLUMN created_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.message_reactions
ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
