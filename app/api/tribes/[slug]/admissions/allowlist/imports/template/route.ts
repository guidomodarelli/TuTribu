/** Wires the blank CSV template only for a current academy leader. @module allowlist-import-template-route */
import { createAllowlistRequestModule } from "@/src/modules/setup";
import { createAllowlistImportHandlers } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-import-handlers";
/** @param request - Read-only own template request. @param context - Native tribe params. @returns Fixed two-column attachment without preview or list effects. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAllowlistImportHandlers(createAllowlistRequestModule).template(request, context);
}
