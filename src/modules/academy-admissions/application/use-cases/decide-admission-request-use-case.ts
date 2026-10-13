/** Resolves current reviewer authority before an explicit original admission decision. @module decide-admission-request-use-case */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionCommandWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_OPERATION_TYPE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_RESOURCE_KIND } from "@/src/modules/academy-admissions/constants/admission-authorization";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { admissionOperationFailure } from "../results/admission-operation-failure";

/** Current identity/role/session never come from the browser decision fields. */
export type DecideAdmissionRequestInput = { tribeId: string; admissionRequestId: string; requestId: string; operationId: string; expectedVersion: number; confirmed: true; decision: "approve" | "reject"; internalReason: string; externalMessage: string | null };

/** Resolves permission before the writer independently locks and rechecks the original resource. */
export class DecideAdmissionRequestUseCase {
  /** @param resolver - Current native account/role/resource resolution. @param writer - Own atomic decision and original-ledger recovery owner. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly writer: AdmissionCommandWriter) {}
  /** @param input - Boundary-validated explicit versioned decision. @returns Only a confirmed original result, registered progress or safe denial. */
  async execute(input: DecideAdmissionRequestInput) {
    try {
      const authorization = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: input.decision === ADMISSION_DECISION.approve ? ADMISSION_ACTION.decideRequest : ADMISSION_ACTION.rejectRequest, resource: { kind: ADMISSION_RESOURCE_KIND.request, id: input.admissionRequestId } });
      if (!authorization.allowed) return { ok: false as const, failure: authorization.failure };
      const { context } = authorization;
      return { ok: true as const, value: await this.writer.decide({ ...input, userId: context.userId, sessionId: context.sessionId, type: ADMISSION_OPERATION_TYPE.decide, internalReason: input.internalReason.trim(), externalMessage: input.externalMessage?.trim() || null }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
