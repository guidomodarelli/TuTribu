/** Wires leader-only list queries and explicit creation to their feature-owned use cases. @module admission-allowlist-route */
import { createAllowlistRequestModule } from "@/src/modules/setup";
import { createAllowlistHandlers } from "@/src/modules/academy-admissions/infrastructure/api/allowlist-handlers";

/** @param request - Bounded own list query. @param context - Native tribe params. @returns Current authorized metadata without mutating the list. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAllowlistHandlers(createAllowlistRequestModule).list(request, context);
}

/** @param request - Explicit version-free creation proposal. @param context - Native tribe params. @returns Original creation after exact leader/session/recency checks. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createAllowlistHandlers(createAllowlistRequestModule).create(request, context);
}
