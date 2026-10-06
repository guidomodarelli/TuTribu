/**
 * Models a private operation-scoped result of signed global reauthentication.
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
  authenticatedAt: Date | null;
  verifiedAt: Date;
  validUntil: Date;
  invalidatedAt: Date | null;
};
