/** Defines own preference storage without enabling a provider or creating an email intent. @module admission-notification-preference-repository */
import type {
  AdmissionNotificationPreferenceChange,
  AdmissionNotificationPreferenceChangePlan,
  AdmissionNotificationPreferenceResolution,
} from "../entities/admission-notification-preference";

/** Binds the recipient to the actual server-resolved native account and session. */
export type AdmissionNotificationPreferenceScope = {
  readonly tribeId: string;
  readonly userId: string;
  readonly sessionId: string;
};

/** Persists explicit choices with current authority and real compare-and-swap semantics. */
export interface AdmissionNotificationPreferenceRepository {
  /** Resolves a role default without inserting a row; unavailable authority throws before exposure. */
  getOwn(scope: AdmissionNotificationPreferenceScope): Promise<AdmissionNotificationPreferenceResolution>;
  /** Commits one explicit choice or rejects its stale version; session loss rolls back staged changes. */
  changeOwn(scope: AdmissionNotificationPreferenceScope, change: AdmissionNotificationPreferenceChange): Promise<AdmissionNotificationPreferenceChangePlan>;
}
