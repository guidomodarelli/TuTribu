/** Emits one consented diagnostic for an exact current connection and channel. @module messaging-diagnostic-issue-route */
import {createMessagingDiagnosticRequestModule} from "@/src/modules/setup";
import {createMessagingDiagnosticHandlers} from "@/src/modules/messaging/infrastructure/api/messaging-diagnostic-handlers";
/** @param request - Original validated consent/destination intent. @param context - Exact framework connection params. @returns Only original diagnostic metadata and safe transport uncertainty. */
export async function POST(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}){return createMessagingDiagnosticHandlers((requestContext)=>createMessagingDiagnosticRequestModule(requestContext)).issue(request,context);}
