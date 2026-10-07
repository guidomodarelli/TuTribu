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
import {messagingFailure} from "@/src/modules/messaging/application/results/messaging-errors";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_DIAGNOSTIC_HTTP_OPERATION} from "@/src/modules/messaging/constants/messaging-http";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {HTTP_STATUS} from "@/src/constants/http-status";
import {hasAllowedRequestOrigin} from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import {createMessagingRouteBoundary} from "./messaging-route-http";
import {messagingConnectionParamsSchema,messagingDiagnosticParamsSchema,messagingConnectionDiagnosticSchema,messagingDiagnosticVerifySchema} from "./messaging-request-schemas";

/** Only own application behavior and canonical tenant routing are exposed to the framework entrypoint. */
export type MessagingDiagnosticServices={issue:Pick<IssueConnectionDiagnosticUseCase,"execute">;verify:Pick<VerifyConnectionDiagnosticUseCase,"execute">;resolveTribe:{execute(query:{slug:string;requestId:string}):Promise<{ok:true;value:{tribeId:string}}|{ok:false;failure:AdmissionFailure}>}};
/** Diagnostic routes accept no additional query authority, sender, provider endpoint or purpose. */
const diagnosticQuerySchema=z.strictObject({});
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
        if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
        const outcome=await services.issue.execute({...body.value,tribeId:routing.value.tribeId,connectionId:params.value.connectionId,requestId});if(!outcome.ok)return boundary.failure(outcome.failure);
        const schema=createAdmissionOperationStateSchema(connectionDiagnosticIssuanceSchema),parsed=schema.safeParse(outcome.value);
        if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
        if(parsed.data.state===OPERATION_STATE.completed){if(parsed.data.result.outcome==="denied")return boundary.failure(messagingFailure(parsed.data.result.code,{operation:{operationId:body.value.operationId,state:OPERATION_STATE.completed}}));if(parsed.data.result.connectionId.toLowerCase()!==params.value.connectionId.toLowerCase()||parsed.data.result.channel!==body.value.channel)return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));}
        return boundary.success(schema,parsed.data,parsed.data.state===OPERATION_STATE.started?HTTP_STATUS.accepted:HTTP_STATUS.ok);
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
        if(!routing.ok){const code=Object.values(MESSAGING_ERROR_CODE).find((candidate)=>candidate===routing.failure.code)??MESSAGING_ERROR_CODE.resourceUnavailable;return boundary.failure(messagingFailure(code));}
        const outcome=await services.verify.execute({tribeId:routing.value.tribeId,connectionId:params.value.connectionId,diagnosticId:params.value.diagnosticId,operationId:body.value.operationId,code:body.value.verificationCode,requestId});if(!outcome.ok)return boundary.failure(outcome.failure);
        const schema=createAdmissionOperationStateSchema(connectionDiagnosticSnapshotSchema),parsed=schema.safeParse(outcome.value);
        if(!parsed.success||parsed.data.operationId.toLowerCase()!==body.value.operationId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
        if(parsed.data.state===OPERATION_STATE.completed){if(parsed.data.result.outcome==="denied")return boundary.failure(messagingFailure(parsed.data.result.code,{operation:{operationId:body.value.operationId,state:OPERATION_STATE.completed}}));if(parsed.data.result.diagnosticId.toLowerCase()!==params.value.diagnosticId.toLowerCase())return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));}
        return boundary.success(schema,parsed.data,parsed.data.state===OPERATION_STATE.started?HTTP_STATUS.accepted:HTTP_STATUS.ok);
      }catch(error){return boundary.unexpected(error);}
    },
  };
}
