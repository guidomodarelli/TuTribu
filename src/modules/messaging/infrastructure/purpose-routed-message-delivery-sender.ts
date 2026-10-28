/** Selects a private sender only from the original marker's native immutable provenance. @module purpose-routed-message-delivery-sender */
import "server-only";
import { ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "../constants/notification-delivery-recovery";
import { MESSAGING_ERROR_CODE } from "../constants/messaging-errors";
import { MessagingSecretAccessError } from "../domain/errors/messaging-secret-access-error";
import type { MessageDeliverySender, PreparedMessageDeliverySender } from "../domain/repositories/message-delivery-sender";
import type { AuthorizedDeliveryMessagingContext } from "../domain/repositories/messaging-repositories";

/** Verification purposes routed to the OTP/diagnostic owner; the marker's persisted purpose is checked at runtime. */
const VERIFICATION_DELIVERY_PURPOSES: ReadonlySet<string> = new Set([ADMISSION_VERIFICATION_PURPOSE.admission, ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic]);

/** Preserves distinct complete-email and code preparations without inferring a source from its identifier. */
export class PurposeRoutedMessageDeliverySender implements MessageDeliverySender {
  /** @param verification - Original OTP/diagnostic material owner. @param notification - Complete-group material owner, absent for an exact focal launch. */
  constructor(private readonly verification: MessageDeliverySender, private readonly notification?: MessageDeliverySender) {}

  /** @param context - Original committed marker with native routing facts. @param signal - Original bounded run cancellation. @returns Only the matching prepared operation, without RPC, fallback or retry. @throws MessagingSecretAccessError for missing or incompatible provenance or an unsupported reference-only notification. */
  async prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedMessageDeliverySender> {
    signal.throwIfAborted();
    if (context.deliveryPurpose === NOTIFICATION_DELIVERY_RECOVERY_PURPOSE) {
      if (context.notificationGroupId === null || !this.notification) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
      return this.notification.prepare(context, signal);
    }
    if (context.notificationGroupId === null && VERIFICATION_DELIVERY_PURPOSES.has(context.deliveryPurpose)) return this.verification.prepare(context, signal);
    throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.resourceUnavailable);
  }
}
