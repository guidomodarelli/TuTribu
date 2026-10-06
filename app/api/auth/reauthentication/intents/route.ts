/** Wires the explicit global reauthentication intent endpoint to owned application composition. */
import {createRequestReauthenticationModule} from "@/src/modules/auth/reauthentication-setup";
import {postReauthenticationIntent} from "@/src/modules/auth/infrastructure/api/reauthentication-route-handlers";

/** @param request - Existing native HTTP request. @returns Safe own intent state after validation. */
export async function POST(request:Request):Promise<Response> {
  return postReauthenticationIntent(request,createRequestReauthenticationModule);
}
