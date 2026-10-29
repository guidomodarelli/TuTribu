/** Resolves only the provider already checked by native notification material preparation. @module registered-notification-delivery-sender */
import "server-only";
import type { PreparedMessageDeliverySender } from "../domain/repositories/message-delivery-sender";
import type { AuthorizedDeliveryMessagingContext } from "../domain/repositories/messaging-repositories";
import { MessagingConnectionOperationError } from "../domain/errors/messaging-connection-operation-error";
import { MESSAGING_ERROR_CODE } from "../constants/messaging-errors";
import type { MessagingProviderRegistry } from "./messaging-provider-registry";
import type { NotificationDeliveryPreparation } from "./notification-delivery-preparation";
import { PreparedDeliverySender } from "./prepared-delivery-sender";

/** Prepared notification material of one committed attempt. */
type PreparedNotificationDelivery = Awaited<ReturnType<NotificationDeliveryPreparation["prepare"]>>;

/** Keeps provider resolution explicit and does not substitute verification content or another provider. */
export class RegisteredNotificationDeliverySender extends PreparedDeliverySender<PreparedNotificationDelivery> {
  /** @param registry - Explicit implemented provider allowlist. @param preparation - Native provider, original payload, current destination and private credential owner. */
  constructor(private readonly registry: MessagingProviderRegistry, preparation: NotificationDeliveryPreparation) { super(preparation); }

  /** @param context - Original committed attempt. @param prepared - Native prepared material. @param signal - Remaining run deadline. @returns One transient prepared operation without another native preparation or an RPC. @throws MessagingConnectionOperationError before SDK when notification email is unsupported. */
  protected fromPrepared(context: AuthorizedDeliveryMessagingContext, prepared: PreparedNotificationDelivery, signal: AbortSignal): Promise<PreparedMessageDeliverySender> {
    const descriptor = this.registry.resolve(prepared.providerId, prepared.intent.channel);
    if (!descriptor.createNotificationSender) throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.missingCapability);
    return descriptor.createNotificationSender({ prepare: async () => prepared }).prepare(context, signal);
  }
}
