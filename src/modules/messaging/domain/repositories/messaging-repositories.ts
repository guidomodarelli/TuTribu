/** Defines inward-facing context/resource/secret ports without HTTP, SDK or persistence types. */
import type { RecentAuthenticationEvidence } from "@/src/modules/auth/domain/entities/recent-authentication-evidence";

/** Private account projection adapted from auth, without profile flags or provider payloads. */
export type MessagingAuthenticatedAccount = {
  userId: string; session: { id: string; expiresAt: Date };
  googleAccount: { id: string; subject: string } | null;
  recentAuthentication: readonly RecentAuthenticationEvidence[];
};
export interface MessagingAccountProvider {
  getAuthenticatedAccount(): Promise<MessagingAuthenticatedAccount | null>;
}
export type MessagingLeadershipFacts = {
  tribeId: string; leaderUserId: string;
  membership: { userId: string; role: "leader" | "guardian" | "tribemate"; status: "active" | "muted" | "blocked" | "removed" } | null;
};
export type MessagingConnectionAuthorizationFacts = {
  id: string; tribeId: string; version: number; contributedByUserId: string;
  state: "draft" | "ready" | "active" | "degraded" | "suspended" | "disconnected";
  securityEpoch: string; retiredAt: Date | null; secretRef: string | null;
};
export interface MessagingAuthorizationReader {
  /** Reads current membership and authoritative leader for the current account under own request context. */
  getCurrentLeadership(tribeId: string, userId: string): Promise<MessagingLeadershipFacts | null>;
  /** Reads one connection only within the already authorized tribe. */
  getConnection(tribeId: string, connectionId: string): Promise<MessagingConnectionAuthorizationFacts | null>;
}
export type MessagingSecurityFacts = { environment: string; securityEpoch: string; recoveryLocked: boolean };
export interface MessagingSecurityFactsProvider {
  /** Reads external security state for each operation; PostgreSQL cannot restore this authority. */
  getCurrentSecurityFacts(): Promise<MessagingSecurityFacts>;
}
export type AuthorizedMessagingContext = {
  actorUserId: string; sessionId: string; accountId: string; subject: string;
  tribeId: string; connectionId: string; connectionVersion: number;
  environment: string; securityEpoch: string; operation: string; requestId: string;
  authenticatedAt: Date; validUntil: Date; secretRef: string;
};
export interface MessagingSecretStore {
  /** Revalidates this scope/retirement/current role before returning backend-only material. */
  loadAuthorizedSecret(context: AuthorizedMessagingContext): Promise<string>;
}
