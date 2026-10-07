/** Builds one current authorized reviewer SSR snapshot through inward read ports. @module get-admission-review-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { GetAdmissionReviewUseCases } from "./get-admission-review-use-cases";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import { admissionReviewPageStateSchema } from "../results/admission-review-page-state";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";

/** No writer, SDK, cookie or external DTO enters page props. */
export class GetAdmissionReviewPageUseCase {
  /** @param accounts - Native current global identity. @param readers - Explicit current authorized inward queries. @param clock - Stable final render clock. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly readers: { review: Pick<GetAdmissionReviewUseCases, "list" | "detail">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> }, private readonly clock: () => Date) {}

  /** @param query - Once-validated slug, optional exact selected request and correlation. @returns A safe current reviewer snapshot or Spanish failure with no partial private props. */
  async execute(query: { slug: string; requestId: string; admissionRequestId?: string }) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (!first || !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const tribe = await this.readers.resolveTribe.execute({ slug: query.slug, requestId: query.requestId });
      if (!tribe.ok) return tribe;
      const scope = { tribeId: tribe.value.tribeId, requestId: query.requestId };
      const list = await this.readers.review.list({ ...scope, limit: ADMISSION_QUERY_LIMIT.defaultPageSize, status: ADMISSION_REQUEST_STATUS.pending });
      if (!list.ok) return list;
      const detail = query.admissionRequestId ? await this.readers.review.detail({ ...scope, admissionRequestId: query.admissionRequestId }) : null;
      if (detail && !detail.ok) return detail;
      const current = await this.accounts.getAuthenticatedAccount(), now = this.clock();
      if (!current || current.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      return { ok: true as const, value: admissionReviewPageStateSchema.parse({ kind: "ready", slug: query.slug, viewerId: current.userId, renderedAt: now.toISOString(), page: list.value, selected: detail?.value ?? null }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
