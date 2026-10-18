/** Bounds and classifies diagnostics without exposing private native failures. */
export const MESSAGING_NODE_HOST_FAILURE = {
  ownFailurePattern: /^Messaging(?:RestoreNode(?:Phase)?|NativeActivation)\.[A-Za-z]+ failed: (?<detail>[A-Za-z_]+)$/,
  maximumCauseDepth: 8,
  phaseFailed: "native_phase_failed",
  privateInputInvalid: "private_input_invalid",
  errorName: "MessagingNodeHostFailure",
  unknownName: "unknown",
  safeNames: ["Error", "AggregateError", "AssertionError", "TypeError", "RangeError", "ZodError", "AcademyAdmissionRestoreError", "AcademyAdmissionDatabaseError", "MessagingNodeHostFailure"] as readonly string[],
} as const;
