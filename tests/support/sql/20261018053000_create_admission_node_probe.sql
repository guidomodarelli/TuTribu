-- This journal is applied only by an owner on its disposable validation branch.
CREATE SCHEMA native_test_support;
REVOKE ALL ON SCHEMA native_test_support FROM PUBLIC;
CREATE TABLE native_test_support.admission_node_runs (
  id uuid PRIMARY KEY,
  expected_branch text NOT NULL,
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','running','completed','failed')),
  measurement jsonb,
  fixture_tribe_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  CHECK((state='completed')=(measurement IS NOT NULL))
);
REVOKE ALL ON TABLE native_test_support.admission_node_runs FROM PUBLIC;
ALTER TABLE native_test_support.admission_node_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_test_support.admission_node_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY admission_node_owner ON native_test_support.admission_node_runs FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='native_test_support.admission_node_runs'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='native_test_support.admission_node_runs'::regclass));
