/** Resolves private destination evidence inside the producer's existing authorized transaction. @module admission-notification-recipient-email-reader */
import type { AdmissionNotificationRecipientEmailScope, TrustedAdmissionNotificationEmail } from "../entities/admission-notification-recipient-email";

/** Reads current account trust without providing capability, preference or permission to dispatch. */
export interface AdmissionNotificationRecipientEmailReader {
  /** @param scope - Server-selected existing original notice and recipient. @returns Its current trusted account email or absence; storage failures must propagate. */
  read(scope: AdmissionNotificationRecipientEmailScope): Promise<TrustedAdmissionNotificationEmail | null>;
}
