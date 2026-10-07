/** Exposes read-only current messaging metadata with current leader/guardian audience. @module messaging-configuration-route */
import {createMessagingConfigurationRequestModule} from "@/src/modules/setup";
import {createMessagingConfigurationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-configuration-handler";

/** @param request - Native read. @param context - Canonical framework params. @returns Guarded current metadata without creating resources or reading keys. */
export async function GET(request:Request,context:{params:Promise<{slug:string}>}){
  return createMessagingConfigurationHandler(()=>createMessagingConfigurationRequestModule())(request,context);
}
