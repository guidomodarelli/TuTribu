/** Reads only own original transport status without recency, provider calls or dispatch. @module message-delivery-handler */
import "server-only";
import {z} from "zod";
import type {ReadMessageDeliveryUseCase} from "@/src/modules/messaging/application/use-cases/read-message-delivery-use-case";
import type {AdmissionFailure} from "@/src/modules/academy-admissions/application/results/admission-errors";
import {messageDeliverySchema} from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_DIAGNOSTIC_HTTP_OPERATION} from "@/src/modules/messaging/constants/messaging-http";
import {createMessagingRouteBoundary} from "./messaging-route-http";
import {messagingDeliveryParamsSchema} from "./messaging-request-schemas";

/** Transport lookups grant no browser authority, arbitrary provider identifier or recipient enumeration. */
const deliveryQuerySchema=z.strictObject({});
/** Native composition exposes only a minimal reader and canonical tenant routing. */
export type MessageDeliveryServices={delivery:Pick<ReadMessageDeliveryUseCase,"execute">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** @param open - Current native services after validated resource input. @returns Safe no-store original transport without initializing work. */
export function createMessageDeliveryHandler(open:()=>Promise<MessageDeliveryServices>){
  /** @param request - Native current session. @param context - Exact framework transport params. @returns Minimal owned state or safe current denial. */
  return async function read(request:Request,context:{params:Promise<{slug:string;deliveryId:string}>}):Promise<Response>{
    const boundary=createMessagingRouteBoundary({request,operation:MESSAGING_DIAGNOSTIC_HTTP_OPERATION.deliveryRead});
    try{
      const params=boundary.input("params",messagingDeliveryParamsSchema,await context.params);if(!params.usable)return params.response;
      const query=boundary.input("query",deliveryQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
      const services=await open(),requestId=boundary.requestContext.requestId,routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
      if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
      const outcome=await services.delivery.execute({tribeId:routing.value.tribeId,deliveryId:params.value.deliveryId,requestId});if(!outcome.ok)return boundary.failure(outcome.failure);
      if(outcome.value.id.toLowerCase()!==params.value.deliveryId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(messageDeliverySchema,outcome.value);
    }catch(error){return boundary.unexpected(error);}
  };
}
