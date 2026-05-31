CREATE TABLE IF NOT EXISTS public.siteping_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  url text NOT NULL,
  url_pattern text,
  screenshot_url text,
  diagnostics jsonb,
  viewport text NOT NULL,
  user_agent text NOT NULL,
  author_name text NOT NULL,
  author_email text NOT NULL,
  client_id text NOT NULL,
  created_by text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  github_issue_status text NOT NULL DEFAULT 'pending',
  github_issue_number integer,
  github_issue_url text,
  github_issue_error text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

DROP INDEX IF EXISTS siteping_feedbacks_client_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS siteping_feedbacks_project_created_by_client_id_key
ON public.siteping_feedbacks(project_name, created_by, client_id);

CREATE INDEX IF NOT EXISTS idx_siteping_feedbacks_project_created_at
ON public.siteping_feedbacks(project_name, created_at);

CREATE INDEX IF NOT EXISTS idx_siteping_feedbacks_project_status_created_at
ON public.siteping_feedbacks(project_name, status, created_at);

CREATE INDEX IF NOT EXISTS idx_siteping_feedbacks_project_url
ON public.siteping_feedbacks(project_name, url);

CREATE TABLE IF NOT EXISTS public.siteping_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.siteping_feedbacks(id) ON DELETE CASCADE,
  css_selector text NOT NULL,
  xpath text NOT NULL,
  text_snippet text NOT NULL,
  element_tag text NOT NULL,
  element_id text,
  text_prefix text NOT NULL,
  text_suffix text NOT NULL,
  fingerprint text NOT NULL,
  neighbor_text text NOT NULL,
  anchor_key text,
  x_pct double precision NOT NULL,
  y_pct double precision NOT NULL,
  w_pct double precision NOT NULL,
  h_pct double precision NOT NULL,
  scroll_x double precision NOT NULL,
  scroll_y double precision NOT NULL,
  viewport_w integer NOT NULL,
  viewport_h integer NOT NULL,
  device_pixel_ratio double precision NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_siteping_annotations_feedback
ON public.siteping_annotations(feedback_id);

ALTER TABLE public.siteping_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siteping_feedbacks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.siteping_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siteping_annotations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own SitePing feedback" ON public.siteping_feedbacks;
CREATE POLICY "Users can manage own SitePing feedback"
ON public.siteping_feedbacks
FOR ALL
USING (created_by = public.current_app_user_id())
WITH CHECK (created_by = public.current_app_user_id());

DROP POLICY IF EXISTS "Users can manage annotations for own SitePing feedback" ON public.siteping_annotations;
CREATE POLICY "Users can manage annotations for own SitePing feedback"
ON public.siteping_annotations
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.siteping_feedbacks
    WHERE siteping_feedbacks.id = siteping_annotations.feedback_id
      AND siteping_feedbacks.created_by = public.current_app_user_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.siteping_feedbacks
    WHERE siteping_feedbacks.id = siteping_annotations.feedback_id
      AND siteping_feedbacks.created_by = public.current_app_user_id()
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.siteping_feedbacks TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.siteping_annotations TO authenticated;
  END IF;
END $$;
