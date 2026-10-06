/** Composes private credential readers with a fixed purpose and privileged guarded backend connection. */
import "server-only";
import { createRequestAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/composition/authenticated-account-provider";
import type { MessagingAccountProvider, MessagingSecretAccessContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { createServerDatabaseClient, DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Requires an external key/epoch/recovery source; no operational default is manufactured. */
export type MessagingSecurityConfigReader = () => Promise<MessagingSecurityConfig>;

/** Builds a per-operation store; its guarded queries still revalidate all current authority. */
async function createSecretStore(accounts: MessagingAccountProvider, readSecurityConfig: MessagingSecurityConfigReader, purpose: MessagingSecretAccessContext["authorizationPurpose"]) {
  const database = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  return new PostgresEncryptedSecretStore((actorUserId, run) => database.withRequestContext({ userId: actorUserId, email: null }, run), accounts, readSecurityConfig, purpose);
}

/**
 * Composes only human access against the native current server account.
 * @param readSecurityConfig - Explicit current hosting-secret source.
 * @returns A backend-only store that rejects any worker context at its entrypoint.
 */
export function createRequestMessagingSecretStore(readSecurityConfig: MessagingSecurityConfigReader) {
  return createSecretStore(createRequestAuthenticatedAccountProvider(), readSecurityConfig, MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader);
}

/**
 * Composes only persisted worker attempts; no human session or recency is invented.
 * @param readSecurityConfig - Explicit current hosting-secret source.
 * @returns A private worker store that revalidates marker/reservation/lease and rejects human contexts.
 */
export function createDeliveryMessagingSecretStore(readSecurityConfig: MessagingSecurityConfigReader) {
  return createSecretStore({ getAuthenticatedAccount: async () => null }, readSecurityConfig, MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery);
}
