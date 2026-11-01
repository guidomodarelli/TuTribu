/** Builds one current authorized reviewer SSR snapshot through inward read ports. @module get-admission-review-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { confirmSameAdmissionAccount } from "./admission-account-continuity";
import { runScopedAdmissionRead } from "./admission-tribe-scope";
import type { GetAdmissionReviewUseCases } from "./get-admission-review-use-cases";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import { admissionReviewPageStateSchema } from "../results/admission-review-page-state";
import type { AdmissionReviewSelection } from "../results/admission-review-selection";
import { DEFAULT_ADMISSION_REVIEW_SELECTION } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** No writer, SDK, cookie or external DTO enters page props. */
export class GetAdmissionReviewPageUseCase {
  /** @param accounts - Native current global identity. @param readers - Explicit current authorized inward queries. @param clock - Stable final render clock. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly readers: { review: Pick<GetAdmissionReviewUseCases, "list" | "detail">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> }, private readonly clock: () => Date) {}

  /**
   * @param query - Once-validated slug, optional exact selected request and correlation.
   * @returns A safe current reviewer snapshot or Spanish failure with no partial private props. A selected request that does not
   * exist in this tribe (an old or edited link) keeps the inbox, already authorized, with no selection and `selectionUnavailable`.
   */
  async execute(query: { slug: string; requestId: string; admissionRequestId?: string; filters?: AdmissionReviewSelection }) {
    return runScopedAdmissionRead({ accounts: this.accounts, clock: this.clock, routing: this.readers.resolveTribe }, query, async ({ first, scope }) => {
      const filters = query.filters ?? DEFAULT_ADMISSION_REVIEW_SELECTION;
      const list = await this.readers.review.list({ ...filters, ...scope });
      if (!list.ok) return list;
      const detail = query.admissionRequestId ? await this.readers.review.detail({ ...scope, admissionRequestId: query.admissionRequestId }) : null;
      const selectionUnavailable = detail !== null && !detail.ok && detail.failure.code === ADMISSION_ERROR_CODE.resourceUnavailable;
      if (detail && !detail.ok && !selectionUnavailable) return detail;
      const { current, now } = await confirmSameAdmissionAccount(this.accounts, first, this.clock);
      return { ok: true as const, value: admissionReviewPageStateSchema.parse({ kind: "ready", slug: query.slug, viewerId: current.userId, renderedAt: now.toISOString(), filters, page: list.value, selected: detail?.ok ? detail.value : null, ...(selectionUnavailable ? { selectionUnavailable: true } : {}) }) };
    });
  }
}
