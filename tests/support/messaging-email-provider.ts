/** Supplies an email-only double at the application's own inspector and delivery ports. @module messaging-email-provider */
import { randomUUID } from "node:crypto";
import type { MessagingProviderDescriptor } from "@/src/modules/messaging/infrastructure/messaging-provider-registry";
import { MessagingConnectionOperationError } from "@/src/modules/messaging/domain/errors/messaging-connection-operation-error";
import { MESSAGE_RECEIPT_REASON } from "@/src/modules/messaging/constants/message-delivery";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/** Transient synthetic messages remain private to the test and are never printed or persisted. */
export type TestEmailDelivery = { deliveryId: string; attemptId: string; recipient: string; code: string };

/**
 * Creates a functional own-port adapter without phone or template methods.
 * @param senderId - The exact synthetic resource configured before the immutable version is created.
 * @param beforeSend - Optional observation at the RPC boundary, outside SQL transactions.
 * @returns A test-only descriptor and transient own deliveries; no production registration is changed.
 */
export function createTestEmailProvider(senderId: string, beforeSend: () => void = () => {}) {
  const deliveries: TestEmailDelivery[] = [];
  const sender = { resourceId: senderId, name: "Correo de prueba", channels: ["email"] as const, canSendWhatsappTemplates: false };
  const descriptor: MessagingProviderDescriptor = {
    id: "synthetic-email",
    channels: ["email"],
    createInspector: () => ({
      inspectCredential: async (signal) => {
        signal.throwIfAborted();
        return { isTestMode: false, apiKeyId: randomUUID(), projectId: randomUUID(), teamId: randomUUID() };
      },
      listSenders: async (signal) => {
        signal.throwIfAborted();
        return [sender];
      },
      retrieveSender: async (resourceId, signal) => {
        signal.throwIfAborted();
        if (resourceId !== senderId) throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.missingCapability);
        return sender;
      },
    }),
    createSender: (preparation) => ({
      prepare: async (context, signal) => {
        signal.throwIfAborted();
        const prepared = await preparation.prepare(context, signal);
        signal.throwIfAborted();
        if (prepared.intent.channel !== "email" || prepared.intent.senderId !== senderId) throw new MessagingConnectionOperationError(MESSAGING_ERROR_CODE.missingCapability);
        return {
          send: async (rpcSignal) => {
            signal.throwIfAborted();
            rpcSignal.throwIfAborted();
            beforeSend();
            deliveries.push({ deliveryId: context.deliveryId, attemptId: context.attemptId, recipient: prepared.intent.recipient, code: prepared.intent.code });
            return { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: MESSAGE_RECEIPT_REASON.accepted };
          },
        };
      },
    }),
  };
  return { descriptor, deliveries };
}
