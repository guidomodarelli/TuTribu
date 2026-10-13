/**
 * Names the global recency window and closed outcomes for sensitive operations.
 *
 * @module recent-authentication-constants
 */
import { MILLISECONDS_PER_SECOND, SECONDS_PER_MINUTE } from "@/src/constants/time";
const RECENT_AUTHENTICATION_MINUTES = 10;
export const RECENT_AUTHENTICATION_WINDOW_MS = RECENT_AUTHENTICATION_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
export const RECENT_AUTHENTICATION_REASON = {
  required: "recent_authentication_required",
  scopeMismatch: "recent_authentication_scope_mismatch",
  intentUnusable: "reauthentication_intent_unusable",
  sessionInactive: "session_inactive",
  leaderChanged: "leader_changed",
} as const;
export const GLOBAL_REAUTHENTICATION_INTENT_STATE = {
  created: "created", authorizing: "authorizing", consumed: "consumed", expired: "expired",
} as const;
/** Fields that bind evidence to a sensitive operation instead of a generic login marker. */
export const RECENT_AUTHENTICATION_SCOPE_FIELDS = ["userId", "sessionId", "accountId", "subject", "tribeId", "operation", "resourceId"] as const;
/** Gives the global OAuth nonce 256 unpredictable bits without storing it in plaintext. */
export const GLOBAL_REAUTHENTICATION_NONCE_BYTES=32;
export const GLOBAL_REAUTHENTICATION_NONCE_HASH_ALGORITHM="SHA-256";
/** Names private writer outcomes; a consumed callback can still have insufficient recency. */
export const GLOBAL_REAUTHENTICATION_OUTCOME={created:"created",authorizing:"authorizing",consumed:"consumed",contextUnavailable:"context_unavailable",intentUnusable:"intent_unusable"} as const;
