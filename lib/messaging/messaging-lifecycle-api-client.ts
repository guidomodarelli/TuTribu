"use client";
/** Guards single explicit local lifecycle requests and minimum original result bindings. @module messaging-lifecycle-api-client */
import type { MessagingLifecycleBrowserClient } from "@/src/modules/messaging/application/ports/messaging-lifecycle-browser-client";
import { messagingConnectionLifecycleResultSchema } from "@/src/modules/messaging/application/results/messaging-connection-lifecycle-result";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { MESSAGING_CONNECTIONS_BROWSER_PATH } from "@/src/modules/messaging/constants/messaging-connections-browser";
import { MESSAGING_LIFECYCLE_BROWSER_PATH } from "@/src/modules/messaging/constants/messaging-lifecycle-browser";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { createMessagingBrowserRequest, messagingBrowserFailure } from "./messaging-browser-api-client";

/** @param options - Own transport boundary; construction never fetches. @returns Explicit single same-origin actions without credentials, retries or route refresh. */
export function createMessagingLifecycleBrowserClient(options:{fetch?:typeof fetch}={}):MessagingLifecycleBrowserClient{
  const request=createMessagingBrowserRequest(options.fetch),schema=createAdmissionOperationStateSchema(messagingConnectionLifecycleResultSchema);
  /** @param scope - Public route resource. @param input - Original own body. @param signal - Current observation. @param action - Fixed local route action. @returns Bound original minimal result or safe uncertainty after a possible write. */
  const execute=async(scope:Parameters<MessagingLifecycleBrowserClient["suspend"]>[0],input:Parameters<MessagingLifecycleBrowserClient["disconnect"]>[1]&{reason?:Parameters<MessagingLifecycleBrowserClient["suspend"]>[1]["reason"]},signal:AbortSignal,action:typeof MESSAGING_LIFECYCLE_BROWSER_PATH[keyof typeof MESSAGING_LIFECYCLE_BROWSER_PATH])=>{
    const path=`${MESSAGING_CONNECTIONS_BROWSER_PATH.tribePrefix}/${encodeURIComponent(scope.slug)}/${MESSAGING_CONNECTIONS_BROWSER_PATH.connections}/${encodeURIComponent(scope.connectionId)}/${action}`,outcome=await request(path,schema,signal,{method:"POST",input});if(outcome.status!=="ready")return outcome;
    if(outcome.value.operationId.toLowerCase()!==input.operationId.toLowerCase())return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);
    if(outcome.value.state===OPERATION_STATE.completed){const result=outcome.value.result,state=action===MESSAGING_LIFECYCLE_BROWSER_PATH.suspend?MESSAGING_CONNECTION_STATE.suspended:MESSAGING_CONNECTION_STATE.disconnected;if(result.id.toLowerCase()!==scope.connectionId.toLowerCase()||result.version!==input.expectedVersion+(result.changed?1:0)||result.state!==state||(action===MESSAGING_LIFECYCLE_BROWSER_PATH.suspend?result.reason!==input.reason:result.reason!==null))return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);}
    return outcome;
  };
  return{suspend:(scope,input,signal)=>execute(scope,input,signal,MESSAGING_LIFECYCLE_BROWSER_PATH.suspend),disconnect:(scope,input,signal)=>execute(scope,input,signal,MESSAGING_LIFECYCLE_BROWSER_PATH.disconnect)};
}
/** The route owns every explicit action and current viewer/consent check. */
export const messagingLifecycleBrowserClient=createMessagingLifecycleBrowserClient();
