/** Erases no-longer-needed OTP material under current backend authority and a bounded guarded transaction. @module postgres-verification-material-maintenance */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { VerificationMaterialMaintenance, VerificationMaterialPurgeCommand } from "@/src/modules/messaging/domain/repositories/verification-material-maintenance";
import { MessagingDeliveryStorageError } from "@/src/modules/messaging/domain/errors/messaging-delivery-storage-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGE_STORAGE_OPERATION } from "@/src/modules/messaging/constants/message-delivery";
import { VERIFICATION_MATERIAL_PURGE_LIMIT } from "@/src/modules/messaging/constants/verification-material";

/** Backend executor uses the shared guard; it never acquires another client inside its callback. */
type MaterialDatabaseExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/**
 * Executes destruction on the caller's already authorized transaction, without acquiring another client.
 * @param database - Worker/maintenance transaction retaining its authority through commit.
 * @param command - Original delivery scope or a bounded maintenance scan, selected by the backend.
 * @returns Number of physically removed envelopes; no code, MAC or recipient is returned.
 */
export async function purgeVerificationMaterial(database: RequestDatabase, command: VerificationMaterialPurgeCommand): Promise<number> {
  return (await database.execute<{ count: number }>(sql`select public.purge_messaging_verification_envelopes(${command.limit},${command.deliveryId ?? null}::uuid) as count`)).rows[0].count;
}

/** Maintenance needs no decryption key, provider access or current human recency to destroy private bytes. */
export class PostgresVerificationMaterialMaintenance implements VerificationMaterialMaintenance {
  /**
   * @param execute - Existing guarded maintenance/worker executor, with ownership bound by its composition root.
   * @param authorize - Mandatory current platform authorization for this fixed backend operation.
   */
  constructor(private readonly execute: MaterialDatabaseExecutor, private readonly authorize: (database: RequestDatabase, operation: typeof MESSAGE_STORAGE_OPERATION.purgeVerificationMaterial) => Promise<boolean>) {}

  /**
   * Clears a reference and its bytes atomically; local MAC, original expiry and charged history remain independent.
   * @param command - Backend-owned batch limit and optional original delivery scope, never public filtering.
   * @returns Count only after a confirmed commit; ambiguous completion preserves a typed private failure.
   * @throws MessagingDeliveryStorageError for invalid bounds, revoked authority or indeterminate completion.
   */
  async purge(command: VerificationMaterialPurgeCommand): Promise<number> {
    const operation = MESSAGE_STORAGE_OPERATION.purgeVerificationMaterial;
    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > VERIFICATION_MATERIAL_PURGE_LIMIT.maximum) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.invalidInput, { operation });
    try {
      return await this.execute(async (database) => {
        if (!await this.authorize(database, operation)) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.permissionDenied, { operation });
        const count = await purgeVerificationMaterial(database, command);
        if (!await this.authorize(database, operation)) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.permissionDenied, { operation });
        return count;
      });
    } catch (error) {
      if (error instanceof MessagingDeliveryStorageError) throw error;
      throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation, ...(command.deliveryId ? { deliveryId: command.deliveryId } : {}), cause: error });
    }
  }
}
