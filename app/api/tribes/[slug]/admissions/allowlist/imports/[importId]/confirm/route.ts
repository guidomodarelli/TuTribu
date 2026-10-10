/** Wires explicit observed-version selection and original confirmation without browser authority. @module allowlist-import-confirm-route */
import { createAllowlistRequestModule } from "@/src/modules/setup";
import { createAllowlistImportHandlers } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-import-handlers";
/** @param request - Explicit selected rows, confirmation and original operation. @param context - Native import scope. @returns Confirmed original counts or genuine started progress. */
export async function POST(request: Request, context: { params: Promise<{ slug: string; importId: string }> }) {
  return createAllowlistImportHandlers(createAllowlistRequestModule).confirm(request, context);
}
