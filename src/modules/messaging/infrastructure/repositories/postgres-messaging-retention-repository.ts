/** Composes existing candidate, credential and OTP owners on one guarded transaction. @module postgres-messaging-retention-repository */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecretRetention, MessagingSecretRetentionCommand, MessagingSecretRetentionResult } from "../../domain/repositories/messaging-secret-retention";
import { MessagingRetentionError } from "../../domain/errors/messaging-retention-error";
import { MessagingCandidateExpirationError } from "../../domain/errors/messaging-candidate-expiration-error";
import { MessagingSecretMaterialError } from "../../domain/errors/messaging-secret-material-error";
import { MessagingDeliveryStorageError } from "../../domain/errors/messaging-delivery-storage-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { PostgresMessagingCandidateExpiration, type CandidateExpirationDatabaseExecutor, type CandidateExpirationGate } from "./postgres-messaging-candidate-expiration";
import { PostgresSecretMaterialMaintenance } from "./postgres-secret-material-maintenance";
import { PostgresVerificationMaterialMaintenance } from "./postgres-verification-material-maintenance";

/** @param error - Failure of a composed owner. @returns Its input/permission code, unavailable for an incomplete connection, otherwise unresolved. */
function retentionFailureCode(error: unknown) {
  const known = error instanceof MessagingCandidateExpirationError || error instanceof MessagingSecretMaterialError || error instanceof MessagingDeliveryStorageError;
  if (!known) return MESSAGING_ERROR_CODE.operationUnresolved;
  if (error.code === MESSAGING_ERROR_CODE.invalidInput || error.code === MESSAGING_ERROR_CODE.permissionDenied) return error.code;
  return error.code === MESSAGING_ERROR_CODE.connectionIncomplete ? MESSAGING_ERROR_CODE.resourceUnavailable : MESSAGING_ERROR_CODE.operationUnresolved;
}

/** Ensures a late OTP/restore failure also rolls back earlier candidate and credential mutations. */
export class PostgresMessagingRetentionRepository implements MessagingSecretRetention {
  /** @param execute - Original guarded backend transaction. @param authorize - Live private principal. @param readRecoveryLock - Current key-independent recovery stop. */
  constructor(private readonly execute: CandidateExpirationDatabaseExecutor, private readonly authorize: CandidateExpirationGate, private readonly readRecoveryLock: CandidateExpirationGate) {}

  /** @param database - Current transaction when acquired. @returns After both current gates permit cleanup. @throws MessagingRetentionError when private authority or recovery requires a stop. */
  private async assertAuthority(database?: RequestDatabase): Promise<void> {
    if (!await this.authorize(database)) throw new MessagingRetentionError(MESSAGING_ERROR_CODE.permissionDenied);
    if (await this.readRecoveryLock(database)) throw new MessagingRetentionError(MESSAGING_ERROR_CODE.resourceUnavailable);
    if (!await this.authorize(database)) throw new MessagingRetentionError(MESSAGING_ERROR_CODE.permissionDenied);
  }

  /** @param command - Application-validated ceilings with independent leaf/SQL guards. @returns Only the counts confirmed by the outer commit. @throws MessagingRetentionError retaining the private leaf/commit cause, without retry. */
  async purge(command: MessagingSecretRetentionCommand): Promise<MessagingSecretRetentionResult> {
    try {
      await this.assertAuthority();
      return await this.execute(async (database) => {
        await this.assertAuthority(database);
        const executeOriginal: CandidateExpirationDatabaseExecutor = async (run) => run(database);
        const candidates = new PostgresMessagingCandidateExpiration(executeOriginal, this.authorize, this.readRecoveryLock);
        const secrets = new PostgresSecretMaterialMaintenance(executeOriginal, () => this.authorize(database));
        const verification = new PostgresVerificationMaterialMaintenance(executeOriginal, () => this.authorize(database));
        const candidateResult = await candidates.expire({ limit: command.candidateLimit });
        await this.assertAuthority(database);
        const retiredSecretsPurged = await secrets.purgeRetired(command.retiredSecretLimit);
        await this.assertAuthority(database);
        const verificationMaterialPurged = await verification.purge({ limit: command.verificationLimit });
        await this.assertAuthority(database);
        return { candidates: candidateResult, retiredSecretsPurged, verificationMaterialPurged };
      });
    } catch (error) {
      if (error instanceof MessagingRetentionError) throw error;
      throw new MessagingRetentionError(retentionFailureCode(error), { cause: error });
    }
  }
}
