/** Confirms only the received diagnostic code, never an admission or global-auth proof. @module messaging-diagnostic-verify-route */
import {createMessagingDiagnosticRequestModule} from "@/src/modules/setup";
import {createMessagingDiagnosticHandlers} from "@/src/modules/messaging/infrastructure/api/messaging-diagnostic-handlers";
/** @param request - Original local received-code operation. @param context - Exact diagnostic and connection params. @returns Safe original local capability outcome without another message. */
export async function POST(request:Request,context:{params:Promise<{slug:string;connectionId:string;diagnosticId:string}>}){return createMessagingDiagnosticHandlers((requestContext)=>createMessagingDiagnosticRequestModule(requestContext)).verify(request,context);}
