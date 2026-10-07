/** Exposes explicit immutable resource configuration without sending or activating channels. @module messaging-connection-configuration-route */
import {createMessagingConnectionConfigurationRequestModule} from "@/src/modules/setup";
import {createMessagingConnectionConfigurationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-connection-configuration-handler";
/** @param request - Own original confirmed configuration action. @param context - Canonical framework params. @returns Original guarded configuration metadata or a safe current failure. */
export async function PUT(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}){return createMessagingConnectionConfigurationHandler(()=>createMessagingConnectionConfigurationRequestModule())(request,context);}
