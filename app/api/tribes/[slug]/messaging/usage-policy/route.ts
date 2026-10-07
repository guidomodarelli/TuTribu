/** Exposes the single early country/quota owner independently of messaging connection setup. @module messaging-usage-policy-route */
import { createMessagingUsageRequestModule } from "@/src/modules/setup";
import { createMessagingUsagePolicyHandlers } from "@/src/modules/messaging/infrastructure/api/messaging-usage-policy-handlers";
import { DATABASE_CONNECTION_USAGE } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param request - Native read. @param context - Canonical framework params. @returns Safe configured/absence state with no resource creation or provider access. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createMessagingUsagePolicyHandlers(() => createMessagingUsageRequestModule()).read(request, context);
}
/** @param request - Explicit confirmed initialization. @param context - Canonical framework params. @returns Original defaults or unchanged existing configuration after current scoped recency. */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createMessagingUsagePolicyHandlers(() => createMessagingUsageRequestModule(DATABASE_CONNECTION_USAGE.maintenance)).initialize(request, context);
}
/** @param request - Explicit country/quota intent and observed version. @param context - Canonical framework params. @returns Original CAS/no-op/progress without resetting consumed quota or sending a message. */
export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  return createMessagingUsagePolicyHandlers(() => createMessagingUsageRequestModule(DATABASE_CONNECTION_USAGE.maintenance)).update(request, context);
}
