"use client";
/** Shares guarded same-origin HTTP observations without retrying mutations or preserving private input. @module messaging-browser-api-client */
import {z} from "zod";
import type {MessagingUsageBrowserResult} from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type {MessagingErrorCode} from "@/src/modules/messaging/application/results/messaging-errors";
import {messagingPublicErrorSchema} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import {MESSAGING_ERROR_CODE,MESSAGING_ERROR_MESSAGE} from "@/src/modules/messaging/constants/messaging-errors";
import {HTTP_STATUS} from "@/src/constants/http-status";

/** @param code - Own semantic outcome. @param uncertain - Whether a write may have committed. @returns Safe localized facts with no body, transport cause or provider error. */
export function messagingBrowserFailure(code:MessagingErrorCode,uncertain=false):MessagingUsageBrowserResult<never>{return{status:"failed",code,message:MESSAGING_ERROR_MESSAGE[code],uncertain};}

/** @param transport - Native fetch or an owned HTTP boundary. @returns A single-request observer; all input and DTO ownership stays with the caller. */
export function createMessagingBrowserRequest(transport:typeof fetch=globalThis.fetch){
  /** @param url - Fixed same-origin adapter path. @param schema - Own public DTO guard. @param signal - Observation lifetime. @param write - Explicit method/input, absent for reads. @returns A safe observed result or uncertainty, never inferred rollback or an automatic retry. */
  return async function request<Value>(url:string,schema:z.ZodType<Value>,signal:AbortSignal,write?:{method:"POST"|"PUT";input:object}):Promise<MessagingUsageBrowserResult<Value>>{
    const writing=write!==undefined;if(signal.aborted)return{status:"aborted"};
    try{
      const response=await transport(url,{method:write?.method??"GET",credentials:"same-origin",cache:"no-store",signal,...(write?{headers:{"content-type":"application/json"},body:JSON.stringify(write.input)}:{})});
      let body:unknown;try{body=await response.json();}catch{return signal.aborted?{status:"aborted"}:messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);}
      if(signal.aborted)return{status:"aborted"};
      const publicFailure=messagingPublicErrorSchema.safeParse(body);
      if(publicFailure.success)return messagingBrowserFailure(publicFailure.data.code,writing&&(response.status>=HTTP_STATUS.serverError||publicFailure.data.operation!==undefined));
      if(!response.ok)return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);
      const parsed=schema.safeParse(body);return parsed.success?{status:"ready",value:parsed.data}:messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);
    }catch{return signal.aborted?{status:"aborted"}:messagingBrowserFailure(MESSAGING_ERROR_CODE.dependencyUnavailable,writing);}
  };
}
