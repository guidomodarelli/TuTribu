/** Exposes minimal current template references and language after sensitive authorization. @module messaging-templates-route */
import {createMessagingResourceRequestModule} from "@/src/modules/setup";
import {createMessagingResourceHandler} from "@/src/modules/messaging/infrastructure/api/messaging-resource-handler";
import {MESSAGING_RESOURCE_KIND} from "@/src/modules/messaging/constants/messaging-resources";
/** @param request - Bounded own pagination. @param context - Canonical framework params. @returns Exact own metadata without any send, proof or provisioning. */
export async function GET(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}){return createMessagingResourceHandler(MESSAGING_RESOURCE_KIND.templates,()=>createMessagingResourceRequestModule())(request,context);}
