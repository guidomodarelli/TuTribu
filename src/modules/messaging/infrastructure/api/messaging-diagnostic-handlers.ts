/** Exposes explicit local diagnostic issuance/verification without arbitrary message, key or proof authority. @module messaging-diagnostic-handlers */
import "server-only";
import {z} from "zod";
import type {IssueConnectionDiagnosticUseCase} from "@/src/modules/messaging/application/use-cases/issue-connection-diagnostic-use-case";
import type {VerifyConnectionDiagnosticUseCase} from "@/src/modules/messaging/application/use-cases/connection-diagnostic-use-cases";
import type {AdmissionFailure} from "@/src/modules/academy-admissions/application/results/admission-errors";
import type {RequestContext} from "@/src/modules/shared/infrastructure/observability/request-context";
import {createAdmissionOperationStateSchema} from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import {connectionDiagnosticIssuanceSchema} from "@/src/modules/messaging/application/results/connection-diagnostic-issuance-result";
import {connectionDiagnosticSnapshotSchema} from "@/src/modules/messaging/application/results/connection-diagnostic-result";
import {messagingFailure,messagingTribeRoutingFailure,type MessagingErrorCode} from "@/src/modules/messaging/application/results/messaging-errors";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_DIAGNOSTIC_HTTP_OPERATION} from "@/src/modules/messaging/constants/messaging-http";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {hasAllowedRequestOrigin} from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import {createMessagingRouteBoundary,messagingOperationHttpStatus} from "./messaging-route-http";
import {messagingConnectionParamsSchema,messagingDiagnosticParamsSchema,messagingConnectionDiagnosticSchema,messagingDiagnosticVerifySchema} from "./messaging-request-schemas";

/** Only own application behavior and canonical tenant routing are exposed to the framework entrypoint. */
export type MessagingDiagnosticServices={issue:Pick<IssueConnectionDiagnosticUseCase,"execute">;verify:Pick<VerifyConnectionDiagnosticUseCase,"execute">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** Diagnostic routes accept no additional query authority, sender, provider endpoint or purpose. */
const diagnosticQuerySchema=z.strictObject({});
/** Completed own diagnostic denial with its closed code. */
type DeniedDiagnostic={outcome:"denied";code:MessagingErrorCode};
/** Original diagnostic operation as validated by its public schema. */
type DiagnosticOperation<Result>={state:typeof OPERATION_STATE.started;operationId:string;result?:undefined}|{state:typeof OPERATION_STATE.completed;operationId:string;replayed:boolean;result:Result};
/** @param result - Completed diagnostic result. @returns Whether it is an own denial. */
function isDeniedDiagnostic(result:{outcome:string}):result is DeniedDiagnostic{return result.outcome==="denied";}
/** @param boundary - This request's boundary. @param original - Validated schema, original operation and requested UUID. @param belongsToRequest - Whether an accepted result belongs to the requested resource. @returns An own completed denial with its code, an unusable contract for a foreign result, otherwise the original state (202 while started). */
function respondDiagnosticOperation<Accepted extends {outcome:string}>(boundary:ReturnType<typeof createMessagingRouteBoundary>,original:{schema:z.ZodType;operation:DiagnosticOperation<DeniedDiagnostic|Accepted>;operationId:string},belongsToRequest:(result:Accepted)=>boolean):Response{
  const{schema,operation,operationId}=original;
  if(operation.state===OPERATION_STATE.completed){
    const result=operation.result;
    if(isDeniedDiagnostic(result))return boundary.failure(messagingFailure(result.code,{operation:{operationId,state:OPERATION_STATE.completed}}));
    if(!belongsToRequest(result))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
  }
  return boundary.success(schema,operation,messagingOperationHttpStatus(operation.state));
}
/** @param open - Native protected composition after own origin/input checks. @returns Explicit diagnostic commands with original safe outcomes. */
export function createMessagingDiagnosticHandlers(open:(requestContext:RequestContext)=>Promise<MessagingDiagnosticServices>){
  return{
    /** @param request - Original consented destination and CAS. @param context - Current framework connection params. @returns Masked original issuance/denial, or registered progress; acceptance is never verification. */
    async issue(request:Request,context:{params:Promise<{slug:string;connectionId:string}>}):Promise<Response>{
      const boundary=createMessagingRouteBoundary({request,operation:MESSAGING_DIAGNOSTIC_HTTP_OPERATION.issue});
      try{
        if(!hasAllowedRequestOrigin(request))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.permissionDenied));
        const params=boundary.input("params",messagingConnectionParamsSchema,await context.params);if(!params.usable)return params.response;
        const query=boundary.input("query",diagnosticQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
        const body=await boundary.readBody(messagingConnectionDiagnosticSchema);if(!body.usable)return body.response;
        const services=await open(boundary.requestContext),requestId=boundary.requestContext.requestId,routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
        if(!routing.ok)return boundary.failure(messagingTribeRoutingFailure(routing.failure));
        const outcome=await services.issue.execute({...body.value,tribeId:routing.value.tribeId,connectionId:params.value.connectionId,requestId});if(!outcome.ok)return boundary.failure(outcome.failure);
        const schema=createAdmissionOperationStateSchema(connectionDiagnosticIssuanceSchema),parsed=schema.safeParse(outcome.value);
        if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
        return respondDiagnosticOperation(boundary,{schema,operation:parsed.data,operationId:body.value.operationId},(result)=>result.connectionId.toLowerCase()===params.value.connectionId.toLowerCase()&&result.channel===body.value.channel);
      }catch(error){return boundary.unexpected(error);}
    },
    /** @param request - Explicit received local code and stable original identity. @param context - Exact diagnostic/connection params. @returns Only local diagnostic/capability confirmation, never an admission or Google proof. */
    async verify(request:Request,context:{params:Promise<{slug:string;connectionId:string;diagnosticId:string}>}):Promise<Response>{
      const boundary=createMessagingRouteBoundary({request,operation:MESSAGING_DIAGNOSTIC_HTTP_OPERATION.verify});
      try{
        if(!hasAllowedRequestOrigin(request))return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.permissionDenied));
        const params=boundary.input("params",messagingDiagnosticParamsSchema,await context.params);if(!params.usable)return params.response;
        const query=boundary.input("query",diagnosticQuerySchema,Object.fromEntries(new URL(request.url).searchParams));if(!query.usable)return query.response;
        const body=await boundary.readBody(messagingDiagnosticVerifySchema);if(!body.usable)return body.response;
        const services=await open(boundary.requestContext),requestId=boundary.requestContext.requestId,routing=await services.resolveTribe.execute({slug:params.value.slug,requestId});
        if(!routing.ok)return boundary.failure(messagingTribeRoutingFailure(routing.failure));
        const outcome=await services.verify.execute({tribeId:routing.value.tribeId,connectionId:params.value.connectionId,diagnosticId:params.value.diagnosticId,operationId:body.value.operationId,code:body.value.verificationCode,requestId});if(!outcome.ok)return boundary.failure(outcome.failure);
        const schema=createAdmissionOperationStateSchema(connectionDiagnosticSnapshotSchema),parsed=schema.safeParse(outcome.value);
        if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
        return respondDiagnosticOperation(boundary,{schema,operation:parsed.data,operationId:body.value.operationId},(result)=>result.diagnosticId.toLowerCase()===params.value.diagnosticId.toLowerCase());
      }catch(error){return boundary.unexpected(error);}
    },
  };
}
