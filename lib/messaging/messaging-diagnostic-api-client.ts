"use client";
/** Binds explicit diagnostic and transport observations to exact own scopes without provider SDK, storage, sends on render or retries. @module messaging-diagnostic-api-client */
import type {MessagingDiagnosticBrowserClient} from "@/src/modules/messaging/application/ports/messaging-diagnostic-browser-client";
import {connectionDiagnosticIssuanceSchema} from "@/src/modules/messaging/application/results/connection-diagnostic-issuance-result";
import {connectionDiagnosticSnapshotSchema} from "@/src/modules/messaging/application/results/connection-diagnostic-result";
import {messageDeliverySchema} from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";
import {createAdmissionOperationStateSchema} from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import {MESSAGING_CONNECTIONS_BROWSER_PATH} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_DIAGNOSTIC_BROWSER_PATH} from "@/src/modules/messaging/constants/messaging-diagnostic-browser";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {ADMISSION_VERIFICATION_PURPOSE} from "@/src/modules/academy-admissions/constants/admission-eligibility";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {VERIFICATION_ISSUANCE_OUTCOME} from "@/src/modules/academy-admissions/constants/verification-issuance";
import {CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME} from "@/src/modules/messaging/constants/connection-diagnostic";
import {createMessagingBrowserRequest,messagingBrowserFailure} from "./messaging-browser-api-client";

/** @param options - Owned HTTP injection; construction has no request or session lookup. @returns Explicit original actions and readonly delivery observations with own DTO guards. */
export function createMessagingDiagnosticBrowserClient(options:{fetch?:typeof fetch}={}):MessagingDiagnosticBrowserClient{
  const request=createMessagingBrowserRequest(options.fetch),tribePath=(slug:string)=>`${MESSAGING_CONNECTIONS_BROWSER_PATH.tribePrefix}/${encodeURIComponent(slug)}`,connectionPath=(slug:string,connectionId:string)=>`${tribePath(slug)}/${MESSAGING_CONNECTIONS_BROWSER_PATH.connections}/${encodeURIComponent(connectionId)}/${MESSAGING_DIAGNOSTIC_BROWSER_PATH.diagnostics}`;
  return{
    async issue(scope,input,signal){
      const result=await request(connectionPath(scope.slug,scope.connectionId),createAdmissionOperationStateSchema(connectionDiagnosticIssuanceSchema),signal,{method:"POST",input});if(result.status!=="ready")return result;
      if(result.value.operationId.toLowerCase()!==input.operationId.toLowerCase())return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);
      if(result.value.state===OPERATION_STATE.completed&&result.value.result.outcome===VERIFICATION_ISSUANCE_OUTCOME.issued){const value=result.value.result;if(value.connectionId.toLowerCase()!==scope.connectionId.toLowerCase()||value.connectionVersion!==scope.configurationVersion||value.channel!==input.channel)return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);}
      return result;
    },
    async verify(scope,input,signal){
      const result=await request(`${connectionPath(scope.slug,scope.connectionId)}/${encodeURIComponent(scope.diagnosticId)}/${MESSAGING_DIAGNOSTIC_BROWSER_PATH.verify}`,createAdmissionOperationStateSchema(connectionDiagnosticSnapshotSchema),signal,{method:"POST",input});if(result.status!=="ready")return result;
      if(result.value.operationId.toLowerCase()!==input.operationId.toLowerCase())return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);
      if(result.value.state===OPERATION_STATE.completed&&result.value.result.outcome===CONNECTION_DIAGNOSTIC_VERIFICATION_OUTCOME.verified){const value=result.value.result;if(value.diagnosticId.toLowerCase()!==scope.diagnosticId.toLowerCase()||value.connectionVersion!==scope.configurationVersion||value.channel!==scope.channel)return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);}
      return result;
    },
    async delivery(query,signal){
      const result=await request(`${tribePath(query.slug)}/${MESSAGING_DIAGNOSTIC_BROWSER_PATH.deliveries}/${encodeURIComponent(query.deliveryId)}`,messageDeliverySchema.strict(),signal);
      if(result.status==="ready"&&(result.value.id.toLowerCase()!==query.deliveryId.toLowerCase()||result.value.purpose!==ADMISSION_VERIFICATION_PURPOSE.connectionDiagnostic||result.value.channel!==query.channel))return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable);return result;
    },
  };
}
/** Every request must be started by its owning route action; this object retains no destination or code. */
export const messagingDiagnosticBrowserClient=createMessagingDiagnosticBrowserClient();
