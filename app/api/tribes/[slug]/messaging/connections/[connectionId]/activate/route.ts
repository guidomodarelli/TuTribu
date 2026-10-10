/** Selects only a confirmed locally tested production candidate using current native authority. @module messaging-connection-activation-route */
import {createMessagingConnectionActivationRequestModule} from "@/src/modules/setup";
import {createMessagingConnectionActivationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-connection-activation-handler";
/** @param request - Original confirmed lifecycle CAS. @param context - Exact framework resource. @returns Minimal original selected/replaced metadata or safe current failure, without a provider call. */
export async function POST(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}){return createMessagingConnectionActivationHandler(()=>createMessagingConnectionActivationRequestModule())(request,context);}
