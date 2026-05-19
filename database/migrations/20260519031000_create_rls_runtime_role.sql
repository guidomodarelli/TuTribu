DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'tutribu_rls_app'
  ) THEN
    CREATE ROLE tutribu_rls_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO tutribu_rls_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tutribu_rls_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO tutribu_rls_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tutribu_rls_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO tutribu_rls_app;

DO $$
BEGIN
  EXECUTE format('GRANT tutribu_rls_app TO %I', current_user);
END
$$;
