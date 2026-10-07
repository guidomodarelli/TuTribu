/** Names platform-owned hosting settings independently of per-tribe provider credentials. @module messaging-hosting-constants */
export const MESSAGING_HOSTING_ENV = { environment: "MESSAGING_SECURITY_ENVIRONMENT", securityEpoch: "MESSAGING_SECURITY_EPOCH", recoveryLock: "MESSAGING_RECOVERY_LOCK", keyrings: "MESSAGING_KEYRINGS_JSON" } as const;
/** Unknown recovery configuration closes new work; only these explicit values are recognized. */
export const MESSAGING_RECOVERY_LOCK_VALUE = { locked: "true", unlocked: "false" } as const;
