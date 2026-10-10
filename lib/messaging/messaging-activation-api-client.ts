"use client";
/** Guards explicit candidate selection and original identity without SDK, key storage or hidden retries. @module messaging-activation-api-client */
import type {MessagingActivationBrowserClient} from "@/src/modules/messaging/application/ports/messaging-activation-browser-client";
import {messagingConnectionActivationSchema} from "@/src/modules/messaging/application/results/messaging-connection-activation-result";
import {createAdmissionOperationStateSchema} from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import {MESSAGING_CONNECTIONS_BROWSER_PATH} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_ACTIVATION_BROWSER_PATH} from "@/src/modules/messaging/constants/messaging-activation-browser";
import {MESSAGING_CONNECTION_STATE} from "@/src/modules/messaging/constants/messaging-connection";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {createMessagingBrowserRequest,messagingBrowserFailure} from "./messaging-browser-api-client";

/** @param options - Owned transport boundary; construction does not fetch. @returns A single explicit same-origin activation action with exact result binding. */
export function createMessagingActivationBrowserClient(options:{fetch?:typeof fetch}={}):MessagingActivationBrowserClient{
  const request=createMessagingBrowserRequest(options.fetch),schema=createAdmissionOperationStateSchema(messagingConnectionActivationSchema.strict());
  return{async activate(scope,input,signal){
    const path=`${MESSAGING_CONNECTIONS_BROWSER_PATH.tribePrefix}/${encodeURIComponent(scope.slug)}/${MESSAGING_CONNECTIONS_BROWSER_PATH.connections}/${encodeURIComponent(scope.connectionId)}/${MESSAGING_ACTIVATION_BROWSER_PATH}`,result=await request(path,schema,signal,{method:"POST",input});
    if(result.status!=="ready")return result;
    if(result.value.operationId.toLowerCase()!==input.operationId.toLowerCase())return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);
    if(result.value.state===OPERATION_STATE.completed){const value=result.value.result;if(value.id.toLowerCase()!==scope.connectionId.toLowerCase()||value.configurationVersion!==scope.configurationVersion||value.version!==input.expectedVersion+1||value.state!==MESSAGING_CONNECTION_STATE.active)return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);}
    return result;
  }};
}
/** The route must initiate every action after current identity and renewed confirmation. */
export const messagingActivationBrowserClient=createMessagingActivationBrowserClient();
