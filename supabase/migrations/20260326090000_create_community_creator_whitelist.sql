CREATE TABLE public.community_creator_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(trim(email))),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.community_creator_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own creator whitelist entry"
ON public.community_creator_whitelist
FOR SELECT
TO authenticated
USING (
  email = lower(coalesce(auth.jwt() ->> 'email', ''))
);
