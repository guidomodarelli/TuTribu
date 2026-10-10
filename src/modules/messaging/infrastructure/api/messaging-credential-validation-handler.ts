/** Validates one explicit current credential action and guards its original public result. @module messaging-credential-validation-handler */
import "server-only";
import {z} from "zod";
import type {ValidateMessagingConnectionUseCase} from "@/src/modules/messaging/application/use-cases/validate-messaging-connection-use-case";
import type {AdmissionFailure} from "@/src/modules/academy-admissions/application/results/admission-errors";
import {createAdmissionOperationStateSchema} from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import {messagingCredentialValidationSchema} from "@/src/modules/messaging/application/results/messaging-credential-validation-result";
import {messagingConnectionParamsSchema,messagingConnectionValidateSchema} from "./messaging-request-schemas";
import {createMessagingRouteBoundary} from "./messaging-route-http";
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_HTTP_OPERATION} from "@/src/modules/messaging/constants/messaging-http";
import {HTTP_STATUS} from "@/src/constants/http-status";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {hasAllowedRequestOrigin} from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";

/** Native use case and canonical tenant routing, without provider or repository exposed to the route. */
export type MessagingCredentialValidationServices={validation:Pick<ValidateMessagingConnectionUseCase,"execute">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** Validation does not accept query-selected resources, host or authority. */
const validationQuerySchema=z.strictObject({});

/** @param open - Native composition only after valid input and origin. @returns Explicit credential inspection with no message or activation operation. */
export function createMessagingCredentialValidationHandler(open:()=>Promise<MessagingCredentialValidationServices>){
  /** @param request - Native request with caller cancellation. @param context - Canonical framework params. @returns Guarded original metadata, genuine progress or safe classified failure. */
  return async function validate(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}):Promise<Response>{
    const boundary=createMessagingRouteBoundary({request,operation:MESSAGING_HTTP_OPERATION.connectionValidate});
    try{
      if(!hasAllowedRequestOrigin(request))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.permissionDenied));
      const params=boundary.input("params",messagingConnectionParamsSchema,await context.params);if(!params.usable)return params.response;
      const query=boundary.input("query",validationQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
      const body=await boundary.readBody(messagingConnectionValidateSchema);if(!body.usable)return body.response;
      const services=await open(),requestId=boundary.requestContext.requestId,routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
      if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
      const outcome=await services.validation.execute({...body.value,tribeId:routing.value.tribeId,connectionId:params.value.connectionId,requestId},request.signal);
      if(!outcome.ok)return boundary.failure(outcome.failure);
      const schema=createAdmissionOperationStateSchema(messagingCredentialValidationSchema),parsed=schema.safeParse(outcome.value);
      if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      if(parsed.data.state===OPERATION_STATE.completed){
        if(parsed.data.result.id.toLowerCase()!==params.value.connectionId.toLowerCase()||parsed.data.result.version!==body.value.expectedVersion+1)return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
        if(parsed.data.result.failureCode)return boundary.failure(messagingFailure(parsed.data.result.failureCode,{operation:{operationId:body.value.operationId,state:OPERATION_STATE.completed}}));
      }
      return boundary.success(schema,parsed.data,parsed.data.state===OPERATION_STATE.started?HTTP_STATUS.accepted:HTTP_STATUS.ok);
    }catch(error){return boundary.unexpected(error);}
  };
}
