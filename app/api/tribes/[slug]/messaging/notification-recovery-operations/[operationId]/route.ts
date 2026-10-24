/** Wires original readonly notification recovery through native application services. @module notification-recovery-operation-route */
import { createNotificationRecoveryOperationRequestModule } from "@/src/modules/setup";
import { createNotificationRecoveryOperationHandler } from "@/src/modules/messaging/infrastructure/api/notification-recovery-operation-handler";

export const GET = createNotificationRecoveryOperationHandler(createNotificationRecoveryOperationRequestModule);
