/** Resolves current own-request authority before normalizing a declared group number. @module update-admission-whatsapp-number-use-case */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionWhatsappNumberWriter } from "../../domain/repositories/admission-whatsapp-number-writer";
import { normalizeAdmissionWhatsappNumber } from "../../domain/value-objects/admission-whatsapp-number";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { admissionOperationFailure } from "../results/admission-operation-failure";

/** Body input selects only its original command and observed resource, never the actor or verification state. */
export type UpdateAdmissionWhatsappNumberInput = { tribeId: string; admissionRequestId: string; requestId: string; operationId: string; expectedVersion: number; confirmed: true; whatsappNumber: string | null };

/** Keeps account/session and transaction authority on the server; editing never sends a message. */
export class UpdateAdmissionWhatsappNumberUseCase {
  /** @param resolver - Current native account and own-request authority. @param writer - Atomic owner of the declared field and minimal original result. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly writer: AdmissionWhatsappNumberWriter) {}

  /** @param input - Boundary-validated own edit and explicit confirmation. @returns Original committed result, registered progress, or a safe failure without raw number diagnostics. */
  async execute(input: UpdateAdmissionWhatsappNumberInput) {
    try {
      const authorization = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.updateOwnWhatsappNumber, resource: { kind: ADMISSION_RESOURCE_KIND.request, id: input.admissionRequestId } });
      if (!authorization.allowed) return { ok: false as const, failure: authorization.failure };
      return { ok: true as const, value: await this.writer.updateWhatsappNumber({ ...input, userId: authorization.context.userId, sessionId: authorization.context.sessionId, whatsappNumber: normalizeAdmissionWhatsappNumber(input.whatsappNumber) }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
