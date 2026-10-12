/** Defines private atomic retirement of abandoned candidate versions without changing selected authority or consumption. @module messaging-candidate-expiration-port */

/** Contains only confirmed counts after the original database transaction commits. */
export type MessagingCandidateExpirationResult = { expired: number; purgedImmediately: number };

/** Keeps scanning and retirement in the owning backend transaction; it grants no credential access. */
export interface MessagingCandidateExpiration {
  /** @param command - Backend-owned batch ceiling. @returns Confirmed counts; an indeterminate commit must reject instead of claiming zero. */
  expire(command: { limit: number }): Promise<MessagingCandidateExpirationResult>;
}
