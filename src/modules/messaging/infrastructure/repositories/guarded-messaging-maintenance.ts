/** Current backend authority and recovery gates shared by the guarded messaging maintenance owners. @module guarded-messaging-maintenance */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";

/** Uses the caller's guarded maintenance transaction and publishes only after its confirmed commit. */
export type CandidateExpirationDatabaseExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Rechecks host authority/recovery; an optional transaction supports authoritative own maintenance gates. */
export type CandidateExpirationGate = (database?: RequestDatabase) => Promise<boolean>;

/** Maintenance owner that runs on the guarded executor only while current private authority holds and no recovery stop is active. */
export abstract class GuardedMessagingMaintenance<GateCode extends string> {
  /** Failure code of an active recovery stop for this owner. */
  protected abstract readonly recoveryLockedCode: GateCode;

  /** @param execute - Existing guarded maintenance executor. @param authorize - Current private backend authority. @param readRecoveryLock - Current restore gate without loading a keyring. */
  constructor(protected readonly execute: CandidateExpirationDatabaseExecutor, protected readonly authorize: CandidateExpirationGate, protected readonly readRecoveryLock: CandidateExpirationGate) {}

  /** @param code - Closed gate failure. @returns The owner's own error for it. */
  protected abstract gateFailure(code: GateCode | typeof MESSAGING_ERROR_CODE.permissionDenied): Error;

  /** @param database - Current protected transaction when available. @returns After the current authority and recovery gates permit this operation. @throws The owner's gate failure when either gate is unavailable. */
  protected async assertAuthority(database?: RequestDatabase): Promise<void> {
    if (!await this.authorize(database)) throw this.gateFailure(MESSAGING_ERROR_CODE.permissionDenied);
    if (await this.readRecoveryLock(database)) throw this.gateFailure(this.recoveryLockedCode);
    if (!await this.authorize(database)) throw this.gateFailure(MESSAGING_ERROR_CODE.permissionDenied);
  }
}
