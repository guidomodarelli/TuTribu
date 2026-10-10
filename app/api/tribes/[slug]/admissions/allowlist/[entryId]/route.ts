/** Wires current list-entry metadata and observed-version edits without changing contacts or membership. @module admission-allowlist-entry-route */
import { createAllowlistRequestModule } from "@/src/modules/setup";
import { createAllowlistHandlers } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-handlers";

/** @param request - Own current entry query. @param context - Native tribe/entry params. @returns Current leader metadata without claiming an operation. */
export async function GET(request: Request, context: { params: Promise<{ slug: string; entryId: string }> }) {
  return createAllowlistHandlers(createAllowlistRequestModule).read(request, context);
}

/** @param request - Explicit name/state patch and original operation/version. @param context - Native entry params. @returns Its original CAS result after exact signed global recency. */
export async function PATCH(request: Request, context: { params: Promise<{ slug: string; entryId: string }> }) {
  return createAllowlistHandlers(createAllowlistRequestModule).update(request, context);
}
