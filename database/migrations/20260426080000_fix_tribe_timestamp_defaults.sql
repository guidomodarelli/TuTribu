ALTER TABLE public.tribes
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.tribe_members
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now());

ALTER TABLE public.tribe_channels
  ALTER COLUMN created_at SET DEFAULT timezone('utc', now()),
  ALTER COLUMN updated_at SET DEFAULT timezone('utc', now());
