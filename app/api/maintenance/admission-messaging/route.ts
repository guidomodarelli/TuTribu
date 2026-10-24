/** Exposes only the bounded native-bearer admission maintenance workflow, without installing a scheduler. @module admission-messaging-maintenance-route */
import { isAuthorizedCronRequest } from "@/src/modules/shared/infrastructure/http/cron-authorization";
import { createAdmissionMessagingMaintenanceHandler } from "@/src/modules/messaging/infrastructure/api/admission-messaging-maintenance-handler";

/** @param request - Actual server/hosting request with its native bearer. @returns Safe phase results and health, or a private no-store boundary failure. */
export async function GET(request: Request): Promise<Response> {
  return createAdmissionMessagingMaintenanceHandler({
    authorize: isAuthorizedCronRequest,
    create: async (authorizedRequest, context) => {
      const { createAdmissionMessagingMaintenanceRequestModule } = await import("@/src/modules/setup");
      return createAdmissionMessagingMaintenanceRequestModule(authorizedRequest, context);
    },
  })(request);
}
