-- Applied only by the exact owner of a disposable performance-validation branch.
CREATE SCHEMA native_test_support;
REVOKE ALL ON SCHEMA native_test_support FROM PUBLIC;

CREATE TABLE native_test_support.admission_distributed_cohorts (
  id uuid PRIMARY KEY,
  expected_branch text NOT NULL,
  tribe_id uuid NOT NULL,
  node_count integer NOT NULL CHECK (node_count > 0),
  release_at timestamptz
);

CREATE TABLE native_test_support.admission_distributed_nodes (
  cohort_id uuid NOT NULL REFERENCES native_test_support.admission_distributed_cohorts(id),
  node_index integer NOT NULL CHECK (node_index >= 0),
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','running','completed','failed')),
  ready_at timestamptz,
  measurement jsonb,
  PRIMARY KEY(cohort_id,node_index),
  CHECK ((state='completed')=(measurement IS NOT NULL))
);

REVOKE ALL ON TABLE native_test_support.admission_distributed_cohorts FROM PUBLIC;
REVOKE ALL ON TABLE native_test_support.admission_distributed_nodes FROM PUBLIC;
ALTER TABLE native_test_support.admission_distributed_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_test_support.admission_distributed_cohorts FORCE ROW LEVEL SECURITY;
ALTER TABLE native_test_support.admission_distributed_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_test_support.admission_distributed_nodes FORCE ROW LEVEL SECURITY;

CREATE POLICY admission_distributed_cohort_owner ON native_test_support.admission_distributed_cohorts FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='native_test_support.admission_distributed_cohorts'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='native_test_support.admission_distributed_cohorts'::regclass));
CREATE POLICY admission_distributed_node_owner ON native_test_support.admission_distributed_nodes FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='native_test_support.admission_distributed_nodes'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='native_test_support.admission_distributed_nodes'::regclass));
