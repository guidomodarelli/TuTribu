/** Publishes current role-scoped configuration without initializing usage or credentials. @module messaging-configuration-handler */
import "server-only";
import {z} from "zod";
import type {ReadMessagingConfigurationUseCase} from "@/src/modules/messaging/application/use-cases/read-messaging-configuration-use-case";
import type {AdmissionFailure} from "@/src/modules/academy-admissions/application/results/admission-errors";
import {messagingConfigurationSchema} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {messagingTribeParamsSchema} from "./messaging-request-schemas";
import {createMessagingRouteBoundary} from "./messaging-route-http";
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_HTTP_OPERATION} from "@/src/modules/messaging/constants/messaging-http";

/** Only the use case derives audience; query/body role flags are unsupported. */
export type MessagingConfigurationServices={configuration:Pick<ReadMessagingConfigurationUseCase,"execute">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** Read has no filters or client-selectable audience. */
const configurationQuerySchema=z.strictObject({});
/** @param open - Native read composition after validated params/query. @returns A current read-only metadata boundary with no-store own DTOs. */
export function createMessagingConfigurationHandler(open:()=>Promise<MessagingConfigurationServices>){
  /** @param request - Native read request. @param context - Canonical framework params. @returns Current minimal audience projection or a safe denial. */
  return async function read(request:Request,context:{params:Promise<{slug:string}>}):Promise<Response>{
    const boundary=createMessagingRouteBoundary({request,operation:MESSAGING_HTTP_OPERATION.configurationRead});
    try{
      const params=boundary.input("params",messagingTribeParamsSchema,await context.params);if(!params.usable)return params.response;
      const query=boundary.input("query",configurationQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
      const services=await open(),requestId=boundary.requestContext.requestId,routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
      if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
      const outcome=await services.configuration.execute({tribeId:routing.value.tribeId,requestId});if(!outcome.ok)return boundary.failure(outcome.failure);
      return boundary.success(messagingConfigurationSchema,outcome.value);
    }catch(error){return boundary.unexpected(error);}
  };
}
