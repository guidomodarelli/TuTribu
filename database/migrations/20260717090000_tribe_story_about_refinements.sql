-- Tribe story "About" refinements:
--   1. Free open join reactivation: a previously removed member of a free tribe
--      can re-enter through the tokenless free open join (mirrors the free
--      invitation recovery policy). Conduct-blocked members stay excluded
--      because the USING clause only matches 'removed' rows and
--      can_open_join_tribe_free rejects conduct-blocked viewers.
--   2. Orphan sweep for tribe_story_images: reserved drafts that were never
--      attached (or were detached by a later save) are reclaimed by the
--      scheduled maintenance sweep, mirroring the message_images cleanup.
--      Owner-exception policies keep the definer crossings working on
--      deployments whose table owner lacks BYPASSRLS (same pattern as
--      20260609150000).
--   3. Public story slugs for the sitemap: joinable tribes with a written
--      story are exposed to crawlers.
--   4. Online members: names and avatars of recently seen members, readable
--      only by members (visitors just get the count from the stats function).

-- 1. Free open join reactivation from removed memberships.
DROP POLICY IF EXISTS "Authenticated users can reactivate memberships via free open join"
ON public.tribe_members;
CREATE POLICY "Authenticated users can reactivate memberships via free open join"
ON public.tribe_members
FOR UPDATE
USING (
  user_id = public.current_app_user_id()
  AND status = 'removed'
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND role = 'tribemate'
  AND status = 'active'
  AND status_reason = 'none'
  AND joined_via = 'free_open_join'
  AND public.can_open_join_tribe_free(tribe_id)
);

-- 2. Orphan sweep for reserved story image drafts.
--
-- A draft is abandoned when it stayed detached for longer than the retention
-- window: either the leader never saved, or a later save stopped referencing
-- it (the save demotes unreferenced uploads back to 'draft'). The function
-- deletes the rows and returns the Cloudflare ids so the maintenance adapter
-- can delete the remote assets best-effort. It is a maintenance-only crossing:
-- EXECUTE stays revoked from PUBLIC and is never granted to the app role.
CREATE OR REPLACE FUNCTION public.reclaim_abandoned_tribe_story_images(
  max_batch integer
)
RETURNS TABLE (
  id uuid,
  cloudflare_image_id text
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.tribe_story_images
  WHERE tribe_story_images.id IN (
    SELECT abandoned_images.id
    FROM public.tribe_story_images AS abandoned_images
    WHERE abandoned_images.status = 'draft'
      AND abandoned_images.updated_at < timezone('utc', now()) - interval '24 hours'
    ORDER BY abandoned_images.updated_at ASC
    LIMIT max_batch
  )
  RETURNING tribe_story_images.id, tribe_story_images.cloudflare_image_id;
$$;

-- Owner-exception crossings so the definer sweep also works when the table
-- owner is an ordinary role WITHOUT BYPASSRLS (FORCE RLS applies to it). On
-- Neon (owner with BYPASSRLS) these policies are a no-op.
DROP POLICY IF EXISTS "Owner maintenance can read tribe story images"
ON public.tribe_story_images;
CREATE POLICY "Owner maintenance can read tribe story images"
ON public.tribe_story_images
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.tribe_story_images'::regclass
  )
);

DROP POLICY IF EXISTS "Owner maintenance can delete tribe story images"
ON public.tribe_story_images;
CREATE POLICY "Owner maintenance can delete tribe story images"
ON public.tribe_story_images
FOR DELETE
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.tribe_story_images'::regclass
  )
);

-- 3. Public story slugs for the sitemap: tribes with a written story that a
-- visitor could join (live paid offer or enabled free open join).
CREATE OR REPLACE FUNCTION public.list_public_tribe_story_slugs()
RETURNS TABLE (
  slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tribes.slug
  FROM public.tribes
  INNER JOIN public.tribe_story_settings
    ON tribe_story_settings.tribe_id = tribes.id
  WHERE public.can_open_join_tribe_free(tribes.id)
    OR EXISTS (
      SELECT 1
      FROM public.tribe_subscription_prices
      WHERE tribe_subscription_prices.tribe_id = tribes.id
        AND tribes.free_join_is_current = false
        AND tribe_subscription_prices.status = 'active'
        AND tribe_subscription_prices.is_current = true
        AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
    )
  ORDER BY tribes.slug ASC;
$$;

-- 4. Online members (names and avatars) for the about side panel, readable
-- only by members of the tribe; visitors keep just the aggregated count.
CREATE OR REPLACE FUNCTION public.tribe_story_about_online_members(
  target_tribe_slug text
)
RETURNS TABLE (
  name text,
  image text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    "user".name,
    "user".image
  FROM public.tribes
  INNER JOIN public.tribe_members
    ON tribe_members.tribe_id = tribes.id
  INNER JOIN public."user"
    ON "user".id = tribe_members.user_id
  WHERE tribes.slug = target_tribe_slug
    AND public.can_read_tribe_story(tribes.id)
    AND tribe_members.status IN ('active', 'muted')
    AND tribe_members.last_seen_at > timezone('utc', now()) - interval '5 minutes'
  ORDER BY tribe_members.last_seen_at DESC
  LIMIT 8;
$$;

REVOKE ALL ON FUNCTION public.reclaim_abandoned_tribe_story_images(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_tribe_story_slugs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tribe_story_about_online_members(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.list_public_tribe_story_slugs() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.tribe_story_about_online_members(text) TO authenticated;
  END IF;
END $$;
