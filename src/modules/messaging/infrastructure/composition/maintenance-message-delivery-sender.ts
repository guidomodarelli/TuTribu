/** Adds only the original shared cancellation/deadline; resource preparation remains immediately before send. @module maintenance-message-delivery-sender */
import "server-only";
import type { MessageDeliverySender } from "../../domain/repositories/message-delivery-sender";
import { AdmissionMessagingMaintenanceError } from "../../domain/errors/admission-messaging-maintenance-error";
import { ADMISSION_MESSAGING_MAINTENANCE_REASON } from "../../constants/admission-messaging-maintenance";

/** @param sender - Existing purpose-specific prepared sender. @param signal - Original workflow cancellation. @param deadlineAtMilliseconds - Original host deadline. @param now - Current host clock. @returns A sender that adds no SQL wait between the final resource preparation and provider request. */
export function guardMaintenanceMessageDeliverySender(sender: MessageDeliverySender, signal: AbortSignal, deadlineAtMilliseconds: number, now: () => number): MessageDeliverySender {
  return {
    /** @param context - Original committed marker. @param preparationSignal - Existing preparation deadline. @returns Its original prepared operation under the same workflow cancellation. */
    async prepare(context, preparationSignal) {
      if (signal.aborted || now() >= deadlineAtMilliseconds) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached);
      const combined = AbortSignal.any([signal, preparationSignal]);
      combined.throwIfAborted();
      const prepared = await sender.prepare(context, combined);
      combined.throwIfAborted();
      return {
        /** @param requestSignal - Existing single provider-request deadline. @returns Only the original request, with no retry or intervening DB work. */
        async send(requestSignal) {
          if (signal.aborted || now() >= deadlineAtMilliseconds) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached);
          const request = AbortSignal.any([signal, requestSignal]);
          request.throwIfAborted();
          return prepared.send(request);
        },
      };
    },
  };
}
