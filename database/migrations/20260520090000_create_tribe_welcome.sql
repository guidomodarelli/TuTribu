CREATE TABLE IF NOT EXISTS public.tribe_welcome_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  welcome_message text NOT NULL DEFAULT 'Bienvenido/a a la tribu',
  updated_by text REFERENCES public."user"(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tribe_welcome_settings_message_not_blank_check
    CHECK (btrim(welcome_message) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS tribe_welcome_settings_tribe_key
ON public.tribe_welcome_settings(tribe_id);

CREATE TABLE IF NOT EXISTS public.tribe_welcome_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tribe_welcome_rules_label_not_blank_check
    CHECK (btrim(label) <> '')
);

CREATE INDEX IF NOT EXISTS idx_tribe_welcome_rules_tribe_sort
ON public.tribe_welcome_rules(tribe_id, sort_order);

CREATE TABLE IF NOT EXISTS public.tribe_welcome_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  type text NOT NULL,
  label text NOT NULL,
  url text,
  phone_number text,
  message text,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tribe_welcome_links_type_check
    CHECK (type IN ('custom_button', 'whatsapp_button')),
  CONSTRAINT tribe_welcome_links_label_not_blank_check
    CHECK (btrim(label) <> ''),
  CONSTRAINT tribe_welcome_links_url_or_whatsapp_check
    CHECK (
      (type = 'whatsapp_button' AND nullif(btrim(coalesce(phone_number, '')), '') IS NOT NULL)
      OR (type <> 'whatsapp_button' AND nullif(btrim(coalesce(url, '')), '') IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_tribe_welcome_links_tribe_sort
ON public.tribe_welcome_links(tribe_id, sort_order);

CREATE OR REPLACE FUNCTION public.can_manage_tribe_welcome(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status = 'active'
      AND tribe_members.role = 'leader'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_tribe_welcome(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_members
    WHERE tribe_members.tribe_id = target_tribe_id
      AND tribe_members.user_id = public.current_app_user_id()
      AND tribe_members.status IN ('active', 'muted')
  )
  OR EXISTS (
    SELECT 1
    FROM public.tribe_invitations
    WHERE tribe_invitations.tribe_id = target_tribe_id
      AND tribe_invitations.status = 'active'
      AND tribe_invitations.token_hash = current_setting(
        'app.current_invitation_hash',
        true
      )
  );
$$;

ALTER TABLE public.tribe_welcome_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_welcome_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_welcome_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_welcome_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_welcome_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_welcome_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members and active invitees can read welcome settings"
ON public.tribe_welcome_settings;
CREATE POLICY "Members and active invitees can read welcome settings"
ON public.tribe_welcome_settings
FOR SELECT
USING (public.can_read_tribe_welcome(tribe_id));

DROP POLICY IF EXISTS "Leaders can manage welcome settings"
ON public.tribe_welcome_settings;
CREATE POLICY "Leaders can manage welcome settings"
ON public.tribe_welcome_settings
FOR ALL
USING (public.can_manage_tribe_welcome(tribe_id))
WITH CHECK (public.can_manage_tribe_welcome(tribe_id));

DROP POLICY IF EXISTS "Members and active invitees can read welcome rules"
ON public.tribe_welcome_rules;
CREATE POLICY "Members and active invitees can read welcome rules"
ON public.tribe_welcome_rules
FOR SELECT
USING (public.can_read_tribe_welcome(tribe_id));

DROP POLICY IF EXISTS "Leaders can manage welcome rules"
ON public.tribe_welcome_rules;
CREATE POLICY "Leaders can manage welcome rules"
ON public.tribe_welcome_rules
FOR ALL
USING (public.can_manage_tribe_welcome(tribe_id))
WITH CHECK (public.can_manage_tribe_welcome(tribe_id));

DROP POLICY IF EXISTS "Members and active invitees can read welcome links"
ON public.tribe_welcome_links;
CREATE POLICY "Members and active invitees can read welcome links"
ON public.tribe_welcome_links
FOR SELECT
USING (public.can_read_tribe_welcome(tribe_id));

DROP POLICY IF EXISTS "Leaders can manage welcome links"
ON public.tribe_welcome_links;
CREATE POLICY "Leaders can manage welcome links"
ON public.tribe_welcome_links
FOR ALL
USING (public.can_manage_tribe_welcome(tribe_id))
WITH CHECK (public.can_manage_tribe_welcome(tribe_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.tribe_welcome_settings TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.tribe_welcome_rules TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.tribe_welcome_links TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_manage_tribe_welcome(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.can_read_tribe_welcome(uuid) TO authenticated;
  END IF;
END $$;
