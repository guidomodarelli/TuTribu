/** Sends one explicit verification intent through the real pinned SDK with owned transport scope. @module zavu-message-delivery-sender */
import "server-only";
import type { MessageDeliveryReceipt } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { PreparedVerificationDelivery } from "../verification-delivery-preparation";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { ZAVU_DELIVERY_CHANNEL, ZAVU_MESSAGE_TYPE, VERIFICATION_MESSAGE_COPY, ZAVU_OTP_TEMPLATE_PARAMETER } from "@/src/modules/messaging/constants/zavu-delivery";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { assertPreparedMessageDeliveryScope } from "../message-delivery-preparation";
import type { ZavuMessageDeliveryContent } from "./zavu-message-delivery-transport";
import { ZavuPreparedDeliverySender } from "./zavu-prepared-delivery-sender";

/** Creates a per-attempt SDK client; it never mutates a singleton key/sender or posts a retry. */
export class ZavuMessageDeliverySender extends ZavuPreparedDeliverySender<PreparedVerificationDelivery> {
  /** @param context - Original committed scope. @param prepared - Transient own material fixed to that attempt. @param signal - The exact RPC deadline. @returns Own transport evidence without another preparation or retry. */
  protected async sendPrepared(context: AuthorizedDeliveryMessagingContext, prepared: PreparedVerificationDelivery, signal: AbortSignal): Promise<Omit<MessageDeliveryReceipt, "context">> {
    signal.throwIfAborted();
    const intent = prepared.intent;
    assertPreparedMessageDeliveryScope(context, prepared);
    const templateId = intent.channel === ZAVU_DELIVERY_CHANNEL.whatsapp ? intent.templateId : undefined;
    if (intent.channel === ZAVU_DELIVERY_CHANNEL.whatsapp && (!templateId || !intent.templateLanguage)) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.connectionIncomplete);
    const text = `${VERIFICATION_MESSAGE_COPY.prefix}${intent.code}${VERIFICATION_MESSAGE_COPY.suffix}`;
    const content: ZavuMessageDeliveryContent = templateId ? { messageType: ZAVU_MESSAGE_TYPE.template, content: { templateId, templateVariables: { [ZAVU_OTP_TEMPLATE_PARAMETER]: intent.code } } } : { messageType: ZAVU_MESSAGE_TYPE.text, text, ...(intent.channel === ZAVU_DELIVERY_CHANNEL.email ? { subject: VERIFICATION_MESSAGE_COPY.subject } : {}) };
    return this.transport.send(context, prepared, content, signal);
  }
}
