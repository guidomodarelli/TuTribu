/** Defines the native Google paths observed for private identity capture. */
export const AUTH_EVIDENCE_CAPTURE_PATH={callback:"/callback/:id",socialSignIn:"/sign-in/social"} as const;
/** Names the opaque intent reference in SDK-managed OAuth state, never an authority flag. */
export const AUTH_EVIDENCE_INTENT_STATE_KEY="reauthenticationIntentId";
/** Stable diagnostics that do not include provider errors, tokens or profile values. */
export const AUTH_EVIDENCE_CAPTURE_FAILURE={verification:"evidence_verification_failed",binding:"identity_binding_failed",lookup:"identity_context_lookup_failed",persistence:"capture_persistence_failed"} as const;
/** Classifies observed throws without retaining the original SDK error or payload. */
export const AUTH_EVIDENCE_FAILURE_KIND={exception:"exception",unknownThrow:"unknown_throw"} as const;
/** Gives every persistence diagnostic the same owning operation and safe message. */
export const AUTH_EVIDENCE_CAPTURE_LOG={feature:"auth",operation:"capture_global_identity",failureMessage:"Global identity capture remained unavailable after authentication."} as const;
