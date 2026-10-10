/** Defines private credential facts and minimal resource projections independent of provider SDK types. @module messaging-connection-inspector */

/** Keeps provider account references server-only; authentication does not prove a channel. */
export type MessagingCredentialInspection = { isTestMode: boolean; apiKeyId: string; projectId: string; teamId: string };
/** Projects an external sender selection without addresses, webhook configuration or secrets. */
export type MessagingSenderResource = { resourceId: string; name: string; channels: readonly ("email" | "sms" | "whatsapp")[]; canSendWhatsappTemplates: boolean };
/** Separates resource preparation from an exact sender/version diagnostic. */
export type MessagingTemplateResource = { resourceId: string; name: string; language: string; authenticationApproved: boolean };

/** Inspects a single already authorized connection; none of these methods sends or provisions resources. */
export interface MessagingConnectionInspector {
  /** @param signal - Caller cancellation/deadline. @returns Private authenticated account references and actual test mode. */
  inspectCredential(signal: AbortSignal): Promise<MessagingCredentialInspection>;
  /** @param signal - Caller cancellation/deadline. @returns All available sender selections across bounded cursor pages. */
  listSenders(signal: AbortSignal): Promise<readonly MessagingSenderResource[]>;
  /** @param resourceId - Validated external selection. @param signal - Caller cancellation. @returns A selection confirmed by its actual detail operation. */
  retrieveSender(resourceId: string, signal: AbortSignal): Promise<MessagingSenderResource>;
  /** @param signal - Caller cancellation/deadline. @returns All available template selections across bounded cursor pages. */
  listTemplates(signal: AbortSignal): Promise<readonly MessagingTemplateResource[]>;
  /** @param resourceId - Validated external selection. @param signal - Caller cancellation. @returns Confirmed preparation without a delivery claim. */
  retrieveTemplate(resourceId: string, signal: AbortSignal): Promise<MessagingTemplateResource>;
}
