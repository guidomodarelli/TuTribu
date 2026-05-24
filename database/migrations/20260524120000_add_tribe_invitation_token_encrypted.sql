ALTER TABLE public.tribe_invitations
  ADD COLUMN IF NOT EXISTS token_encrypted text;
