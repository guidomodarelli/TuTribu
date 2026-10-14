/** Rechecks native leader authority around private history and real aggregate reads. @module get-admission-activity-and-metrics-use-cases */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionActivityReader, AdmissionActivityFilters } from "../ports/admission-activity-reader";
import { parseAdmissionActivityPage } from "../results/admission-activity-result";
import { parseAdmissionMetricsResult } from "../results/admission-metrics-result";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";

/** Queries carry selection and correlation, never browser-selected identity or permission. */
type AdmissionActivityQuery = { tribeId: string; requestId: string };
/** Reading history cannot dispatch, decrypt, mutate configuration or change its version. */
export class GetAdmissionActivityAndMetricsUseCases {
  /** @param resolver - Current native scoped authority. @param reader - Transactional own projections and authorized-read audit. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly reader: AdmissionActivityReader) {}
  /** @param query - Native scope selection. @param read - One authorized own projection. @returns Its result after the same native account/session remains allowed. */
  private async execute<Value>(query: AdmissionActivityQuery, read: (scope: AdmissionCommandScope) => Promise<Value>) {
    try {
      const command = { ...query, action: ADMISSION_ACTION.readAudit };
      const first = await this.resolver.execute(command);
      if (!first.allowed) return { ok: false as const, failure: first.failure };
      const scope = { ...query, userId: first.context.userId, sessionId: first.context.sessionId };
      const value = await read(scope);
      const current = await this.resolver.execute(command);
      if (!current.allowed) return { ok: false as const, failure: current.failure };
      if (current.context.userId !== scope.userId || current.context.sessionId !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      return { ok: true as const, value };
    } catch (error) { return admissionOperationFailure(error); }
  }
  /** @param query - Bounded same-tribe selection. @returns Only reconstructible safe owner facts for the current leader. */
  activity(query: AdmissionActivityQuery & AdmissionActivityFilters) {
    return this.execute(query, async (scope) => parseAdmissionActivityPage(await this.reader.readActivity(scope, query), scope.tribeId));
  }
  /** @param query - Exact tribe selected by the native resolver. @returns Observed aggregates; absent history remains explicit. */
  metrics(query: AdmissionActivityQuery) {
    return this.execute(query, async (scope) => parseAdmissionMetricsResult(await this.reader.readMetrics(scope), scope.tribeId));
  }
}
