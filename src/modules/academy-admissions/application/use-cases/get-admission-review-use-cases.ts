/** Resolves current reviewer authority before and after read-only inbox/detail projection. @module get-admission-review-use-cases */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionReviewReader, AdmissionReviewRecord, AdmissionReviewFilters } from "@/src/modules/academy-admissions/domain/repositories/admission-review-reader";
import { projectAdmissionReview } from "../results/admission-review-projection";
import { admissionReviewPageSchema } from "../results/admission-review-page-result";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_RESOURCE_KIND } from "@/src/modules/academy-admissions/constants/admission-authorization";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** Query identity is resource selection only; account/session/role come from the native resolver. */
export type AdmissionReviewListQuery = AdmissionReviewFilters & { tribeId: string; requestId: string };

/** Own reader ports have no writers, ledger, sender, credentials or membership effect. */
export class GetAdmissionReviewUseCases {
  /** @param resolver - Current native human authority. @param reader - Scope-restricted current facts. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly reader: AdmissionReviewReader) {}

  /** Guards the owner scope before any private projection, without revalidating an upstream schema. */
  private assertScope(record: AdmissionReviewRecord, tribeId: string, userId: string): void {
    if (record.request.tribeId !== tribeId || record.review.tribe.id !== tribeId || record.review.reviewer?.userId !== userId || record.review.reviewer.tribeId !== tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  }

  /** @param query - Boundary-validated tenant-local filters/cursor and correlation. @returns Bounded oldest-first own reviewer DTOs or a safe current denial. */
  async list(query: AdmissionReviewListQuery) {
    try {
      const command = { tribeId: query.tribeId, requestId: query.requestId, action: ADMISSION_ACTION.readInbox };
      const first = await this.resolver.execute(command);
      if (!first.allowed) return { ok: false as const, failure: first.failure };
      const scope = { tribeId: query.tribeId, requestId: query.requestId, userId: first.context.userId, sessionId: first.context.sessionId };
      const page = await this.reader.readList(scope, { limit: query.limit, status: query.status, source: query.source, cursor: query.cursor, search: query.search, needsVerification: query.needsVerification, submittedFrom: query.submittedFrom, submittedUntil: query.submittedUntil });
      const current = await this.resolver.execute(command);
      if (!current.allowed) return { ok: false as const, failure: current.failure };
      if (current.context.userId !== scope.userId || current.context.sessionId !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      for (const record of page.records) this.assertScope(record, scope.tribeId, scope.userId);
      return { ok: true as const, value: admissionReviewPageSchema.parse({ items: page.records.map(projectAdmissionReview), nextCursor: page.nextCursor }) };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param query - Explicit request id and exact tribe; it never selects an applicant or audience. @returns Current scoped review detail or genuine unavailable state. */
  async detail(query: { tribeId: string; requestId: string; admissionRequestId: string }) {
    try {
      const command = { tribeId: query.tribeId, requestId: query.requestId, action: ADMISSION_ACTION.readInbox, resource: { kind: ADMISSION_RESOURCE_KIND.request, id: query.admissionRequestId } };
      const first = await this.resolver.execute(command);
      if (!first.allowed) return { ok: false as const, failure: first.failure };
      const scope = { tribeId: query.tribeId, requestId: query.requestId, userId: first.context.userId, sessionId: first.context.sessionId };
      const record = await this.reader.readDetail(scope, query.admissionRequestId);
      const current = await this.resolver.execute(command);
      if (!current.allowed) return { ok: false as const, failure: current.failure };
      if (current.context.userId !== scope.userId || current.context.sessionId !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      if (!record) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      this.assertScope(record, scope.tribeId, scope.userId);
      if (record.request.id !== query.admissionRequestId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      return { ok: true as const, value: projectAdmissionReview(record) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
