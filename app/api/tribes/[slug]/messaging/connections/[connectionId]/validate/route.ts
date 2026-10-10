/** Exposes explicit staged credential validation without dispatching or activating channels. @module messaging-credential-validation-route */
import {createMessagingCredentialValidationRequestModule} from "@/src/modules/setup";
import {createMessagingCredentialValidationHandler} from "@/src/modules/messaging/infrastructure/api/messaging-credential-validation-handler";

/** @param request - Own confirmed validation input. @param context - Canonical framework params. @returns Original guarded credential metadata or safe current failure. */
export async function POST(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}){
  return createMessagingCredentialValidationHandler(()=>createMessagingCredentialValidationRequestModule())(request,context);
}
