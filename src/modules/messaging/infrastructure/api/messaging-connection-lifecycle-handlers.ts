/** Exposes explicit local safety/retirement actions through own input/result guards and native services. @module messaging-connection-lifecycle-handlers */
import "server-only";
import { z } from "zod";
import type { ManageMessagingConnectionLifecycleUseCases } from "../../application/use-cases/messaging-connection-lifecycle-use-cases";
import { type MessagingConnectionLifecycleResult, messagingConnectionLifecycleResultSchema  } from "../../application/results/messaging-connection-lifecycle-result";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { messagingFailure, messagingTribeRoutingFailure } from "../../application/results/messaging-errors";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_CONNECTION_STATE } from "../../constants/messaging-connection";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { hasAllowedRequestOrigin } from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import { createMessagingRouteBoundary, messagingOperationHttpStatus } from "./messaging-route-http";
import { messagingConnectionParamsSchema, messagingConnectionSuspendSchema, messagingConnectionDisconnectSchema } from "./messaging-request-schemas";

/** Framework roots supply inward-facing use cases only; metadata actions do not compose SDK/SecretStore. */
export type MessagingConnectionLifecycleServices={lifecycle:Pick<ManageMessagingConnectionLifecycleUseCases<MessagingConnectionLifecycleResult>,"suspend"|"disconnect">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** Action authority and dependency facts cannot be supplied in the query string. */
const lifecycleQuerySchema=z.strictObject({});

/** Validated local action body, tagged with its fixed operation. */
type LifecycleBody={kind:typeof REAUTHENTICATION_OPERATION.suspendMessagingConnection;value:z.infer<typeof messagingConnectionSuspendSchema>}|{kind:typeof REAUTHENTICATION_OPERATION.disconnectMessagingConnection;value:z.infer<typeof messagingConnectionDisconnectSchema>};
/** Exact confirmed effect expected from one local action. */
type LifecycleExpectation={connectionId:string;targetState:MessagingConnectionLifecycleResult["state"];expectedVersion:number;reason:MessagingConnectionLifecycleResult["reason"]};

/** @param body - Validated action body. @param connectionId - Exact route resource. @returns The target state, version base and reason a confirmed result must carry; disconnection carries no reason. */
function lifecycleExpectation(body:LifecycleBody,connectionId:string):LifecycleExpectation{
  if(body.kind===REAUTHENTICATION_OPERATION.suspendMessagingConnection)return{connectionId,targetState:MESSAGING_CONNECTION_STATE.suspended,expectedVersion:body.value.expectedVersion,reason:body.value.reason};
  return{connectionId,targetState:MESSAGING_CONNECTION_STATE.disconnected,expectedVersion:body.value.expectedVersion,reason:null};
}

/** @param result - Completed public result. @param expected - Effect required by the request. @returns Whether the result is exactly that resource, state, version and reason. */
function confirmsLifecycleExpectation(result:MessagingConnectionLifecycleResult,expected:LifecycleExpectation):boolean{
  return result.id.toLowerCase()===expected.connectionId.toLowerCase()&&result.state===expected.targetState&&result.version===expected.expectedVersion+(result.changed?1:0)&&result.reason===expected.reason;
}

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
      if(!routing.ok)return boundary.failure(messagingTribeRoutingFailure(routing.failure));
      const resource={tribeId:routing.value.tribeId,connectionId:params.value.connectionId,requestId};
      const outcome=body.kind===REAUTHENTICATION_OPERATION.suspendMessagingConnection?await services.lifecycle.suspend({...body.value,...resource}):await services.lifecycle.disconnect({...body.value,...resource});if(!outcome.ok)return boundary.failure(outcome.failure);
      const schema=createAdmissionOperationStateSchema(messagingConnectionLifecycleResultSchema),parsed=schema.safeParse(outcome.value);
      if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      if(parsed.data.state===OPERATION_STATE.completed&&!confirmsLifecycleExpectation(parsed.data.result,lifecycleExpectation(body,params.value.connectionId)))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(schema,parsed.data,messagingOperationHttpStatus(parsed.data.state));
    }catch(error){return boundary.unexpected(error);}
  };
  return{
    /** @param request - Explicit safety cause/CAS. @param context - Current framework resource. @returns Original local stop metadata, no provider revocation. */
    suspend:(request:Request,context:{params:Promise<{slug:string;connectionId:string}>})=>execute(request,context,REAUTHENTICATION_OPERATION.suspendMessagingConnection),
    /** @param request - Explicit ordinary retirement/CAS. @param context - Current framework resource. @returns Original retirement metadata only after dependency checks. */
    disconnect:(request:Request,context:{params:Promise<{slug:string;connectionId:string}>})=>execute(request,context,REAUTHENTICATION_OPERATION.disconnectMessagingConnection),
  };
}
