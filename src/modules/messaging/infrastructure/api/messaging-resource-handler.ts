/** Publishes bounded current resource selections after sensitive leader authorization. @module messaging-resource-handler */
import "server-only";
import type {ReadMessagingResourcesUseCase} from "@/src/modules/messaging/application/use-cases/read-messaging-resources-use-case";
import type {MessagingResourceCursor} from "@/src/modules/messaging/domain/repositories/messaging-resource-inspection";
import type {AdmissionFailure} from "@/src/modules/academy-admissions/application/results/admission-errors";
import {messagingResourcePageSchema} from "@/src/modules/messaging/application/results/messaging-resource-page-result";
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_RESOURCE_KIND} from "@/src/modules/messaging/constants/messaging-resources";
import {MESSAGING_HTTP_OPERATION} from "@/src/modules/messaging/constants/messaging-http";
import {createMessagingRouteBoundary} from "./messaging-route-http";
import {messagingConnectionParamsSchema,messagingResourceQuerySchema} from "./messaging-request-schemas";

/** Framework composition supplies only an application reader and canonical tenant routing. */
export type MessagingResourceServices={resources:Pick<ReadMessagingResourcesUseCase,"execute">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** @param kind - Fixed route-owned resource kind. @param open - Native composition after input validation. @returns A no-store guarded page, with no message or provisioning action. */
export function createMessagingResourceHandler(kind:MessagingResourceCursor["kind"],open:()=>Promise<MessagingResourceServices>){
  /** @param request - Native request and caller cancellation. @param context - Current framework params. @returns Own exact configuration-scoped references or safe current denial. */
  return async function read(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}):Promise<Response>{
    const boundary=createMessagingRouteBoundary({request,operation:kind===MESSAGING_RESOURCE_KIND.senders?MESSAGING_HTTP_OPERATION.sendersRead:MESSAGING_HTTP_OPERATION.templatesRead});
    try{
      const params=boundary.input("params",messagingConnectionParamsSchema,await context.params);if(!params.usable)return params.response;
      const query=boundary.input("query",messagingResourceQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
      const services=await open(),requestId=boundary.requestContext.requestId,routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
      if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
      const outcome=await services.resources.execute({...query.value,kind,tribeId:routing.value.tribeId,connectionId:params.value.connectionId,requestId},request.signal);
      if(!outcome.ok)return boundary.failure(outcome.failure);
      if(typeof outcome.value.connectionId!=="string"||outcome.value.connectionId.toLowerCase()!==params.value.connectionId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(messagingResourcePageSchema,outcome.value);
    }catch(error){return boundary.unexpected(error);}
  };
}
