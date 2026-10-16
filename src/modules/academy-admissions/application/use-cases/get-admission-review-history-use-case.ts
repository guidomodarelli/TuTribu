/** Rechecks the current reviewer before and after publishing one request's retained history. @module get-admission-review-history-use-case */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionReviewHistoryReader } from "../../domain/repositories/admission-review-history-reader";
import type { AdmissionReviewHistoryQuery } from "../queries/admission-review-history-query";
import { projectAdmissionReviewHistory } from "../results/admission-review-history-result";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_RESOURCE_KIND } from "../../constants/admission-authorization";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** This query cannot provide general audit access, mutate requests or authorize a later decision. */
export class GetAdmissionReviewHistoryUseCase {
  /** @param resolver - Existing native current-account and resource authority. @param reader - Request-only history port with its own access fact. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly reader: AdmissionReviewHistoryReader) {}

  /** @param query - Boundary-normalized resource, limit and original cursor. @returns Only current-authorized history or a closed private application failure. */
  async execute(query: AdmissionReviewHistoryQuery) {
    try {
      const command = { tribeId: query.tribeId, requestId: query.requestId, action: ADMISSION_ACTION.readReviewHistory, resource: { kind: ADMISSION_RESOURCE_KIND.request, id: query.admissionRequestId } };
      const first = await this.resolver.execute(command);
      if (!first.allowed) return { ok: false as const, failure: first.failure };
      const scope = { tribeId: query.tribeId, requestId: query.requestId, userId: first.context.userId, sessionId: first.context.sessionId };
      const page = await this.reader.readHistory(scope, query.admissionRequestId, { limit: query.limit, cursor: query.cursor });
      const current = await this.resolver.execute(command);
      if (!current.allowed) return { ok: false as const, failure: current.failure };
      if (current.context.userId !== scope.userId || current.context.sessionId !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      for (const record of page.records) if (record.tribeId !== scope.tribeId || record.admissionRequestId !== query.admissionRequestId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: projectAdmissionReviewHistory(scope.tribeId, query.admissionRequestId.toLowerCase(), page.records, page.nextCursor) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
