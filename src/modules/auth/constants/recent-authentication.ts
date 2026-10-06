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
/** Fields that bind evidence to a sensitive operation instead of a generic login marker. */
export const RECENT_AUTHENTICATION_SCOPE_FIELDS = ["userId", "sessionId", "accountId", "subject", "tribeId", "operation", "resourceId"] as const;
