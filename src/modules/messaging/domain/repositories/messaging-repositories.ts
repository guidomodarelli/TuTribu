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
/** Private common identity; a context is not a public permission token. */
export type MessagingSecretResourceScope = {
  tribeId: string; connectionId: string; connectionVersion: number;
  environment: string; securityEpoch: string; requestId: string; secretRef: string;
};
/** Human credential operations require scoped global recency and a current session. */
export type AuthorizedMessagingContext = MessagingSecretResourceScope & {
  authorizationPurpose: "sensitive_leader"; resourceId: string;
  actorUserId: string; sessionId: string; accountId: string; subject: string;
  operation: string; authenticatedAt: Date; validUntil: Date;
};
/**
 * A writer emits this only after committing the attempt marker and budget.
 * SecretStore must reread that attempt, scope, version, lease, current leader,
 * resource retirement and external epoch. A worker does not reuse human recency.
 */
export type AuthorizedDeliveryMessagingContext = MessagingSecretResourceScope & {
  authorizationPurpose: "authorized_delivery";
  contributingLeaderUserId: string; deliveryId: string; attemptId: string;
  attemptVersion: number; leaseToken: string; sendAuthorizedAt: Date;
  authorizedUsagePolicyVersion: number; operation: "dispatch_delivery";
};
export type MessagingSecretAccessContext = AuthorizedMessagingContext | AuthorizedDeliveryMessagingContext;
export interface MessagingSecretStore {
  /** Revalidates the purpose-specific authority before returning backend-only material. */
  loadAuthorizedSecret(context: MessagingSecretAccessContext): Promise<string>;
}
