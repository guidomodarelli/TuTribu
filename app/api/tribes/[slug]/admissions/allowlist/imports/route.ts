/** Wires explicit leader CSV preview without adding contacts through GET. @module allowlist-imports-route */
import { createAllowlistRequestModule } from "@/src/modules/setup";
import { createAllowlistImportHandlers } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-import-handlers";
/** @param request - Explicit file, policy and original command. @param context - Native tribe route. @returns Original preview after current leader/recency checks. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAllowlistImportHandlers(createAllowlistRequestModule).preview(request, context);
}
