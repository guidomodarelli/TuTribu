/** Composes one server-first request-history page through current native identity and inward query ports. @module get-admission-review-history-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { confirmSameAdmissionAccount } from "./admission-account-continuity";
import { runScopedAdmissionRead } from "./admission-tribe-scope";
import type { GetAdmissionReviewHistoryUseCase } from "./get-admission-review-history-use-case";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import type { AdmissionReviewSelection } from "../results/admission-review-selection";
import type { AdmissionReviewHistoryFilters } from "../../domain/repositories/admission-review-history-reader";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { admissionReviewHistoryPageStateSchema } from "../../constants/admission-review-history-page";

/** An inbox filter is return-navigation context; it cannot restrict or authorize historical event reads. */
export class GetAdmissionReviewHistoryPageUseCase {
  /** @param accounts - Current request identity. @param readers - Explicit request-scoped history and canonical routing. @param clock - Final session-liveness and render clock. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly readers: { history: Pick<GetAdmissionReviewHistoryUseCase, "execute">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> }, private readonly clock: () => Date) {}

  /** @param query - Once-normalized path, return selection and independent history continuation. @returns Current safe own props or a private application failure without partial facts. */
  async execute(query: { slug: string; admissionRequestId: string; requestId: string; filters: AdmissionReviewSelection; cursor?: NonNullable<AdmissionReviewHistoryFilters["cursor"]> }) {
    return runScopedAdmissionRead({ accounts: this.accounts, clock: this.clock, routing: this.readers.resolveTribe }, query, async ({ first, scope }) => {
      const history = await this.readers.history.execute({ tribeId: scope.tribeId, admissionRequestId: query.admissionRequestId, requestId: query.requestId, limit: query.filters.limit, ...(query.cursor ? { cursor: query.cursor } : {}) });
      if (!history.ok) return history;
      if (history.value.tribeId !== scope.tribeId || history.value.admissionRequestId !== query.admissionRequestId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      const { current, now } = await confirmSameAdmissionAccount(this.accounts, first, this.clock);
      const projected = admissionReviewHistoryPageStateSchema.safeParse({ kind: "ready", slug: query.slug, viewerId: current.userId, renderedAt: now.toISOString(), filters: query.filters, page: history.value, hasPrevious: Boolean(query.cursor) });
      if (!projected.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable, { cause: projected.error });
      return { ok: true as const, value: projected.data };
    });
  }
}
