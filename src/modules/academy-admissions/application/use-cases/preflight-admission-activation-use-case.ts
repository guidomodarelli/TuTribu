/** Orchestrates an informational cutover check through current native leadership and private inventory ports. @module preflight-admission-activation-use-case */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionActivationInventoryReader } from "../../domain/repositories/admission-activation-preflight-reader";
import { evaluateAdmissionActivationPreflight } from "../../domain/policies/admission-activation-preflight";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { admissionPreflightResultSchema } from "../results/admission-preflight-result-schema";
import { admissionOperationFailure } from "../results/admission-operation-failure";

/** Preview remains independent of activation; the writer must repeat its actual locked inventory at commit. */
export class PreflightAdmissionActivationUseCase {
  /** @param resolver - Current account/session/leader owner without mutation recency for a read. @param inventory - Actual authorized storage/history/runtime inventory. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly inventory: AdmissionActivationInventoryReader) {}

  /** @param query - Validated target and correlation. @returns A safe informational preflight after current authority is rechecked; no marker, history or key is changed. */
  async execute(query: { tribeId: string; requestId: string }) {
    try {
      const first = await this.resolver.execute({ ...query, action: ADMISSION_ACTION.readPolicy });
      if (!first.allowed) return { ok: false as const, failure: first.failure };
      const inventory = await this.inventory.read(first.context);
      if (inventory.tribeId !== query.tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      const current = await this.resolver.execute({ ...query, action: ADMISSION_ACTION.readPolicy });
      if (!current.allowed) return { ok: false as const, failure: current.failure };
      if (current.context.userId !== first.context.userId || current.context.sessionId !== first.context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const result = evaluateAdmissionActivationPreflight(query.tribeId, inventory);
      const parsed = admissionPreflightResultSchema.safeParse({ ...result, impact: { unknownCommercialMemberCount: inventory.unknownCommercialMemberCount, privilegedCommercialMemberCount: inventory.privilegedCommercialMemberCount } });
      if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: parsed.data };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
