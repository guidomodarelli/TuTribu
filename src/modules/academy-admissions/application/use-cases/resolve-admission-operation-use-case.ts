/** Resolves server identity before a concrete owner's durable operation runner. */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import type { AdmissionOperationCommand, AdmissionOperationResult, AdmissionOperationRunner } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { admissionFailure, type AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import {isAuthenticatedSessionLive} from "@/src/modules/auth/domain/policies/authenticated-session-liveness";

/** Derives the actor instead of accepting browser identity or old permissions. */
export class ResolveAdmissionOperationUseCase<Result> {
  /** @param accounts - Current private auth projection. @param runner - Owner-bound writer/result contract and guarded ledger. @param clock - Current time after awaiting account facts. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly runner: AdmissionOperationRunner<Result>,private readonly clock:()=>Date=()=>new Date()) {}
  /**
   * Keeps indeterminate completion attached only to an actually recorded operation.
   * @param command - Boundary-validated namespace and normalized intent, without caller-selected actor.
   * @returns Historical committed result, registered progress or a private closed failure.
   */
  async execute(command: Omit<AdmissionOperationCommand, "actorUserId">): Promise<{ ok: true; value: AdmissionOperationResult<Result> } | { ok: false; failure: AdmissionFailure }> {
    try {
      const account = await this.accounts.getAuthenticatedAccount();
      if (!account||!isAuthenticatedSessionLive(account.session.expiresAt,this.clock())) return { ok: false, failure: admissionFailure(ADMISSION_ERROR_CODE.authenticationRequired) };
      const value = await this.runner.resolve({ actorUserId: account.userId, tribeId: command.tribeId, operationType: command.operationType, idempotencyKey: command.idempotencyKey, intent: command.intent });
      return { ok: true, value };
    } catch (error) {
      if (error instanceof AdmissionOperationError) return { ok: false, failure: admissionFailure(error.code, { cause: error, ...(error.code === ADMISSION_ERROR_CODE.operationUnresolved && error.operationId ? { operation: { operationId: error.operationId, state: OPERATION_STATE.started } } : {}) }) };
      return { ok: false, failure: admissionFailure(ADMISSION_ERROR_CODE.unexpectedFailure, { cause: error }) };
    }
  }
}
