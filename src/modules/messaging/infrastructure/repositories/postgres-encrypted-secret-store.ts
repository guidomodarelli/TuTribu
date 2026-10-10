/** Opens credentials only after current identity/resource/attempt and external key state are authorized. */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingAccountProvider, MessagingSecretAccessContext, MessagingSecretStore } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { createMessagingSecretCipher, type MessagingSecretEnvelope } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_SECRET_HUMAN_OPERATIONS, MESSAGING_SECRET_DELIVERY_SCOPE } from "@/src/modules/messaging/constants/messaging-secret-access";
import { authorizeMessagingSecret, messagingSecretLifetimeIsCurrent } from "./postgres-messaging-secret-authorizer";

type DatabaseExecutor = <Result>(actorUserId: string, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
type SecurityConfigReader = () => Promise<MessagingSecurityConfig>;

/**
 * Keeps human and worker entrypoints separate, with no default execution principal or keyring.
 * Plaintext exists only as a private adapter result; no credential/IV/ciphertext is logged or persisted.
 */
export class PostgresEncryptedSecretStore implements MessagingSecretStore {
  /**
   * @param executeWithDatabase - Existing guarded backend executor; never a new checkout within a transaction.
   * @param accounts - Current server session/account for human access; worker access uses persisted attempt facts.
   * @param readSecurityConfig - Current external hosting-secret snapshot, never PostgreSQL-restored authority.
   * @param purpose - Fixed composition purpose; a public request cannot select worker authority.
   */
  constructor(private readonly executeWithDatabase: DatabaseExecutor, private readonly accounts: MessagingAccountProvider, private readonly readSecurityConfig: SecurityConfigReader, private readonly purpose: MessagingSecretAccessContext["authorizationPurpose"]) {}

  /**
   * Revalidates under locks, samples the clock after waits/crypto and returns backend-only material.
   * @param context - Private scope from the owning use case or committed attempt writer.
   * @returns The credential exclusively for the private provider adapter's operation.
   * @throws MessagingSecretAccessError for insufficient current authority, external state or cryptographic material.
   */
  async loadAuthorizedSecret(context: MessagingSecretAccessContext): Promise<string> {
    if (context.authorizationPurpose !== this.purpose) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
    if (!Number.isInteger(context.connectionVersion) || context.connectionVersion < 1) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
    const human = context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader;
    const actorUserId = human ? context.actorUserId : context.contributingLeaderUserId;
    try {
      if (human) {
        if (context.resourceId !== context.connectionId || !MESSAGING_SECRET_HUMAN_OPERATIONS.some((operation) => operation === context.operation)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
        if (!Number.isFinite(context.authenticatedAt.getTime()) || !Number.isFinite(context.validUntil.getTime())) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.reauthenticationRequired);
        const account = await this.accounts.getAuthenticatedAccount();
        if (!account || account.userId !== context.actorUserId || account.session.id !== context.sessionId || account.googleAccount?.id !== context.accountId || account.googleAccount.subject !== context.subject) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.authenticationRequired);
      } else if (context.operation !== MESSAGING_SECRET_DELIVERY_SCOPE.operation) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
      return await this.executeWithDatabase(actorUserId, async (database) => {
        const authorization = await authorizeMessagingSecret(database, context);
        const config = await this.readSecurityConfig();
        const assertConfig = (current: MessagingSecurityConfig) => {
          if (current.recoveryLocked || current.environment !== context.environment || current.securityEpoch !== context.securityEpoch || !current.keyrings[MESSAGING_KEY_PURPOSE.credential].keys.has(authorization.keyId)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
        };
        assertConfig(config);
        const readClock = async () => new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        if (!messagingSecretLifetimeIsCurrent(authorization, await readClock())) throw new MessagingSecretAccessError(human ? MESSAGING_ERROR_CODE.reauthenticationRequired : MESSAGING_ERROR_CODE.resourceUnavailable);
        const row = (await database.execute<{ format: number; purpose: MessagingSecretEnvelope["purpose"]; environment: string; security_epoch: string; key_id: string; iv: Uint8Array; ciphertext: Uint8Array }>(sql`select format,purpose,environment,security_epoch,key_id,iv,ciphertext from public.messaging_secret_envelopes where secret_ref=${context.secretRef} and tribe_id=${context.tribeId} and connection_id=${context.connectionId} and connection_version=${context.connectionVersion} and retired_at is null`)).rows[0];
        if (!row) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
        const plaintext = await createMessagingSecretCipher(config).open({ format: row.format, purpose: row.purpose, environment: row.environment, securityEpoch: row.security_epoch, keyId: row.key_id, iv: row.iv, ciphertext: row.ciphertext }, { tribeId: context.tribeId, connectionId: context.connectionId, connectionVersion: context.connectionVersion, resourceId: context.secretRef });
        assertConfig(await this.readSecurityConfig());
        if (!messagingSecretLifetimeIsCurrent(authorization, await readClock())) throw new MessagingSecretAccessError(human ? MESSAGING_ERROR_CODE.reauthenticationRequired : MESSAGING_ERROR_CODE.resourceUnavailable);
        return plaintext;
      });
    } catch (error) {
      if (error instanceof MessagingSecretAccessError) throw error;
      throw new MessagingSecretAccessError(error instanceof MessagingCryptographyError ? MESSAGING_ERROR_CODE.connectionIncomplete : MESSAGING_ERROR_CODE.unexpectedFailure, { cause: error });
    }
  }
}
