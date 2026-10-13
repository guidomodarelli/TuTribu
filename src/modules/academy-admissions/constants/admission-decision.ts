/** Names immutable admission decision provenance separately from UI commands. @module admission-decision-constants */
export const ADMISSION_DECISION_ACTOR_KIND = { user: "user", system: "system" } as const;
/** Records the applied rule without treating a provider receipt as admission authority. */
export const ADMISSION_DECISION_RULE = { manualReview: "manual_review", applicantCancellation: "applicant_cancellation", managementCancellation: "management_cancellation", expired: "expired", automatic: "automatic", externalResolution: "external_resolution", academyUnavailable: "academy_unavailable", accountDeleted: "account_deleted", membershipDeleted: "membership_deleted", nonrecoverableMembership: "nonrecoverable_membership" } as const;
/** Records a reasoned correction without presenting it as another terminal decision. */
export const ADMISSION_RETRY_AUDIT = { event: "retry_allowed", rule: "leader_corrective_retry" } as const;
