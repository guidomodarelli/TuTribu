CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '');
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lower(trim(coalesce(nullif(current_setting('app.current_user_email', true), ''), '')));
$$;

DROP POLICY IF EXISTS "Users can read own creator whitelist entry"
ON public.community_creator_whitelist;

DROP POLICY IF EXISTS "Members can read own communities"
ON public.communities;

DROP POLICY IF EXISTS "Whitelisted users can create private communities"
ON public.communities;

DROP POLICY IF EXISTS "Members can read own membership rows"
ON public.community_members;

DROP POLICY IF EXISTS "Creators can create their initial owner membership"
ON public.community_members;

ALTER TABLE public.community_creator_whitelist
DROP CONSTRAINT IF EXISTS community_creator_whitelist_created_by_fkey;

ALTER TABLE public.communities
DROP CONSTRAINT IF EXISTS communities_created_by_fkey;

ALTER TABLE public.community_members
DROP CONSTRAINT IF EXISTS community_members_user_id_fkey;

ALTER TABLE public.community_creator_whitelist
ALTER COLUMN created_by TYPE text USING created_by::text;

ALTER TABLE public.communities
ALTER COLUMN created_by TYPE text USING created_by::text;

ALTER TABLE public.community_members
ALTER COLUMN user_id TYPE text USING user_id::text;

ALTER TABLE public.community_creator_whitelist
ADD CONSTRAINT community_creator_whitelist_created_by_fkey
FOREIGN KEY (created_by) REFERENCES public."user"(id);

ALTER TABLE public.communities
ADD CONSTRAINT communities_created_by_fkey
FOREIGN KEY (created_by) REFERENCES public."user"(id);

ALTER TABLE public.community_members
ADD CONSTRAINT community_members_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE public.community_creator_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_creator_whitelist FORCE ROW LEVEL SECURITY;

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities FORCE ROW LEVEL SECURITY;

ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members FORCE ROW LEVEL SECURITY;

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
      AND communities.created_by = public.current_app_user_id()
  );
$$;

CREATE POLICY "Users can read own creator whitelist entry"
ON public.community_creator_whitelist
FOR SELECT
USING (
  email = public.current_app_user_email()
);

CREATE POLICY "Members can read own communities"
ON public.communities
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.community_members
    WHERE community_members.community_id = communities.id
      AND community_members.user_id = public.current_app_user_id()
      AND community_members.status <> 'blocked'
  )
);

CREATE POLICY "Whitelisted users can create private communities"
ON public.communities
FOR INSERT
WITH CHECK (
  created_by = public.current_app_user_id()
  AND visibility = 'private'
  AND EXISTS (
    SELECT 1
    FROM public.community_creator_whitelist
    WHERE community_creator_whitelist.email = public.current_app_user_email()
  )
);

CREATE POLICY "Members can read own membership rows"
ON public.community_members
FOR SELECT
USING (user_id = public.current_app_user_id());

CREATE POLICY "Creators can create their initial owner membership"
ON public.community_members
FOR INSERT
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'owner'
  AND status = 'active'
  AND public.is_community_creator(community_id)
);

CREATE OR REPLACE FUNCTION public.get_current_community_membership_status_by_slug(
  target_slug text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT community_members.status
  FROM public.community_members
  INNER JOIN public.communities
    ON communities.id = community_members.community_id
  WHERE communities.slug = lower(trim(target_slug))
    AND community_members.user_id = public.current_app_user_id()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_community_membership_status_by_slug(text)
TO public;

CREATE OR REPLACE FUNCTION public.is_community_slug_taken(target_slug text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.community_creator_whitelist
      WHERE community_creator_whitelist.email = public.current_app_user_email()
    )
    AND EXISTS (
      SELECT 1
      FROM public.communities
      WHERE communities.slug = lower(trim(target_slug))
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_community_slug_taken(text)
TO public;

DROP FUNCTION IF EXISTS public.create_private_community_with_owner_membership(
  text,
  text,
  uuid
);
