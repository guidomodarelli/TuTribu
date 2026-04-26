ALTER TABLE public.posts
ALTER COLUMN created_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.posts
ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.post_comments
ALTER COLUMN created_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.post_reactions
ALTER COLUMN created_at SET DEFAULT timezone('utc', now());
