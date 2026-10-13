/** Preserves outbox failure identity and actual causes without inventing a confirmed queue effect. @module messaging-delivery-storage-error */
import type { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import type { MESSAGE_STORAGE_OPERATION } from "@/src/modules/messaging/constants/message-delivery";

/** Keeps delivery/attempt ids private while the owner reconciles an indeterminate commit. */
export class MessagingDeliveryStorageError extends Error {
  /**
   * @param code - Closed own persistence or authorization failure.
   * @param options - Fixed operation, minimal original identity and a real caught cause when available.
   */
  constructor(public readonly code: (typeof MESSAGING_ERROR_CODE)[keyof typeof MESSAGING_ERROR_CODE], options: ErrorOptions & { operation: (typeof MESSAGE_STORAGE_OPERATION)[keyof typeof MESSAGE_STORAGE_OPERATION]; deliveryId?: string; attemptId?: string }) {
    super(`MessageDeliveryRepository.${options.operation} failed: ${code}`, options);
    this.name = "MessagingDeliveryStorageError";
    this.deliveryId = options.deliveryId;
    this.attemptId = options.attemptId;
  }
  readonly deliveryId: string | undefined;
  readonly attemptId: string | undefined;
}
