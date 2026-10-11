/** Confirms atomic clock-driven request expiration under current maintenance authority. @module postgres-admission-request-expiration */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionExpirationCommand, AdmissionRequestExpiration } from "@/src/modules/academy-admissions/domain/repositories/admission-request-expiration";
import { AdmissionExpirationError } from "@/src/modules/academy-admissions/domain/errors/admission-expiration-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_EXPIRATION_BATCH_LIMIT, ADMISSION_EXPIRATION_OPERATION } from "@/src/modules/academy-admissions/constants/admission-expiration";

/** Uses the composition root's guarded maintenance transaction, with no nested checkout. */
export type AdmissionExpirationDatabaseExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Publishes a count only after authority checks and a confirmed transaction commit. */
export class PostgresAdmissionRequestExpiration implements AdmissionRequestExpiration {
  /** @param execute - Guarded privileged maintenance executor. @param authorize - Live backend gate rechecked inside the original transaction. */
  constructor(private readonly execute: AdmissionExpirationDatabaseExecutor, private readonly authorize: (database: RequestDatabase, operation: string) => Promise<boolean>) {}

  /**
   * Expires only due pending requests, including paused academies; consumed sources remain fixed.
   * @param command - Backend-owned bounded batch, never applicant-selected authority.
   * @returns Confirmed count; repeating after uncertainty cannot duplicate terminal effects.
   * @throws AdmissionExpirationError when authority is unavailable or commit completion is uncertain.
   */
  async expire(command: AdmissionExpirationCommand): Promise<number> {
    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > ADMISSION_EXPIRATION_BATCH_LIMIT.maximum) {
      throw new AdmissionExpirationError(ADMISSION_ERROR_CODE.invalidInput);
    }
    try {
      return await this.execute(async (database) => {
        if (!await this.authorize(database, ADMISSION_EXPIRATION_OPERATION)) throw new AdmissionExpirationError(ADMISSION_ERROR_CODE.permissionDenied);
        const count = (await database.execute<{ count: number }>(sql`select public.expire_academy_admission_requests(${command.limit}) as count`)).rows[0].count;
        if (!await this.authorize(database, ADMISSION_EXPIRATION_OPERATION)) throw new AdmissionExpirationError(ADMISSION_ERROR_CODE.permissionDenied);
        return count;
      });
    } catch (error) {
      if (error instanceof AdmissionExpirationError) throw error;
      throw new AdmissionExpirationError(ADMISSION_ERROR_CODE.operationUnresolved, { cause: error });
    }
  }
}
