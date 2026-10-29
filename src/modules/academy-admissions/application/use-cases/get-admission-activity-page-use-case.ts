/** Composes existing leader-only reads without loading keys, writing configuration or replacing history. @module get-admission-activity-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { confirmSameAdmissionAccount } from "./admission-account-continuity";
import { runScopedAdmissionRead } from "./admission-tribe-scope";
import type { ManageMessagingUsageUseCases } from "@/src/modules/messaging/application/use-cases/manage-messaging-usage-use-cases";
import type { GetAdmissionActivityAndMetricsUseCases } from "./get-admission-activity-and-metrics-use-cases";
import type { ResolveAdmissionTribeUseCase } from "./resolve-admission-tribe-use-case";
import type { AdmissionActivityFilters } from "../ports/admission-activity-reader";
import { admissionActivityReadyPageStateSchema } from "../../constants/admission-activity-page-schemas";
import { ADMISSION_ACTIVITY_PAGE_KIND } from "../../constants/admission-activity-browser";
import { ADMISSION_ACTIVITY_QUERY } from "../../constants/admission-activity";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { admissionFailure } from "../results/admission-errors";

/** The same native account is shared by each independently authorized existing owner. */
export class GetAdmissionActivityPageUseCase {
  /** @param accounts - Current native identity. @param readers - Only existing inward read capabilities. @param clock - Stable final SSR time. */
  constructor(
    private readonly accounts: AuthenticatedAccountProvider,
    private readonly readers: { resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">; observations: Pick<GetAdmissionActivityAndMetricsUseCases, "activity" | "metrics">; usage: Pick<ManageMessagingUsageUseCases, "read"> },
    private readonly clock: () => Date,
  ) {}

  /**
   * Reads the exact current scope and returns no partial private data after an authority failure.
   * @param query - Once-validated route, filters and safe correlation.
   * @returns Own current settings, observed aggregates and the original bounded history as separate facts.
   */
  async execute(query: { slug: string; requestId: string; filters: AdmissionActivityFilters }) {
    return runScopedAdmissionRead({ accounts: this.accounts, clock: this.clock, routing: this.readers.resolveTribe }, query, async ({ first, scope }) => {
      const currentUsage = await this.readers.usage.read(scope);
      if (!currentUsage.ok) {
        const code = Object.values(ADMISSION_ERROR_CODE).find((candidate) => candidate === currentUsage.failure.code) ?? ADMISSION_ERROR_CODE.unexpectedFailure;
        return { ok: false as const, failure: admissionFailure(code, { cause: currentUsage.failure }) };
      }
      const metrics = await this.readers.observations.metrics(scope);
      if (!metrics.ok) return metrics;
      const activity = await this.readers.observations.activity({ ...query.filters, ...scope });
      if (!activity.ok) return activity;
      const { current, now } = await confirmSameAdmissionAccount(this.accounts, first, this.clock);
      const cursor = query.filters.cursor;
      return { ok: true as const, value: admissionActivityReadyPageStateSchema.parse({
        kind: ADMISSION_ACTIVITY_PAGE_KIND.ready, slug: query.slug, tribeId: scope.tribeId, viewerId: current.userId, renderedAt: now.toISOString(),
        selection: { limit: query.filters.limit,
          ...(query.filters.resourceType ? { resourceType: query.filters.resourceType } : {}),
          ...(query.filters.resourceId ? { resourceId: query.filters.resourceId } : {}),
          ...(cursor ? { cursor: `${cursor.at}${ADMISSION_ACTIVITY_QUERY.cursorSeparator}${cursor.id}` } : {}),
        },
        activity: activity.value, metrics: metrics.value, currentUsage: currentUsage.value,
      }) };
    });
  }
}
