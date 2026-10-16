/** Owns synthetic integration boundaries and safe phase names for batch HTTP validation. @module admission-batch-validation */
/** Keeps the independent fifty-row contract and diagnostic artifacts outside production behavior. */
export const ADMISSION_BATCH_HTTP_VALIDATION = {
  maximumSelection: 50,
  requestTimeoutMs: 120_000,
  testTimeoutMs: 600_000,
  artifactEnvironment: "ADMISSION_BATCH_HTTP_ARTIFACT_ROOT",
  proofFile: "batch-http-proof.json",
  failureFile: "batch-http-failure.json",
  stages: {
    prepare: "prepare_owned_database",
    bootstrap: "bootstrap_native_reviewers",
    server: "start_actual_next_server",
    mixed: "confirm_mixed_original",
    recovery: "recover_without_claiming",
    maximum: "confirm_fifty_selected_versions",
    overflow: "reject_unconfirmed_overflow_and_authority",
    role: "recheck_current_reviewer_before_replay",
    session: "recheck_expired_native_session",
    effects: "verify_exact_committed_effects",
    complete: "complete_native_http_validation",
  },
} as const;
