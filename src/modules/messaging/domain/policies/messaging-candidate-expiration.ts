/** Assesses the original idle lifetime of a candidate without expiring a selected connection or reviving retired authority. @module messaging-candidate-expiration */
import { MESSAGING_CANDIDATE_IDLE_LIFETIME_MS } from "../../constants/messaging-secret-access";
import { MESSAGING_EXPIRED_CANDIDATE_PURGE_WINDOW_MS, MESSAGING_CANDIDATE_EXPIRATION_REASON } from "../../constants/messaging-candidate-expiration";

/** Contains current locked candidate/version facts and the owner's authoritative time. */
export type MessagingCandidateExpirationFacts = { isSelected: boolean; isCandidate: boolean; resourceRetiredAt: Date | null; connectionRetiredAt: Date | null; lastActivityAt: Date; now: Date };
/** Preserves a closed outcome or original deadlines; it never substitutes for maintenance authorization. */
export type MessagingCandidateExpirationAssessment = { eligible: true; expiredAt: Date; purgeBy: Date } | { eligible: false; reason: "selected_connection" | "not_candidate" | "resource_retired" | "connection_retired" | "clock_unavailable" | "activity_unavailable" | "candidate_current" };

/**
 * Computes the original idle expiration and purge limit for a live unselected candidate.
 * @param facts - Current exact connection/version facts after owner locks.
 * @returns A pure expiration proposal; the backend must recheck authority and persist it atomically.
 */
export function assessMessagingCandidateExpiration(facts: MessagingCandidateExpirationFacts): MessagingCandidateExpirationAssessment {
  if (facts.isSelected) return { eligible: false, reason: MESSAGING_CANDIDATE_EXPIRATION_REASON.selectedConnection };
  if (!facts.isCandidate) return { eligible: false, reason: MESSAGING_CANDIDATE_EXPIRATION_REASON.notCandidate };
  if (facts.resourceRetiredAt) return { eligible: false, reason: MESSAGING_CANDIDATE_EXPIRATION_REASON.resourceRetired };
  if (facts.connectionRetiredAt) return { eligible: false, reason: MESSAGING_CANDIDATE_EXPIRATION_REASON.connectionRetired };
  const now = facts.now.getTime(), lastActivity = facts.lastActivityAt.getTime();
  if (!Number.isFinite(now)) return { eligible: false, reason: MESSAGING_CANDIDATE_EXPIRATION_REASON.clockUnavailable };
  if (!Number.isFinite(lastActivity) || lastActivity > now) return { eligible: false, reason: MESSAGING_CANDIDATE_EXPIRATION_REASON.activityUnavailable };
  const expiredAt = new Date(lastActivity + MESSAGING_CANDIDATE_IDLE_LIFETIME_MS);
  const purgeBy = new Date(expiredAt.getTime() + MESSAGING_EXPIRED_CANDIDATE_PURGE_WINDOW_MS);
  if (!Number.isFinite(expiredAt.getTime()) || !Number.isFinite(purgeBy.getTime())) return { eligible: false, reason: MESSAGING_CANDIDATE_EXPIRATION_REASON.activityUnavailable };
  if (now < expiredAt.getTime()) return { eligible: false, reason: MESSAGING_CANDIDATE_EXPIRATION_REASON.candidateCurrent };
  return { eligible: true, expiredAt, purgeBy };
}
