/** Wires an authorized ephemeral CSV report with inert data and no GET mutation. @module allowlist-import-report-route */
import { createAllowlistRequestModule } from "@/src/modules/setup";
import { createAllowlistImportHandlers } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-import-handlers";
/** @param request - Own report query. @param context - Native import scope. @returns Private attachment or safe JSON failure after current access checks. */
export async function GET(request: Request, context: { params: Promise<{ slug: string; importId: string }> }) {
  return createAllowlistImportHandlers(createAllowlistRequestModule).report(request, context);
}
