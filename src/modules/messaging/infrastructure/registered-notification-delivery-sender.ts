/** Resolves only the provider already checked by native notification material preparation. @module registered-notification-delivery-sender */
import "server-only";
import type { MessageDeliverySender, PreparedMessageDeliverySender } from "../domain/repositories/message-delivery-sender";
import type { AuthorizedDeliveryMessagingContext } from "../domain/repositories/messaging-repositories";
import { MessagingConnectionOperationError } from "../domain/errors/messaging-connection-operation-error";
import { MESSAGING_ERROR_CODE } from "../constants/messaging-errors";
import type { MessagingProviderRegistry } from "./messaging-provider-registry";
import type { NotificationDeliveryPreparation } from "./notification-delivery-preparation";

/** Keeps provider resolution explicit and does not substitute verification content or another provider. */
export class RegisteredNotificationDeliverySender implements MessageDeliverySender {
  /** @param registry - Explicit implemented provider allowlist. @param preparation - Native provider, original payload, current destination and private credential owner. */
  constructor(private readonly registry: MessagingProviderRegistry, private readonly preparation: NotificationDeliveryPreparation) {}

  /** @param context - Original marked scope. @param signal - Original run/RPC deadline. @returns Own receipt from the exact selected adapter. */
  async send(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal) { return (await this.prepare(context, signal)).send(signal); }

  /** @param context - Original committed attempt. @param signal - Remaining run deadline. @returns One transient prepared operation without another native preparation or an RPC. @throws MessagingConnectionOperationError before SDK when notification email is unsupported. */
  async prepare(context: AuthorizedDeliveryMessagingContext, signal: AbortSignal): Promise<PreparedMessageDeliverySender> {
    signal.throwIfAborted();
    const prepared = await this.preparation.prepare(context, signal);
    signal.throwIfAborted();
    const descriptor = this.registry.resolve(prepared.providerId, prepared.intent.channel);
    if (!descriptor.createNotificationSender) throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.missingCapability);
    return descriptor.createNotificationSender({ prepare: async () => prepared }).prepare(context, signal);
  }
}
