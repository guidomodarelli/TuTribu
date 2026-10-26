/** Maps only consumed pinned provider fields into owned resource selections. @module zavu-resource-mapper */
import type { Sender } from "@zavudev/sdk/resources/senders/senders";
import type { Template } from "@zavudev/sdk/resources/templates";
import type { MessagingSenderResource, MessagingTemplateResource } from "@/src/modules/messaging/domain/repositories/messaging-connection-inspector";
import { ZAVU_DELIVERY_CHANNEL } from "@/src/modules/messaging/constants/zavu-delivery";
import { ZAVU_TEMPLATE_PREPARATION } from "@/src/modules/messaging/constants/zavu-inspection";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import { ZavuInspectionError } from "./zavu-inspection-error";

/**
 * Projects capability metadata without inferring it from phone/email addresses.
 * @param sender - Real provider detail or list item; unrelated fields remain unconsumed.
 * @param expectedResourceId - Exact requested identity for a detail operation.
 * @returns Owned selection without webhook secrets or contact addresses.
 * @throws ZavuInspectionError when consumed identity cannot be used or crosses the requested selection.
 */
export function mapZavuSenderResource(sender: Sender, expectedResourceId?: string): MessagingSenderResource {
  if (!sender || typeof sender.id !== "string" || !sender.id || expectedResourceId !== undefined && sender.id !== expectedResourceId) throw new ZavuInspectionError("sender", messagingFailure(MESSAGING_ERROR_CODE.upstreamPayloadUnusable));
  const channels = Array.isArray(sender.channels) ? Object.values(ZAVU_DELIVERY_CHANNEL).filter((channel) => sender.channels!.includes(channel)) : [];
  return { resourceId: sender.id, name: typeof sender.name === "string" ? sender.name : sender.id, channels, canSendWhatsappTemplates: channels.includes(ZAVU_DELIVERY_CHANNEL.whatsapp) && sender.whatsapp?.paymentStatus?.canSendTemplates === true };
}

/**
 * Projects approval and language without assuming sender compatibility or successful code receipt.
 * @param template - Real provider detail or list item, without a full schema revalidation.
 * @param expectedResourceId - Exact requested identity for a detail operation.
 * @returns Owned selection with no body, namespace or provider-only metadata.
 * @throws ZavuInspectionError when the consumed identity or language is unusable.
 */
export function mapZavuTemplateResource(template: Template, expectedResourceId?: string): MessagingTemplateResource {
  if (!template || typeof template.id !== "string" || !template.id || typeof template.language !== "string" || !template.language || expectedResourceId !== undefined && template.id !== expectedResourceId) throw new ZavuInspectionError("template", messagingFailure(MESSAGING_ERROR_CODE.upstreamPayloadUnusable));
  return { resourceId: template.id, name: typeof template.name === "string" ? template.name : template.id, language: template.language, authenticationApproved: template.category === ZAVU_TEMPLATE_PREPARATION.authentication && template.status === ZAVU_TEMPLATE_PREPARATION.approved };
}
