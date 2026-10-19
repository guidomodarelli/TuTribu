/**
 * Models a private operation-scoped account confirmation from a signed Google response.
 *
 * @module recent-authentication-evidence
 */
export type RecentAuthenticationScope = {
  userId: string; sessionId: string; accountId: string; subject: string;
  tribeId: string; operation: string; resourceId: string;
};
export type RecentAuthenticationEvidence = RecentAuthenticationScope & {
  id: string;
  intentId: string;
  /** Server confirmation time after verifying the current intent; not Google's login time. */
  authenticatedAt: Date | null;
  verifiedAt: Date;
  validUntil: Date;
  invalidatedAt: Date | null;
};
