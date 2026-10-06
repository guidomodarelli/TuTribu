/** Wires read-only owned intent status without replaying OAuth or consuming a nonce. */
import {createRequestReauthenticationModule} from "@/src/modules/auth/reauthentication-setup";
import {getReauthenticationIntent} from "@/src/modules/auth/infrastructure/api/reauthentication-route-handlers";

/** @param request - Existing HTTP request. @param context - Async framework params. @returns Safe current state. */
export async function GET(request:Request,context:{params:Promise<{intentId:string}>}):Promise<Response> {
  return getReauthenticationIntent(request,await context.params,createRequestReauthenticationModule);
}
