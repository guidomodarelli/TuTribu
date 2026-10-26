/** Defines private identity writer outcomes independently of Google claim authority. */
export const GLOBAL_IDENTITY_CAPTURE_STATUS={stored:"stored",identityMismatch:"identity_mismatch"} as const;
/** Records why a previous capture ceased being the current account capture. */
export const GLOBAL_IDENTITY_CAPTURE_INVALIDATION_REASON={superseded:"superseded_capture"} as const;
