/** Requires exact global leader recency before advancing a corrective presentation. @module allow-admission-retry-use-case */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionRetryWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-retry-writer";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_RESOURCE_KIND } from "@/src/modules/academy-admissions/constants/admission-authorization";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { admissionOperationFailure } from "../results/admission-operation-failure";

/** Input never contains a leader/session/evidence permission token from the browser. */
export type AllowAdmissionRetryInput = { tribeId: string; admissionRequestId: string; operationId: string; requestId: string; expectedVersion: number; confirmed: true; internalReason: string };
export class AllowAdmissionRetryUseCase {
  /** @param resolver - Actual current account/leader/resource and signed operation-specific recency. @param writer - Own atomic metadata/audit/ledger owner. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly writer: AdmissionRetryWriter) {}
  /** @param input - Boundary-validated explicit reason/version/confirmation. @returns Original retry snapshot or closed denial, without membership or notification effects. */
  async execute(input: AllowAdmissionRetryInput) {
    try {
      const authorization = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.allowEarlyRetry, sensitiveOperation: REAUTHENTICATION_OPERATION.advanceAdmissionRetry, resource: { kind: ADMISSION_RESOURCE_KIND.request, id: input.admissionRequestId } });
      if (!authorization.allowed) return { ok: false as const, failure: authorization.failure };
      return { ok: true as const, value: await this.writer.allowRetry({ ...input, userId: authorization.context.userId, sessionId: authorization.context.sessionId, internalReason: input.internalReason.trim() }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
