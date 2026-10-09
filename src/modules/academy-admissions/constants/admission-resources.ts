/** Names mutable resource states and input validation categories without exposing private facts. */
export const ALLOWLIST_ENTRY_STATUS = { enabled: "enabled", disabled: "disabled" } as const;
export const ALLOWLIST_ENTRY_SOURCE = { manual: "manual", csv: "csv" } as const;
export const ADMISSION_INPUT_CATEGORY = {
  version: "admission_version_invalid", operation: "admission_operation_invalid",
  confirmation: "admission_confirmation_required", country: "admission_country_invalid",
  contact: "admission_contact_invalid", duplicateContact: "admission_contact_duplicate",
  name: "admission_name_invalid", fields: "admission_mutation_fields_required",
} as const;
