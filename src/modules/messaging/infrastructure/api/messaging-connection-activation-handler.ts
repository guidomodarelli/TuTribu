/** Exposes only confirmed locally evidenced candidate selection with native current authority and original-result guards. @module messaging-connection-activation-handler */
import "server-only";
import {z} from "zod";
import type {ActivateMessagingConnectionUseCase} from "@/src/modules/messaging/application/use-cases/activate-messaging-connection-use-case";
import type {AdmissionFailure} from "@/src/modules/academy-admissions/application/results/admission-errors";
import {createAdmissionOperationStateSchema} from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import {messagingConnectionActivationSchema} from "@/src/modules/messaging/application/results/messaging-connection-activation-result";
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {REAUTHENTICATION_OPERATION} from "@/src/modules/auth/constants/reauthentication-resources";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {HTTP_STATUS} from "@/src/constants/http-status";
import {hasAllowedRequestOrigin} from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import {createMessagingRouteBoundary} from "./messaging-route-http";
import {messagingConnectionParamsSchema,messagingConnectionActivateSchema} from "./messaging-request-schemas";

/** Only application activation and canonical routing cross into the framework entrypoint. */
export type MessagingConnectionActivationServices={activation:Pick<ActivateMessagingConnectionUseCase,"execute">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** Activation accepts no readiness, capability subset, provider environment or permission query. */
const activationQuerySchema=z.strictObject({});
/** @param open - Protected native services after own input/origin checks. @returns Explicit selection commit without sending or enabling codes/preferences. */
export function createMessagingConnectionActivationHandler(open:()=>Promise<MessagingConnectionActivationServices>){
  /** @param request - Original consent/CAS, with all readiness derived server-side. @param context - Current exact framework resource. @returns Original minimal guarded selection, genuine progress or safe current failure. */
  return async function activate(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}):Promise<Response>{
    const boundary=createMessagingRouteBoundary({request,operation:REAUTHENTICATION_OPERATION.activateMessagingConnection});
    try{
      if(!hasAllowedRequestOrigin(request))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.permissionDenied));
      const params=boundary.input("params",messagingConnectionParamsSchema,await context.params);if(!params.usable)return params.response;
      const query=boundary.input("query",activationQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
      const body=await boundary.readBody(messagingConnectionActivateSchema);if(!body.usable)return body.response;
      const services=await open(),requestId=boundary.requestContext.requestId,routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
      if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
      const outcome=await services.activation.execute({...body.value,tribeId:routing.value.tribeId,connectionId:params.value.connectionId,requestId});if(!outcome.ok)return boundary.failure(outcome.failure);
      const schema=createAdmissionOperationStateSchema(messagingConnectionActivationSchema),parsed=schema.safeParse(outcome.value);
      if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      if(parsed.data.state===OPERATION_STATE.completed&&(parsed.data.result.id.toLowerCase()!==params.value.connectionId.toLowerCase()||parsed.data.result.version!==body.value.expectedVersion+1))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(schema,parsed.data,parsed.data.state===OPERATION_STATE.started?HTTP_STATUS.accepted:HTTP_STATUS.ok);
    }catch(error){return boundary.unexpected(error);}
  };
}
