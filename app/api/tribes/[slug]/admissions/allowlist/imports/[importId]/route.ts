/** Wires read-only own import data and preserved progress without claims or recency renewal. @module allowlist-import-route */
import { createAllowlistRequestModule } from "@/src/modules/setup";
import { createAllowlistImportHandlers } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-import-handlers";
/** @param request - Current import query. @param context - Native tribe/import params. @returns Current authorized own snapshot or safe failure. */
export async function GET(request: Request, context: { params: Promise<{ slug: string; importId: string }> }) {
  return createAllowlistImportHandlers(createAllowlistRequestModule).read(request, context);
}
