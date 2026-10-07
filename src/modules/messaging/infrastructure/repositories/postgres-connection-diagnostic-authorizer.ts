/** Revalidates current human diagnostic authority without retrieving credential bytes. @module postgres-connection-diagnostic-authorizer */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { CONNECTION_DIAGNOSTIC_VERIFY_OPERATION } from "@/src/modules/messaging/constants/connection-diagnostic";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { authorizeMessagingSecret, messagingSecretLifetimeIsCurrent } from "./postgres-messaging-secret-authorizer";

/**
 * Holds actual account/session/leader/resource relationships through the caller's guarded transaction.
 * @param database - Existing current-actor transaction, never a new checkout.
 * @param context - Current server-derived authorization for this exact diagnostic action.
 * @param readSecurityConfig - Local external epoch/recovery snapshot without an outbound request.
 * @returns Nothing while the scope, authority and authoritative time bounds remain current.
 * @throws MessagingSecretAccessError for a closed scope, authority, recency or external-security mismatch.
 */
export async function authorizeConnectionDiagnostic(database: RequestDatabase, context: AuthorizedMessagingContext, readSecurityConfig: () => Promise<MessagingSecurityConfig>): Promise<void> {
  if (context.authorizationPurpose !== MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader || context.operation !== CONNECTION_DIAGNOSTIC_VERIFY_OPERATION || context.resourceId !== context.connectionId) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  const authority = await authorizeMessagingSecret(database, context);
  const config = await readSecurityConfig();
  if (config.recoveryLocked || config.environment !== context.environment || config.securityEpoch !== context.securityEpoch) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
  const now = new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
  if (!messagingSecretLifetimeIsCurrent(authority, now)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
}
