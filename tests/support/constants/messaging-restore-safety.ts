/** Bounds native recovery scenarios without changing the global test runner. @module messaging-restore-safety-constants */

/** Bounds the complete cold-schema preparation and recovery scenario, independently of product deadlines. */
export const MESSAGING_RESTORE_SAFETY_TEST_TIMEOUT_MS = 2_700_000;

/** Keeps synthetic global sessions live while the bounded restore scenario runs. */
export const MESSAGING_RESTORE_APPLICANT_SESSION_LIFETIME_MS = 3_600_000;

/** Names safe progress events only after the corresponding native stage completes. */
export type MessagingRestoreSafetyPhase = "initializing" | "source_prepared" | "checkpoint_prepared" | "copy_ready" | "retirement_confirmed" | "restored" | "recovery_lock_checked" | "external_epoch_checked" | "retired_key_checked" | "recovery_reconciled" | "replacement_prepared" | "fresh_challenge_issued" | "fresh_dispatch_completed" | "fresh_proof_confirmed" | "fresh_request_submitted" | "fresh_decision_completed" | "fresh_admission_confirmed";
/** Keeps long native runs observable without recording identity, material, payloads or recipients. */
export const MESSAGING_RESTORE_SAFETY_PHASE = {
  initializing: "initializing", sourcePrepared: "source_prepared", checkpointPrepared: "checkpoint_prepared",
  copyReady: "copy_ready", retirementConfirmed: "retirement_confirmed", restored: "restored",
  recoveryLockChecked: "recovery_lock_checked", externalEpochChecked: "external_epoch_checked", retiredKeyChecked: "retired_key_checked",
  recoveryReconciled: "recovery_reconciled", replacementPrepared: "replacement_prepared", freshAdmissionConfirmed: "fresh_admission_confirmed",
  freshChallengeIssued: "fresh_challenge_issued", freshDispatchCompleted: "fresh_dispatch_completed", freshProofConfirmed: "fresh_proof_confirmed", freshRequestSubmitted: "fresh_request_submitted", freshDecisionCompleted: "fresh_decision_completed",
} satisfies Record<string, MessagingRestoreSafetyPhase>;
