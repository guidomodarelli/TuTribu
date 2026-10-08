"use client";
/** Guards same-origin wizard transport and original identities without storing keys, refreshing a route or retrying writes. @module messaging-connections-api-client */
import {z} from "zod";
import type {MessagingConnectionsBrowserClient,MessagingConnectionsBrowserResult} from "@/src/modules/messaging/application/ports/messaging-connections-browser-client";
import {messagingConfigurationSchema} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {messagingConnectionMutationSchema} from "@/src/modules/messaging/application/results/messaging-connection-mutation-result";
import {messagingConnectionOperationRecoverySchema} from "@/src/modules/messaging/application/results/messaging-connection-operation-result";
import {messagingPublicErrorSchema} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import {createAdmissionOperationStateSchema} from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import {MESSAGING_ERROR_CODE,MESSAGING_ERROR_MESSAGE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_CONNECTIONS_BROWSER_PATH} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_CONNECTION_STATE} from "@/src/modules/messaging/constants/messaging-connection";
import {HTTP_STATUS} from "@/src/constants/http-status";
import {messagingUsageBrowserClient} from "./messaging-usage-api-client";

/** @param options - Own transport/viewer injection; default viewer retains the actual auth client. @returns Abortable metadata and explicit original writes with no hidden retry or key storage. */
export function createMessagingConnectionsBrowserClient(options:{fetch?:typeof fetch;viewer?:MessagingConnectionsBrowserClient["viewer"]}={}):MessagingConnectionsBrowserClient{
  const transport=options.fetch??globalThis.fetch;
  /** @param code - Safe own semantic error. @param uncertain - Whether a write may already have committed. @returns No private body/cause. */
  const failure=(code:typeof MESSAGING_ERROR_CODE[keyof typeof MESSAGING_ERROR_CODE],uncertain=false):MessagingConnectionsBrowserResult<never>=>({status:"failed",code,message:MESSAGING_ERROR_MESSAGE[code],uncertain});
  const path=(slug:string,suffix:string)=>`${MESSAGING_CONNECTIONS_BROWSER_PATH.tribePrefix}/${encodeURIComponent(slug)}/${suffix}`;
  /** @param url - Own same-origin route. @param schema - Own public DTO guard. @param signal - Original observation. @param input - Only an explicit write. @returns Safe observation, never a provider object or inferred rollback. */
  async function request<Value>(url:string,schema:z.ZodType<Value>,signal:AbortSignal,input?:object):Promise<MessagingConnectionsBrowserResult<Value>>{
    const writing=input!==undefined;if(signal.aborted)return{status:"aborted"};
    try{
      const response=await transport(url,{method:writing?"POST":"GET",credentials:"same-origin",cache:"no-store",signal,...(writing?{headers:{"content-type":"application/json"},body:JSON.stringify(input)}:{})});
      let body:unknown;try{body=await response.json();}catch{return signal.aborted?{status:"aborted"}:failure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);}
      if(signal.aborted)return{status:"aborted"};const publicFailure=messagingPublicErrorSchema.safeParse(body);
      if(publicFailure.success)return failure(publicFailure.data.code,writing&&(response.status>=HTTP_STATUS.serverError||publicFailure.data.operation!==undefined));
      if(!response.ok)return failure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);
      const parsed=schema.safeParse(body);return parsed.success?{status:"ready",value:parsed.data}:failure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);
    }catch{return signal.aborted?{status:"aborted"}:failure(MESSAGING_ERROR_CODE.dependencyUnavailable,writing);}
  }
  return{
    viewer:options.viewer??messagingUsageBrowserClient.viewer,
    read:(slug,signal)=>request(path(slug,MESSAGING_CONNECTIONS_BROWSER_PATH.configuration),messagingConfigurationSchema,signal),
    async create(slug,input,signal){
      const schema=createAdmissionOperationStateSchema(messagingConnectionMutationSchema.extend({version:z.literal(1),configurationVersion:z.literal(1),state:z.literal(MESSAGING_CONNECTION_STATE.draft)}).strict()),result=await request(path(slug,MESSAGING_CONNECTIONS_BROWSER_PATH.connections),schema,signal,input);
      return result.status==="ready"&&result.value.operationId.toLowerCase()!==input.operationId.toLowerCase()?failure(MESSAGING_ERROR_CODE.publicContractUnusable,true):result;
    },
    async operation(slug,operationId,signal){const result=await request(`${path(slug,MESSAGING_CONNECTIONS_BROWSER_PATH.operations)}/${encodeURIComponent(operationId)}`,messagingConnectionOperationRecoverySchema,signal);return result.status==="ready"&&result.value.operationId.toLowerCase()!==operationId.toLowerCase()?failure(MESSAGING_ERROR_CODE.publicContractUnusable):result;},
  };
}
/** Construction has no session lookup or request; every operation remains an explicit container action. */
export const messagingConnectionsBrowserClient=createMessagingConnectionsBrowserClient();
