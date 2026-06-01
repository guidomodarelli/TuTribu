CREATE OR REPLACE FUNCTION public.current_siteping_project_name()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.siteping_project_name', true), '');
$$;

CREATE OR REPLACE FUNCTION public.is_siteping_project_admin(project_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.siteping_project_admin', true), '') = 'true'
    AND project_name = public.current_siteping_project_name();
$$;

DROP POLICY IF EXISTS "SitePing project admins can manage project feedback" ON public.siteping_feedbacks;
DROP POLICY IF EXISTS "SitePing project admins can read project feedback" ON public.siteping_feedbacks;
CREATE POLICY "SitePing project admins can read project feedback"
ON public.siteping_feedbacks
FOR SELECT
USING (public.is_siteping_project_admin(project_name));

DROP POLICY IF EXISTS "SitePing project admins can update project feedback" ON public.siteping_feedbacks;
CREATE POLICY "SitePing project admins can update project feedback"
ON public.siteping_feedbacks
FOR UPDATE
USING (public.is_siteping_project_admin(project_name))
WITH CHECK (public.is_siteping_project_admin(project_name));

DROP POLICY IF EXISTS "SitePing project admins can delete project feedback" ON public.siteping_feedbacks;
CREATE POLICY "SitePing project admins can delete project feedback"
ON public.siteping_feedbacks
FOR DELETE
USING (public.is_siteping_project_admin(project_name));

DROP POLICY IF EXISTS "SitePing project admins can manage project annotations" ON public.siteping_annotations;
DROP POLICY IF EXISTS "SitePing project admins can read project annotations" ON public.siteping_annotations;
CREATE POLICY "SitePing project admins can read project annotations"
ON public.siteping_annotations
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.siteping_feedbacks
    WHERE siteping_feedbacks.id = siteping_annotations.feedback_id
      AND public.is_siteping_project_admin(siteping_feedbacks.project_name)
  )
);

DROP POLICY IF EXISTS "SitePing project admins can delete project annotations" ON public.siteping_annotations;
CREATE POLICY "SitePing project admins can delete project annotations"
ON public.siteping_annotations
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.siteping_feedbacks
    WHERE siteping_feedbacks.id = siteping_annotations.feedback_id
      AND public.is_siteping_project_admin(siteping_feedbacks.project_name)
  )
);
