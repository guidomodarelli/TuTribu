/** Reads only the current leader's original early usage operation without claiming or retrying it. @module messaging-usage-operation-route */
import { createMessagingUsageRequestModule } from "@/src/modules/setup";
import { createMessagingUsageOperationHandler } from "@/src/modules/messaging/infrastructure/api/messaging-usage-operation-handler";
/** @param request - Native read-only request. @param context - Canonical tribe and exact original UUID. @returns Original own result or safe current denial/absence, without mutation recency. */
export async function GET(request: Request, context: { params: Promise<{ slug: string; operationId: string }> }) {
  return createMessagingUsageOperationHandler(() => createMessagingUsageRequestModule())(request, context);
}
