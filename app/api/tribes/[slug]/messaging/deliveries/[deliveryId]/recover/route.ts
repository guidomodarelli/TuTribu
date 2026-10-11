/** Wires explicit original notification recovery through native application services only. @module notification-delivery-recovery-route */
import { createNotificationDeliveryRecoveryRequestModule } from "@/src/modules/setup";
import { createNotificationDeliveryRecoveryHandler } from "@/src/modules/messaging/infrastructure/api/notification-delivery-recovery-handler";

export const POST = createNotificationDeliveryRecoveryHandler(createNotificationDeliveryRecoveryRequestModule);
