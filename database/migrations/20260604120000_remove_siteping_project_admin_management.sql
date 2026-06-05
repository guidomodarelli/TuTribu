-- Removes the SitePing "project admin" elevation so feedback management is
-- ownership-only. The base policy "Users can manage own SitePing feedback"
-- (created in 20260531120000_create_siteping_feedback.sql) keeps SELECT/UPDATE/
-- DELETE scoped to created_by = public.current_app_user_id(), so dropping the
-- admin policies and helper functions leaves each user able to see and delete
-- only their own tickets.

DROP POLICY IF EXISTS "SitePing project admins can manage project feedback" ON public.siteping_feedbacks;
DROP POLICY IF EXISTS "SitePing project admins can read project feedback" ON public.siteping_feedbacks;
DROP POLICY IF EXISTS "SitePing project admins can update project feedback" ON public.siteping_feedbacks;
DROP POLICY IF EXISTS "SitePing project admins can delete project feedback" ON public.siteping_feedbacks;

DROP POLICY IF EXISTS "SitePing project admins can manage project annotations" ON public.siteping_annotations;
DROP POLICY IF EXISTS "SitePing project admins can read project annotations" ON public.siteping_annotations;
DROP POLICY IF EXISTS "SitePing project admins can delete project annotations" ON public.siteping_annotations;

DROP FUNCTION IF EXISTS public.is_siteping_project_admin(project_name text);
DROP FUNCTION IF EXISTS public.current_siteping_project_name();
