/** Resolves current reviewer authority before reading or changing only the caller's email preference. @module admission-notification-preferences-use-cases */
import type { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import { admissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionOperationFailure } from "@/src/modules/academy-admissions/application/results/admission-operation-failure";
import { ADMISSION_ACTION } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { ADMISSION_NOTIFICATION_PREFERENCE_REJECTION, ADMISSION_NOTIFICATION_PREFERENCE_STATUS } from "../../constants/admission-notification-preference";
import type { AdmissionNotificationPreferenceChange } from "../../domain/entities/admission-notification-preference";
import type { AdmissionNotificationPreferenceRepository, AdmissionNotificationPreferenceScope } from "../../domain/repositories/admission-notification-preference-repository";

/** Carries tenant selection and correlation only; identity and role always come from the server. */
type PreferenceQuery = { tribeId: string; requestId: string };

/** Keeps personal frequency independent of channel enablement, OTP and provider availability. */
export class AdmissionNotificationPreferencesUseCases {
  /** @param resolver - Actual current admission identity and reviewer authority. @param repository - Own-recipient native storage with final session/role checks. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly repository: AdmissionNotificationPreferenceRepository) {}

  /** @param query - Boundary-validated tenant and correlation. @returns An unstored role default or explicit own choice, without initializing or enabling email. */
  async read(query: PreferenceQuery) {
    try {
      const authority = await this.resolver.execute({ ...query, action: ADMISSION_ACTION.readInbox });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const scope: AdmissionNotificationPreferenceScope = { tribeId: query.tribeId, userId: authority.context.userId, sessionId: authority.context.sessionId };
      const result = await this.repository.getOwn(scope);
      if (result.status === ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.permissionDenied) };
      if (result.preference.tribeId !== scope.tribeId || result.preference.recipientUserId !== scope.userId) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable) };
      return { ok: true as const, value: { preference: result.preference, canConfigureEmail: authority.context.role === TRIBE_MEMBER_ROLE.leader } };
    } catch (error) { return admissionOperationFailure(error); }
  }

  /** @param input - Explicit own mode and observed version; browser identity fields are never forwarded. @returns A native change/no-op or explicit stale-version rejection, without provider work. */
  async change(input: PreferenceQuery & AdmissionNotificationPreferenceChange) {
    try {
      const authority = await this.resolver.execute({ tribeId: input.tribeId, requestId: input.requestId, action: ADMISSION_ACTION.readInbox });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const scope: AdmissionNotificationPreferenceScope = { tribeId: input.tribeId, userId: authority.context.userId, sessionId: authority.context.sessionId };
      const result = await this.repository.changeOwn(scope, { mode: input.mode, expectedVersion: input.expectedVersion });
      if (result.status === ADMISSION_NOTIFICATION_PREFERENCE_STATUS.rejected) return result.reason === ADMISSION_NOTIFICATION_PREFERENCE_REJECTION.versionConflict
        ? { ok: true as const, value: result }
        : { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.permissionDenied) };
      if (result.preference.tribeId !== scope.tribeId || result.preference.recipientUserId !== scope.userId) return { ok: false as const, failure: admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable) };
      return { ok: true as const, value: result };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
