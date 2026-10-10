/** Binds messaging maintenance authority to a current trusted server secret and native HTTP request. @module request-maintenance-authorizer */
import "server-only";
import { isAuthorizedCronRequest } from "@/src/modules/shared/infrastructure/http/cron-authorization";

/**
 * Creates the maintenance gate consumed by private outbox and material repositories.
 * @param request - Actual inbound maintenance request, never a browser permission flag.
 * @param readCurrentSecret - Hosting-owned live secret reader; explicit injection supports worker bindings.
 * @returns An authority callback rechecking the bearer before and after each protected operation.
 * @remarks Missing/rotated authority fails closed. No account, connection, key or SQL read occurs here.
 */
export function createRequestMessagingMaintenanceAuthorizer(
  request: Request,
  readCurrentSecret: () => string | undefined = () => process.env.CRON_SECRET,
): () => Promise<boolean> {
  return async () => isAuthorizedCronRequest(request, readCurrentSecret());
}
