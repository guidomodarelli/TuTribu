/** Builds a single current reviewer SSR snapshot through inward authorized readers. @module get-admission-notification-settings-page-use-case */
import type { AuthenticatedAccountProvider } from "@/src/modules/auth/domain/repositories/authenticated-account-provider";
import { LiveAccountTribePageUseCase, type TribePageQuery } from "@/src/modules/shared/application/live-account-tribe-page-read";
import { ADMISSION_TRIBE_PAGE_FAILURES } from "@/src/modules/academy-admissions/application/use-cases/admission-tribe-scope";
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import type { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import type { admissionOperationFailure } from "@/src/modules/academy-admissions/application/results/admission-operation-failure";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionNotificationPreferencesUseCases } from "./admission-notification-preferences-use-cases";
import type { AdmissionNotificationEmailSettingsUseCases } from "./admission-notification-email-settings-use-cases";
import { toAdmissionNotificationEmailSettingsView, toAdmissionNotificationPreferenceView } from "../results/admission-notification-settings-projection";
import { admissionNotificationSettingsPageStateSchema, ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND } from "../../constants/admission-notification-settings-page";

/** The role hint chooses whether an independently authorized email read is shown; it never grants email configuration authority. */
export class GetAdmissionNotificationSettingsPageUseCase extends LiveAccountTribePageUseCase<AuthenticatedAccount, AdmissionFailure, { ok: false; failure: AdmissionFailure }, ReturnType<typeof admissionOperationFailure>> {
  /** @param accounts - Native global identity. @param readers - Canonical tenant resolver and current authorized settings readers. @param clock - Fresh session validity clock. */
  constructor(accounts: AuthenticatedAccountProvider, private readonly readers: { resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">; preferences: Pick<AdmissionNotificationPreferencesUseCases, "read">; email: Pick<AdmissionNotificationEmailSettingsUseCases, "read"> }, clock: () => Date) { super(accounts, readers, clock, ADMISSION_TRIBE_PAGE_FAILURES); }

  /** @param query - Once-validated route and safe correlation. @returns Minimal props for the same live viewer, or a closed safe failure without partial private data. */
  execute(query: TribePageQuery) {
    return this.readPage(query, async ({ first, tribeId, confirm }) => {
      const selection = { tribeId, requestId: query.requestId };
      // Both reads authorize themselves and only read, so the email read does not wait for the preference's round trips;
      // its result is used only when the preference confirms a leader, and a denial for anyone else is discarded.
      const [preference, emailRead] = await Promise.all([this.readers.preferences.read(selection), this.readers.email.read(selection)]);
      if (!preference.ok) return preference;
      if (preference.value.preference.tribeId !== selection.tribeId || preference.value.preference.recipientUserId !== first.userId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      const email = preference.value.canConfigureEmail ? emailRead : null;
      if (email && !email.ok) return email;
      if (email?.ok && email.value.tribeId !== selection.tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
      const { current } = await confirm();
      return { ok: true as const, value: admissionNotificationSettingsPageStateSchema.parse({ kind: ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND.ready, slug: query.slug, tribeId: selection.tribeId, viewerId: current.userId, preference: toAdmissionNotificationPreferenceView(preference.value.preference), canConfigureEmail: preference.value.canConfigureEmail, email: email?.ok ? toAdmissionNotificationEmailSettingsView(email.value) : null }) };
    });
  }
}
