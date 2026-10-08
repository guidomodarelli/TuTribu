"use client";
/** Binds same-origin resource/configuration DTOs to their exact own current counters without provider access or retries. @module messaging-resources-api-client */
import type {MessagingResourcesBrowserClient} from "@/src/modules/messaging/application/ports/messaging-resources-browser-client";
import {messagingResourcePageSchema} from "@/src/modules/messaging/application/results/messaging-resource-page-result";
import {messagingConnectionConfigurationSchema} from "@/src/modules/messaging/application/results/messaging-connection-configuration-result";
import {createAdmissionOperationStateSchema} from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import {MESSAGING_CONNECTIONS_BROWSER_PATH} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_RESOURCE_CONFIGURATION_PATH} from "@/src/modules/messaging/constants/messaging-resources-browser";
import {ADMISSION_QUERY_LIMIT} from "@/src/modules/academy-admissions/constants/admission-public-contract";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {OPERATION_STATE} from "@/src/constants/operation-state";
import {createMessagingBrowserRequest,messagingBrowserFailure} from "./messaging-browser-api-client";

/** @param options - Owned HTTP injection, without auth/provider mocks. @returns Explicit resource observations and immutable configuration writes; construction performs no fetch. */
export function createMessagingResourcesBrowserClient(options:{fetch?:typeof fetch}={}):MessagingResourcesBrowserClient{
  const request=createMessagingBrowserRequest(options.fetch),path=(slug:string,connectionId:string)=>`${MESSAGING_CONNECTIONS_BROWSER_PATH.tribePrefix}/${encodeURIComponent(slug)}/${MESSAGING_CONNECTIONS_BROWSER_PATH.connections}/${encodeURIComponent(connectionId)}`;
  return{
    async read(query,signal){
      const search=new URLSearchParams({limit:String(ADMISSION_QUERY_LIMIT.defaultPageSize)});if(query.cursor)search.set("cursor",query.cursor);
      const result=await request(`${path(query.slug,query.connectionId)}/${query.kind}?${search}`,messagingResourcePageSchema,signal);
      if(result.status==="ready"&&(result.value.connectionId.toLowerCase()!==query.connectionId.toLowerCase()||result.value.configurationVersion!==query.configurationVersion))return messagingBrowserFailure(MESSAGING_ERROR_CODE.connectionConflict);
      return result;
    },
    async configure(scope,input,signal){
      const result=await request(`${path(scope.slug,scope.connectionId)}/${MESSAGING_RESOURCE_CONFIGURATION_PATH}`,createAdmissionOperationStateSchema(messagingConnectionConfigurationSchema.strict()),signal,{method:"PUT",input});
      if(result.status!=="ready")return result;
      if(result.value.operationId.toLowerCase()!==input.operationId.toLowerCase())return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);
      if(result.value.state===OPERATION_STATE.completed){const value=result.value.result,increment=value.changed?1:0;if(value.id.toLowerCase()!==scope.connectionId.toLowerCase()||value.version!==input.expectedVersion+increment||value.configurationVersion!==scope.configurationVersion+increment)return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,true);}
      return result;
    },
  };
}
/** Instantiation neither reads a key nor fetches a resource; the container must request every action. */
export const messagingResourcesBrowserClient=createMessagingResourcesBrowserClient();
