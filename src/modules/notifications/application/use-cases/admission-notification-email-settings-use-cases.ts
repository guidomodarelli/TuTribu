/** Resolves current independent email authority before private queries or explicit configuration changes. @module admission-notification-email-settings-use-cases */
import type { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { admissionOperationFailure } from "@/src/modules/academy-admissions/application/results/admission-operation-failure";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AdmissionNotificationEmailSettingsCommand, AdmissionNotificationEmailSettingsRepository } from "../../domain/repositories/admission-notification-email-settings-repository";

/** Carries validated tenant/correlation only; the current identity and role always come from the server. */
type EmailSettingsQuery = { tribeId: string; requestId: string };

/** Keeps native current state separate from the original operation's historical result. */
export class AdmissionNotificationEmailSettingsUseCases {
  /** @param resolver - Actual current identity, resource and scoped recency owner. @param repository - Private atomic settings/ledger owner. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly repository: AdmissionNotificationEmailSettingsRepository) {}

  /** @param query - Exact native tenant and correlation. @returns Read-only configuration for its current leader; no recency, provider or initialization work is requested. */
  async read(query: EmailSettingsQuery) {
    try {
      const authority = await this.resolver.execute({ ...query, action: ADMISSION_ACTION.readPolicy });
      return authority.allowed ? { ok: true as const, value: await this.repository.get(authority.context) } : { ok: false as const, failure: authority.failure };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param input - Boundary-validated explicit desired settings and original operation/version. @returns Only the native writer's confirmed result or registered progress, without sending a message. */
  async change(input: EmailSettingsQuery & AdmissionNotificationEmailSettingsCommand) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.configurePolicy, sensitiveOperation: REAUTHENTICATION_OPERATION.updateAdmissionEmailSettings });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      return { ok: true as const, value: await this.repository.change(authority.context, { operationId: input.operationId, confirmed: input.confirmed, expectedVersion: input.expectedVersion, enabled: input.enabled, timeZone: input.timeZone }) };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
