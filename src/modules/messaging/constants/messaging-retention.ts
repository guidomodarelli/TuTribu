/** Names the aggregate secret-retention boundary without changing leaf SQL limits. @module messaging-retention-constants */
export const MESSAGING_SECRET_RETENTION = { operation: "purge_messaging_secrets", defaultRetiredSecretLimit: 100 } as const;
