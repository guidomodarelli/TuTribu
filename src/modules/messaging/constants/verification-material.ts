/** Bounds private destruction independently of provider calls, keys or code verification. @module verification-material-constants */
/** Matches the versioned SQL function's maximum work per invocation. */
export const VERIFICATION_MATERIAL_PURGE_LIMIT = { default: 100, maximum: 100 } as const;
/** Fixed backend purpose; it cannot be selected by an ordinary browser request. */
export const VERIFICATION_MATERIAL_PURGE_OPERATION = "purge_verification_material";
