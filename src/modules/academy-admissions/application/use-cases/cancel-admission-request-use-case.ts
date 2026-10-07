/** Resolves own/management cancellation independently of the current admission opening. @module cancel-admission-request-use-case */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionCommandWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_OPERATION_TYPE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_RESOURCE_KIND } from "@/src/modules/academy-admissions/constants/admission-authorization";
import { admissionOperationFailure } from "../results/admission-operation-failure";

/** Original intent has no caller-provided membership/role permission. */
export type CancelAdmissionRequestInput = { tribeId: string; admissionRequestId: string; requestId: string; operationId: string; expectedVersion: number; confirmed: true; internalReason?: string };
/** The server composition fixes the permission variant before exposing a use case. */
type CancellationAction = typeof ADMISSION_ACTION.cancelOwnRequest | typeof ADMISSION_ACTION.cancelByManagement;

/** A guardian cannot acquire the leader management variant from the body. */
export class CancelAdmissionRequestUseCase {
  /** @param resolver - Current native identity/resource authority. @param writer - Own atomic owner. @param action - Fixed server permission, never selected from a browser field. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly writer: AdmissionCommandWriter, private readonly action: CancellationAction) {}
  /** @param input - Boundary-validated original confirmation/version. @returns Historical commit or safe current denial without refreshing a route. */
  async execute(input: CancelAdmissionRequestInput) {
    try {
      const authorization = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: this.action, resource: { kind: ADMISSION_RESOURCE_KIND.request, id: input.admissionRequestId } });
      if (!authorization.allowed) return { ok: false as const, failure: authorization.failure };
      const { context } = authorization;
      return { ok: true as const, value: await this.writer.cancel({ ...input, userId: context.userId, sessionId: context.sessionId, type: ADMISSION_OPERATION_TYPE.cancel, internalReason: input.internalReason?.trim() || null }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
