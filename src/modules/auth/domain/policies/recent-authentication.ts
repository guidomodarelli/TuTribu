/**
 * Evaluates signed global recency and exact scope before a sensitive credential operation.
 *
 * @module recent-authentication
 */
import {
  RECENT_AUTHENTICATION_REASON,
  RECENT_AUTHENTICATION_SCOPE_FIELDS,
  RECENT_AUTHENTICATION_WINDOW_MS,
  GLOBAL_REAUTHENTICATION_INTENT_STATE,
} from "@/src/modules/auth/constants/recent-authentication";
import type { GlobalReauthenticationIntentFacts } from "@/src/modules/auth/domain/entities/global-reauthentication-intent";
import type { RecentAuthenticationEvidence, RecentAuthenticationScope } from "@/src/modules/auth/domain/entities/recent-authentication-evidence";

/**
 * Checks the callback's one-use intent before the authoritative writer consumes it.
 *
 * A successful callback consumes the intent even though a sensitive operation may
 * later find its signed authentication time insufficient. The emitted evidence has
 * a separate lifetime and does not require an unused intent after this point.
 *
 * @param input - Effective callback scope, current authorization and verified nonce facts.
 * @returns A closed reason or permission to attempt atomic intent consumption.
 */
export function evaluateGlobalReauthenticationCallback(input: {
  now: Date;
  scope: RecentAuthenticationScope;
  intent: GlobalReauthenticationIntentFacts | null;
  sessionActive: boolean;
  currentLeaderUserId: string | null;
}): { allowed: true } | { allowed: false; reason: (typeof RECENT_AUTHENTICATION_REASON)[keyof typeof RECENT_AUTHENTICATION_REASON] } {
  if (!input.sessionActive) return { allowed: false, reason: RECENT_AUTHENTICATION_REASON.sessionInactive };
  if (input.currentLeaderUserId !== input.scope.userId) return { allowed: false, reason: RECENT_AUTHENTICATION_REASON.leaderChanged };
  const intent = input.intent;
  const nowMs = input.now.getTime();
  if (!intent || intent.status !== GLOBAL_REAUTHENTICATION_INTENT_STATE.authorizing || !Number.isInteger(intent.version) || intent.version < 1 || !intent.nonceVerified || intent.consumedAt !== null || !Number.isFinite(nowMs) || !Number.isFinite(intent.expiresAt.getTime()) || nowMs >= intent.expiresAt.getTime()) {
    return { allowed: false, reason: RECENT_AUTHENTICATION_REASON.intentUnusable };
  }
  for (const field of RECENT_AUTHENTICATION_SCOPE_FIELDS) {
    if (field !== "sessionId" && intent[field] !== input.scope[field]) return { allowed: false, reason: RECENT_AUTHENTICATION_REASON.scopeMismatch };
  }
  return { allowed: true };
}

/**
 * Authorizes issued evidence using signed authentication time and the current scope.
 *
 * `verifiedAt`, session renewal, profile flags, and tribe-local OTP are never used
 * as substitutes for `authenticatedAt`. The callback already consumed the intent;
 * application rechecks role/session under its authoritative writer before reading
 * a secret and obtains evidence only from the trusted issuer/repository.
 *
 * @param input - Current clock, session/leader, exact scope and private auth facts.
 * @returns A closed reason or permission to proceed with the sensitive operation.
 */
export function evaluateRecentAuthentication(input: {
  now: Date;
  scope: RecentAuthenticationScope;
  evidence: RecentAuthenticationEvidence | null;
  sessionActive: boolean;
  currentLeaderUserId: string | null;
}): { allowed: true } | { allowed: false; reason: (typeof RECENT_AUTHENTICATION_REASON)[keyof typeof RECENT_AUTHENTICATION_REASON] } {
  const failure = (reason: (typeof RECENT_AUTHENTICATION_REASON)[keyof typeof RECENT_AUTHENTICATION_REASON]) => ({ allowed: false as const, reason });
  if (!input.sessionActive) return failure(RECENT_AUTHENTICATION_REASON.sessionInactive);
  if (input.currentLeaderUserId !== input.scope.userId) return failure(RECENT_AUTHENTICATION_REASON.leaderChanged);
  const evidence = input.evidence;
  if (!evidence || evidence.invalidatedAt !== null || !evidence.authenticatedAt) return failure(RECENT_AUTHENTICATION_REASON.required);
  for (const field of RECENT_AUTHENTICATION_SCOPE_FIELDS) {
    if (evidence[field] !== input.scope[field]) return failure(RECENT_AUTHENTICATION_REASON.scopeMismatch);
  }
  const ageMs = input.now.getTime() - evidence.authenticatedAt.getTime();
  if (!Number.isFinite(ageMs) || !Number.isFinite(evidence.validUntil.getTime()) || ageMs < 0 || ageMs >= RECENT_AUTHENTICATION_WINDOW_MS || input.now.getTime() >= evidence.validUntil.getTime()) return failure(RECENT_AUTHENTICATION_REASON.required);
  return { allowed: true };
}
