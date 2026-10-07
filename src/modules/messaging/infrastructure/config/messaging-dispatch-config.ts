/** Resolves bounded server-owned settings without accepting browser overrides or manufacturing a sender. @module messaging-dispatch-config */
import { MESSAGING_DISPATCH_DEFAULT, MESSAGING_DISPATCH_BOUND } from "@/src/modules/messaging/constants/messaging-dispatch";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import type { MessagingDispatchSettings } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MessagingDeliveryStorageError } from "@/src/modules/messaging/domain/errors/messaging-delivery-storage-error";
import { MESSAGE_STORAGE_OPERATION } from "@/src/modules/messaging/constants/message-delivery";

/**
 * Builds explicit portable runtime bounds, leaving lease headroom beyond the run deadline.
 * @param input - Server deployment overrides, validated once during composition.
 * @returns Immutable bounded settings with the specification defaults.
 * @throws MessagingDeliveryStorageError for an invalid timeout, capacity or lease/run relationship.
 */
export function createMessagingDispatchConfig(input: Partial<MessagingDispatchSettings> = {}): Readonly<MessagingDispatchSettings> {
  const settings = { ...MESSAGING_DISPATCH_DEFAULT, ...input };
  if (Object.values(settings).some((value) => !Number.isInteger(value) || value <= 0)
    || settings.concurrency > MESSAGING_DISPATCH_BOUND.maximumConcurrency
    || settings.batchLimit > MESSAGING_DISPATCH_BOUND.maximumBatch
    || settings.leaseSeconds > MESSAGING_DISPATCH_BOUND.maximumLeaseSeconds
    || settings.requestTimeoutMs > MESSAGING_DISPATCH_BOUND.maximumRequestTimeoutMs
    || settings.runBudgetMs > MESSAGING_DISPATCH_BOUND.maximumRunBudgetMs
    || settings.leaseSeconds * MILLISECONDS_PER_SECOND <= settings.runBudgetMs) throw new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.invalidInput, { operation: MESSAGE_STORAGE_OPERATION.claim });
  return Object.freeze(settings);
}
