/** Wires explicit local safety stops to current native authority and owned evidence effects. @module messaging-connection-suspend-route */
import {createMessagingConnectionLifecycleRequestModule} from "@/src/modules/setup";
import {createMessagingConnectionLifecycleHandlers} from "@/src/modules/messaging/infrastructure/api/messaging-connection-lifecycle-handlers";
/** @param request - Original cause/consent/CAS. @param context - Exact framework resource. @returns Original local stop metadata without provider revocation or message cancellation claims. */
export async function POST(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}){return createMessagingConnectionLifecycleHandlers(()=>createMessagingConnectionLifecycleRequestModule()).suspend(request,context);}
