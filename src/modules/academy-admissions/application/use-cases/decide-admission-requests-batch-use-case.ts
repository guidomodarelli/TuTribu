/** Authorizes a current reviewer and projects one explicit atomic batch original. @module decide-admission-requests-batch-use-case */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionBatchDecisionIntent, AdmissionBatchDecisionWriter } from "../../domain/repositories/admission-batch-decision-writer";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { projectAdmissionBatchDecisionResult } from "../results/admission-batch-decision-result";

/** Account and session are always derived from native server authority. */
export type DecideAdmissionRequestsBatchInput = Omit<AdmissionBatchDecisionIntent, "userId" | "sessionId">;

/** One writer owns the complete business transaction; the use case never loops independently committing decisions. */
export class DecideAdmissionRequestsBatchUseCase {
  /** @param resolver - Current native reviewer/session resolver. @param writer - Own atomic batch and original recovery port. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly writer: AdmissionBatchDecisionWriter) {}

  /** @param input - Boundary-validated confirmed explicit IDs/versions and separate messages. @returns Current safe denial, original per-row completion or registered uncertainty without fabricating successes. */
  async execute(input: DecideAdmissionRequestsBatchInput) {
    const intent = { ...input, internalReason: input.internalReason.trim(), externalMessage: input.externalMessage?.trim() || null, items: input.items.map((item) => ({ ...item, admissionRequestId: item.admissionRequestId.toLowerCase() })) };
    try {
      const authorization = await this.resolver.execute({ tribeId: intent.tribeId, requestId: intent.requestId, action: ADMISSION_ACTION.readInbox });
      if (!authorization.allowed) return { ok: false as const, failure: authorization.failure };
      const original = await this.writer.decideBatch({ ...intent, userId: authorization.context.userId, sessionId: authorization.context.sessionId });
      return { ok: true as const, value: projectAdmissionBatchDecisionResult(intent.operationId, intent.items, original) };
    } catch (error) {
      if (error instanceof AdmissionOperationError && error.operationId && error.operationId.toLowerCase() !== intent.operationId.toLowerCase()) return admissionOperationFailure(new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable, { cause: error }));
      return admissionOperationFailure(error);
    }
  }
}
