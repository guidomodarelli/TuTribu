/** Exposes explicit local safety/retirement actions through own input/result guards and native services. @module messaging-connection-lifecycle-handlers */
import "server-only";
import { z } from "zod";
import type { ManageMessagingConnectionLifecycleUseCases } from "../../application/use-cases/messaging-connection-lifecycle-use-cases";
import type { MessagingConnectionLifecycleResult } from "../../application/results/messaging-connection-lifecycle-result";
import { messagingConnectionLifecycleResultSchema } from "../../application/results/messaging-connection-lifecycle-result";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { messagingFailure } from "../../application/results/messaging-errors";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { hasAllowedRequestOrigin } from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import { createMessagingRouteBoundary } from "./messaging-route-http";
import { messagingConnectionParamsSchema, messagingConnectionSuspendSchema, messagingConnectionDisconnectSchema } from "./messaging-request-schemas";

/** Framework roots supply inward-facing use cases only; metadata actions do not compose SDK/SecretStore. */
export type MessagingConnectionLifecycleServices={lifecycle:Pick<ManageMessagingConnectionLifecycleUseCases<MessagingConnectionLifecycleResult>,"suspend"|"disconnect">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** Action authority and dependency facts cannot be supplied in the query string. */
const lifecycleQuerySchema=z.strictObject({});

/** @param open - Native protected services after own boundary validation. @returns Local suspend/disconnect handlers with current authority and original minimum snapshots. */
export function createMessagingConnectionLifecycleHandlers(open:()=>Promise<MessagingConnectionLifecycleServices>){
  /** @param request - Explicit normalized cause/CAS operation. @param context - Exact framework route resource. @param operation - Fixed local action, never client selected. @returns Confirmed local metadata or safe registered/current failure without external cancellation claims. */
  const execute=async(request:Request,context:{params:Promise<{slug:string;connectionId:string}>},operation:typeof REAUTHENTICATION_OPERATION.suspendMessagingConnection|typeof REAUTHENTICATION_OPERATION.disconnectMessagingConnection):Promise<Response>=>{
    const boundary=createMessagingRouteBoundary({request,operation});
    try{
      if(!hasAllowedRequestOrigin(request))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.permissionDenied));
      const params=boundary.input("params",messagingConnectionParamsSchema,await context.params);if(!params.usable)return params.response;
      const query=boundary.input("query",lifecycleQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
      const body=operation===REAUTHENTICATION_OPERATION.suspendMessagingConnection?{kind:REAUTHENTICATION_OPERATION.suspendMessagingConnection,...await boundary.readBody(messagingConnectionSuspendSchema)} as const:{kind:REAUTHENTICATION_OPERATION.disconnectMessagingConnection,...await boundary.readBody(messagingConnectionDisconnectSchema)} as const;if(!body.usable)return body.response;
      const services=await open(),requestId=boundary.requestContext.requestId,routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
      if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
      const resource={tribeId:routing.value.tribeId,connectionId:params.value.connectionId,requestId};
      const outcome=body.kind===REAUTHENTICATION_OPERATION.suspendMessagingConnection?await services.lifecycle.suspend({...body.value,...resource}):await services.lifecycle.disconnect({...body.value,...resource});if(!outcome.ok)return boundary.failure(outcome.failure);
      const schema=createAdmissionOperationStateSchema(messagingConnectionLifecycleResultSchema),parsed=schema.safeParse(outcome.value);
      if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      if(parsed.data.state===OPERATION_STATE.completed){
        const result=parsed.data.result,targetState=operation===REAUTHENTICATION_OPERATION.suspendMessagingConnection?MESSAGING_CONNECTION_STATE.suspended:MESSAGING_CONNECTION_STATE.disconnected;
        if(result.id.toLowerCase()!==params.value.connectionId.toLowerCase()||result.state!==targetState||result.version!==body.value.expectedVersion+(result.changed?1:0))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
        if(body.kind===REAUTHENTICATION_OPERATION.suspendMessagingConnection?result.reason!==body.value.reason:result.reason!==null)return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      }
      return boundary.success(schema,parsed.data,parsed.data.state===OPERATION_STATE.started?HTTP_STATUS.accepted:HTTP_STATUS.ok);
    }catch(error){return boundary.unexpected(error);}
  };
  return{
    /** @param request - Explicit safety cause/CAS. @param context - Current framework resource. @returns Original local stop metadata, no provider revocation. */
    suspend:(request:Request,context:{params:Promise<{slug:string;connectionId:string}>})=>execute(request,context,REAUTHENTICATION_OPERATION.suspendMessagingConnection),
    /** @param request - Explicit ordinary retirement/CAS. @param context - Current framework resource. @returns Original retirement metadata only after dependency checks. */
    disconnect:(request:Request,context:{params:Promise<{slug:string;connectionId:string}>})=>execute(request,context,REAUTHENTICATION_OPERATION.disconnectMessagingConnection),
  };
}
