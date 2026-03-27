CREATE TABLE public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  slug text NOT NULL UNIQUE
    CHECK (slug = lower(slug))
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status text NOT NULL CHECK (status IN ('active', 'muted', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (community_id, user_id)
);

CREATE UNIQUE INDEX idx_community_members_owner_per_community
ON public.community_members(community_id)
WHERE role = 'owner';

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_community_creator(target_community_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.communities
    WHERE communities.id = target_community_id
      AND communities.created_by = auth.uid()
  );
$$;

CREATE POLICY "Members can read own communities"
ON public.communities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.community_members
    WHERE community_members.community_id = communities.id
      AND community_members.user_id = auth.uid()
      AND community_members.status <> 'blocked'
  )
);

CREATE POLICY "Whitelisted users can create private communities"
ON public.communities
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND visibility = 'private'
  AND EXISTS (
    SELECT 1
    FROM public.community_creator_whitelist
    WHERE community_creator_whitelist.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

CREATE POLICY "Members can read own membership rows"
ON public.community_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Creators can create their initial owner membership"
ON public.community_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'owner'
  AND status = 'active'
  AND public.is_community_creator(community_id)
);
