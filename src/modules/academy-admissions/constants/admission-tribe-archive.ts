/** Names private minimized provenance retained after physical tribe deletion. @module admission-tribe-archive-constants */
export const ADMISSION_TRIBE_ARCHIVE_DATABASE = {
  bindings: {
    tableName: "academy_admission_retired_bindings",
    scopeConstraint: "admission_retired_binding_scope_key",
    timeConstraint: "admission_retired_binding_time_check",
    contactConstraint: "academy_admission_retired_bindings_contact_type_check",
    contactIndex: "admission_retired_binding_contact_idx",
  },
  operations: {
    tableName: "academy_admission_retired_operations",
    scopeConstraint: "admission_retired_operation_scope_key",
    timeConstraint: "admission_retired_operation_time_check",
    versionConstraint: "academy_admission_retired_operations_version_check",
  },
  auditEvents: {
    tableName: "academy_admission_retired_audit_events",
    operationConstraint: "admission_retired_audit_operation_fkey",
    timeConstraint: "admission_retired_audit_time_check",
    historyIndex: "admission_retired_audit_history_idx",
  },
} as const;
