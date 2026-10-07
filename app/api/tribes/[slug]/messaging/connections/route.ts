/** Exposes explicit protected candidate creation, without validation, diagnostics or activation. @module messaging-connections-route */
import { createMessagingConnectionManagementRequestModule } from "@/src/modules/setup";
import { createMessagingConnectionHandlers } from "@/src/modules/messaging/infrastructure/api/messaging-connection-handlers";

/** @param request - Native confirmed creation input. @param context - Canonical framework params. @returns Original guarded metadata with no credential or provider call. */
export async function POST(request:Request,context:{params:Promise<{slug:string}>}){
  return createMessagingConnectionHandlers(()=>createMessagingConnectionManagementRequestModule()).create(request,context);
}
