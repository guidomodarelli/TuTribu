/** Names only synthetic setup limits and artifacts, without changing product policy. */
export const MESSAGING_NATIVE_ACTIVATION = {
  evidenceLifetimeMs: 540_000,
  nonceBytes: 32,
  returnPaths: { activation: "/synthetic-activation", refresh: "/synthetic-rotation" },
  intentState: "consumed",
  configuredVersion: 2,
  validatedVersion: 3,
  credentialMode: "production",
  nativeComputeUnits: 4,
  nativeTestTimeoutMs: 1_200_000,
  migrations: [
    "20261005092500_guard_messaging_attempts.sql",
    "20261005100000_guard_messaging_secret_retirement.sql",
    "20261006120000_index_messaging_contact_windows.sql",
    "20261006140000_claim_messaging_deliveries_fairly.sql",
    "20261006160000_purge_verification_delivery_material.sql",
    "20261006230000_bind_credential_validation_usage.sql",
    "20261007050000_claim_scoped_diagnostic_delivery.sql",
    "20261008161500_create_admission_email_settings.sql",
  ],
} as const;
