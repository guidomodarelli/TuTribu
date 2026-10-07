/** Validates candidate creation once and publishes only the original guarded metadata. @module messaging-connection-handlers */
import "server-only";
import { z } from "zod";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import type { ManageMessagingConnectionsUseCases } from "@/src/modules/messaging/application/use-cases/manage-messaging-connections-use-cases";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { messagingConnectionMutationSchema } from "@/src/modules/messaging/application/results/messaging-connection-mutation-result";
import { createMessagingRouteBoundary } from "./messaging-route-http";
import { messagingConnectionCreateSchema,messagingTribeParamsSchema } from "./messaging-request-schemas";
import { messagingFailure } from "@/src/modules/messaging/application/results/messaging-errors";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGING_HTTP_OPERATION } from "@/src/modules/messaging/constants/messaging-http";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { hasAllowedRequestOrigin } from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";

/** Own current use case and canonical resolver, with no repository or provider exposed to a route. */
export type MessagingConnectionServices={connections:Pick<ManageMessagingConnectionsUseCases,"create">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** Creation accepts no query-selected authority or provider endpoint. */
const connectionCreationQuerySchema=z.strictObject({});

/** @param open - Native composition, opened only after valid own params/body/origin. @returns Explicit creation without a read side effect or arbitrary message action. */
export function createMessagingConnectionHandlers(open:()=>Promise<MessagingConnectionServices>){
  return {
    /** @param request - Native explicit confirmed intent. @param context - Framework params. @returns Original safe metadata, genuine registered progress or a safe failure. */
    async create(request:Request,context:{params:Promise<{slug:string}>}):Promise<Response>{
      const boundary=createMessagingRouteBoundary({request,operation:MESSAGING_HTTP_OPERATION.connectionCreate});
      try{
        if(!hasAllowedRequestOrigin(request))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.permissionDenied));
        const params=boundary.input("params",messagingTribeParamsSchema,await context.params);if(!params.usable)return params.response;
        const query=boundary.input("query",connectionCreationQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
        const body=await boundary.readBody(messagingConnectionCreateSchema);if(!body.usable)return body.response;
        const services=await open(),requestId=boundary.requestContext.requestId;
        const routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
        if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
        const outcome=await services.connections.create({...body.value,tribeId:routing.value.tribeId,requestId});if(!outcome.ok)return boundary.failure(outcome.failure);
        const schema=createAdmissionOperationStateSchema(messagingConnectionMutationSchema),parsed=schema.safeParse(outcome.value);
        if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
        if(parsed.data.state===OPERATION_STATE.completed&&(parsed.data.result.version!==1||parsed.data.result.configurationVersion!==1||parsed.data.result.state!==MESSAGING_CONNECTION_STATE.draft))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
        return boundary.success(schema,parsed.data,parsed.data.state===OPERATION_STATE.started?HTTP_STATUS.accepted:parsed.data.replayed?HTTP_STATUS.ok:HTTP_STATUS.created);
      }catch(error){return boundary.unexpected(error);}
    },
  };
}
