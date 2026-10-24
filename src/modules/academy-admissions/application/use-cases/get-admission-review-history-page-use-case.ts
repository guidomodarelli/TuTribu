/** Composes one server-first request-history page through current native identity and inward query ports. @module get-admission-review-history-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import type { GetAdmissionReviewHistoryUseCase } from "./get-admission-review-history-use-case";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import type { AdmissionReviewSelection } from "../results/admission-review-selection";
import type { AdmissionReviewHistoryFilters } from "../../domain/repositories/admission-review-history-reader";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { admissionReviewHistoryPageStateSchema } from "../../constants/admission-review-history-page";

/** An inbox filter is return-navigation context; it cannot restrict or authorize historical event reads. */
export class GetAdmissionReviewHistoryPageUseCase {
  /** @param accounts - Current request identity. @param readers - Explicit request-scoped history and canonical routing. @param clock - Final session-liveness and render clock. */
  constructor(private readonly accounts: AuthenticatedAccountProvider, private readonly readers: { history: Pick<GetAdmissionReviewHistoryUseCase, "execute">; resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute"> }, private readonly clock: () => Date) {}

  /** @param query - Once-normalized path, return selection and independent history continuation. @returns Current safe own props or a private application failure without partial facts. */
  async execute(query: { slug: string; admissionRequestId: string; requestId: string; filters: AdmissionReviewSelection; cursor?: AdmissionReviewHistoryFilters["cursor"] }) {
    try {
      const first = await this.accounts.getAuthenticatedAccount();
      if (!first || !isAuthenticatedSessionLive(first.session.expiresAt, this.clock())) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const tribe = await this.readers.resolveTribe.execute({ slug: query.slug, requestId: query.requestId });
      if (!tribe.ok) return tribe;
      const history = await this.readers.history.execute({ tribeId: tribe.value.tribeId, admissionRequestId: query.admissionRequestId, requestId: query.requestId, limit: query.filters.limit, ...(query.cursor ? { cursor: query.cursor } : {}) });
      if (!history.ok) return history;
      if (history.value.tribeId !== tribe.value.tribeId || history.value.admissionRequestId !== query.admissionRequestId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      const current = await this.accounts.getAuthenticatedAccount(), now = this.clock();
      if (!current || current.userId !== first.userId || current.session.id !== first.session.id || !isAuthenticatedSessionLive(current.session.expiresAt, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const projected = admissionReviewHistoryPageStateSchema.safeParse({ kind: "ready", slug: query.slug, viewerId: current.userId, renderedAt: now.toISOString(), filters: query.filters, page: history.value, hasPrevious: Boolean(query.cursor) });
      if (!projected.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable, { cause: projected.error });
      return { ok: true as const, value: projected.data };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
