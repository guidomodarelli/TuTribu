/** Publishes original immutable configuration mutations after own input and sensitive authority checks. @module messaging-connection-configuration-handler */
import "server-only";
import {z} from "zod";
import type {ConfigureMessagingConnectionUseCase} from "@/src/modules/messaging/application/use-cases/configure-messaging-connection-use-case";
import type {AdmissionFailure} from "@/src/modules/academy-admissions/application/results/admission-errors";
import {createAdmissionOperationStateSchema} from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import {messagingConnectionConfigurationSchema} from "@/src/modules/messaging/application/results/messaging-connection-configuration-result";
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_HTTP_OPERATION} from "@/src/modules/messaging/constants/messaging-http";
import {HTTP_STATUS} from "@/src/constants/http-status";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {hasAllowedRequestOrigin} from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import {createMessagingRouteBoundary} from "./messaging-route-http";
import {messagingConnectionParamsSchema,messagingConnectionConfigureSchema} from "./messaging-request-schemas";

/** Native composition exposes only configuration application behavior and canonical routing. */
export type MessagingConnectionConfigurationServices={configuration:Pick<ConfigureMessagingConnectionUseCase,"execute">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** Mutations accept no query authority or provider endpoint. */
const configurationQuerySchema=z.strictObject({});
/** @param open - Native protected services after boundary validation. @returns Explicit versioned configuration with no send or activation endpoint. */
export function createMessagingConnectionConfigurationHandler(open:()=>Promise<MessagingConnectionConfigurationServices>){
  /** @param request - Original confirmed own resource action. @param context - Canonical framework params. @returns Minimal original version metadata, genuine progress or a safe current denial. */
  return async function configure(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}):Promise<Response>{
    const boundary=createMessagingRouteBoundary({request,operation:MESSAGING_HTTP_OPERATION.connectionConfigure});
    try{
      if(!hasAllowedRequestOrigin(request))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.permissionDenied));
      const params=boundary.input("params",messagingConnectionParamsSchema,await context.params);if(!params.usable)return params.response;
      const query=boundary.input("query",configurationQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
      const body=await boundary.readBody(messagingConnectionConfigureSchema);if(!body.usable)return body.response;
      const services=await open(),requestId=boundary.requestContext.requestId,routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
      if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
      const outcome=await services.configuration.execute({...body.value,tribeId:routing.value.tribeId,connectionId:params.value.connectionId,requestId},request.signal);if(!outcome.ok)return boundary.failure(outcome.failure);
      const schema=createAdmissionOperationStateSchema(messagingConnectionConfigurationSchema),parsed=schema.safeParse(outcome.value);
      if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      if(parsed.data.state===OPERATION_STATE.completed&&(parsed.data.result.id.toLowerCase()!==params.value.connectionId.toLowerCase()||parsed.data.result.version!==body.value.expectedVersion+(parsed.data.result.changed?1:0)))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(schema,parsed.data,parsed.data.state===OPERATION_STATE.started?HTTP_STATUS.accepted:HTTP_STATUS.ok);
    }catch(error){return boundary.unexpected(error);}
  };
}
