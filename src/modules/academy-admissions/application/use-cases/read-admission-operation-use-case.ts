/** Recovers only an actually registered own operation without claiming or repeating work. @module read-admission-operation-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { AdmissionOperationReader } from "@/src/modules/academy-admissions/domain/repositories/admission-operation-reader";
import { admissionOperationRecoveryEnvelopeSchema, admissionOperationRecoverySchema } from "../results/admission-operation-recovery";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_POLICY_RECOVERABLE_OPERATIONS, ADMISSION_POLICY_OPERATION } from "../../constants/admission-policy";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { admissionPolicyMutationResultSchema } from "../results/admission-policy-result-schemas";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { ADMISSION_EMAIL_SETTINGS_STATUS } from "@/src/modules/notifications/constants/admission-notification-email-settings";
import { toAdmissionNotificationEmailSettingsView } from "@/src/modules/notifications/application/results/admission-notification-settings-projection";

/** Global identity is derived from the native provider; operation existence never implies current permission. */
export class ReadAdmissionOperationUseCase {
  /** @param accounts - Actual current account/session. @param reader - Own namespace/permission-aware readonly registry. @param clock - Fresh time after awaited reads. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly reader: AdmissionOperationReader<unknown>, private readonly clock: () => Date) {}
  /** @param query - Validated operation/tribe reference and safe correlation only. @param options - Native transport composition may request actual viewer metadata; never browser input or authority. @returns Genuine registered state or a closed failure, never a fabricated job. */
  async execute(query: { tribeId: string; operationId: string; requestId: string }, options: { includeViewer?: boolean } = {}) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (!first || !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const value = await this.reader.read({ userId: first.userId, sessionId: first.session.id, tribeId: query.tribeId, requestId: query.requestId }, query.operationId);
      const current = await this.accounts.getAuthenticatedAccount();
      if (!current || current.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      if (value === null) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const parsed = admissionOperationRecoveryEnvelopeSchema.safeParse(value);
      if (!parsed.success || parsed.data.operation.operationId !== query.operationId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      if (ADMISSION_POLICY_RECOVERABLE_OPERATIONS.includes(parsed.data.operationType) && parsed.data.operation.state === OPERATION_STATE.completed) {
        const original = admissionPolicyMutationResultSchema.parse(parsed.data.operation.result);
        if (original.policyId !== query.tribeId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
        if (parsed.data.operationType === ADMISSION_POLICY_OPERATION.activate && !original.controlActivated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
        if (parsed.data.operationType === ADMISSION_POLICY_OPERATION.initialize && original.changed && (original.version !== 1 || original.verificationEpoch !== 1 || original.controlActivated)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      }
      let recovered: unknown = { type: parsed.data.operationType, ...parsed.data.operation };
      if (parsed.data.operationType === REAUTHENTICATION_OPERATION.updateAdmissionEmailSettings && parsed.data.operation.state === OPERATION_STATE.completed) {
        const original = parsed.data.operation.result;
        if (original.status !== ADMISSION_EMAIL_SETTINGS_STATUS.rejected) {
          if (original.settings.tribeId !== query.tribeId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
          recovered = { type: parsed.data.operationType, ...parsed.data.operation, result: { status: original.status, settings: toAdmissionNotificationEmailSettingsView(original.settings) } };
        }
      }
      return { ok: true as const, value: admissionOperationRecoverySchema.parse(recovered), ...(options.includeViewer ? { viewerId: first.userId } : {}) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
