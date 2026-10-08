"use client";
/** Guards same-origin wizard transport and original identities without storing keys, refreshing a route or retrying writes. @module messaging-connections-api-client */
import {z} from "zod";
import type {MessagingConnectionsBrowserClient} from "@/src/modules/messaging/application/ports/messaging-connections-browser-client";
import {messagingConfigurationSchema} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {messagingConnectionMutationSchema} from "@/src/modules/messaging/application/results/messaging-connection-mutation-result";
import {messagingConnectionOperationRecoverySchema} from "@/src/modules/messaging/application/results/messaging-connection-operation-result";
import {messagingCredentialValidationSchema} from "@/src/modules/messaging/application/results/messaging-credential-validation-result";
import {createAdmissionOperationStateSchema} from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_CONNECTIONS_BROWSER_PATH} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_CONNECTION_STATE} from "@/src/modules/messaging/constants/messaging-connection";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {messagingUsageBrowserClient} from "./messaging-usage-api-client";
import {createMessagingBrowserRequest,messagingBrowserFailure as failure} from "./messaging-browser-api-client";

/** @param options - Own transport/viewer injection; default viewer retains the actual auth client. @returns Abortable metadata and explicit original writes with no hidden retry or key storage. */
export function createMessagingConnectionsBrowserClient(options:{fetch?:typeof fetch;viewer?:MessagingConnectionsBrowserClient["viewer"]}={}):MessagingConnectionsBrowserClient{
  const request=createMessagingBrowserRequest(options.fetch);
  const path=(slug:string,suffix:string)=>`${MESSAGING_CONNECTIONS_BROWSER_PATH.tribePrefix}/${encodeURIComponent(slug)}/${suffix}`;
  return{
    viewer:options.viewer??messagingUsageBrowserClient.viewer,
    read:(slug,signal)=>request(path(slug,MESSAGING_CONNECTIONS_BROWSER_PATH.configuration),messagingConfigurationSchema,signal),
    async create(slug,input,signal){
      const schema=createAdmissionOperationStateSchema(messagingConnectionMutationSchema.extend({version:z.literal(1),configurationVersion:z.literal(1),state:z.literal(MESSAGING_CONNECTION_STATE.draft)}).strict()),result=await request(path(slug,MESSAGING_CONNECTIONS_BROWSER_PATH.connections),schema,signal,{method:"POST",input});
      return result.status==="ready"&&result.value.operationId.toLowerCase()!==input.operationId.toLowerCase()?failure(MESSAGING_ERROR_CODE.publicContractUnusable,true):result;
    },
    async validate(slug,connectionId,input,signal){
      const schema=createAdmissionOperationStateSchema(messagingCredentialValidationSchema.strict()),result=await request(`${path(slug,MESSAGING_CONNECTIONS_BROWSER_PATH.connections)}/${encodeURIComponent(connectionId)}/${MESSAGING_CONNECTIONS_BROWSER_PATH.validate}`,schema,signal,{method:"POST",input});
      if(result.status!=="ready")return result;
      if(result.value.operationId.toLowerCase()!==input.operationId.toLowerCase()||result.value.state===OPERATION_STATE.completed&&(result.value.result.id.toLowerCase()!==connectionId.toLowerCase()||result.value.result.version!==input.expectedVersion+1))return failure(MESSAGING_ERROR_CODE.publicContractUnusable,true);
      return result;
    },
    async operation(slug,operationId,signal){const result=await request(`${path(slug,MESSAGING_CONNECTIONS_BROWSER_PATH.operations)}/${encodeURIComponent(operationId)}`,messagingConnectionOperationRecoverySchema,signal);return result.status==="ready"&&result.value.operationId.toLowerCase()!==operationId.toLowerCase()?failure(MESSAGING_ERROR_CODE.publicContractUnusable):result;},
  };
}
/** Construction has no session lookup or request; every operation remains an explicit container action. */
export const messagingConnectionsBrowserClient=createMessagingConnectionsBrowserClient();
