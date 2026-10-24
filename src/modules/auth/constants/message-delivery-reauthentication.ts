/** Declares exact delivery-related sensitive operation scopes, persisted by name in audits. @module message-delivery-reauthentication */
export type MessageDeliveryReauthenticationOperation = "reconcile_message_delivery" | "recover_notification_delivery";
/** Reconciliation uses the original connection; recovery binds its original notification delivery. */
export const MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION = {
  reconcile: "reconcile_message_delivery", recoverNotification: "recover_notification_delivery",
} as const satisfies Record<string, MessageDeliveryReauthenticationOperation>;
