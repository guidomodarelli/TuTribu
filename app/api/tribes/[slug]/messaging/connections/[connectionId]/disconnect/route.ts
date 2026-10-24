/** Wires confirmed ordinary disconnection to current authority and mandatory owned dependency checks. @module messaging-connection-disconnect-route */
import {createMessagingConnectionLifecycleRequestModule} from "@/src/modules/setup";
import {createMessagingConnectionLifecycleHandlers} from "@/src/modules/messaging/infrastructure/api/messaging-connection-lifecycle-handlers";
/** @param request - Original consent/CAS. @param context - Exact framework resource. @returns Original local retirement metadata, with external revocation kept separate. */
export async function POST(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}){return createMessagingConnectionLifecycleHandlers(()=>createMessagingConnectionLifecycleRequestModule()).disconnect(request,context);}
