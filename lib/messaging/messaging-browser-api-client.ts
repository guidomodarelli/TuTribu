"use client";
/** Shares guarded same-origin HTTP observations without retrying mutations or preserving private input. @module messaging-browser-api-client */
import {OPERATION_STATE} from "@/src/constants/operation-state";
import type {z} from "zod";
import type {MessagingUsageBrowserResult} from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type {MessagingErrorCode} from "@/src/modules/messaging/application/results/messaging-errors";
import {messagingPublicErrorSchema} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import {MESSAGING_ERROR_CODE,MESSAGING_ERROR_MESSAGE} from "@/src/modules/messaging/constants/messaging-errors";
import {HTTP_STATUS} from "@/src/constants/http-status";
import {boundBrowserRequest} from "@/lib/browser-request-deadline";
import {BROWSER_REQUEST_TRANSPORT_MESSAGE} from "@/src/constants/browser-request";

/** @param code - Own semantic outcome. @param uncertain - Whether a write may have committed. @returns Safe localized facts with no body, transport cause or provider error. */
export function messagingBrowserFailure(code:MessagingErrorCode,uncertain=false,message:string=MESSAGING_ERROR_MESSAGE[code]):MessagingUsageBrowserResult<never>{return{status:"failed",code,message,uncertain};}

/**
 * A failure bound to its original decides by that original: a completed one is its final answer (a stored denial, or a
 * credential check that completed with a provider failure, even under a 5xx), while an unfinished or unresolved one stays
 * uncertain and recoverable. Without an original, only a 5xx leaves a write uncertain.
 * @param failure - Guarded own public failure. @param status - Its HTTP status.
 * @returns Whether the write may have committed.
 */
function isUncertainWriteFailure(failure:{code:MessagingErrorCode;operation?:{state:string}},status:number):boolean{
  if(failure.operation)return failure.operation.state!==OPERATION_STATE.completed||failure.code===MESSAGING_ERROR_CODE.operationUnresolved;
  return status>=HTTP_STATUS.serverError;
}

/** @param transport - Native fetch or an owned HTTP boundary. @returns A single-request observer; all input and DTO ownership stays with the caller. */
export function createMessagingBrowserRequest(transport:typeof fetch=globalThis.fetch){
  /** @param url - Fixed same-origin adapter path. @param schema - Own public DTO guard. @param signal - Observation lifetime. @param write - Explicit method/input, absent for reads. @returns A safe observed result or uncertainty, never inferred rollback or an automatic retry. */
  return async function request<Value>(url:string,schema:z.ZodType<Value>,callerSignal:AbortSignal,write?:{method:"POST"|"PUT";input:object}):Promise<MessagingUsageBrowserResult<Value>>{
    const writing=write!==undefined;if(callerSignal.aborted)return{status:"aborted"};
    // A hung response ends at the deadline as a timeout that keeps a write uncertain; the caller's own cancellation stays an abort.
    return boundBrowserRequest<MessagingUsageBrowserResult<Value>>(callerSignal,(signal)=>send(url,schema,signal,write),()=>messagingBrowserFailure(MESSAGING_ERROR_CODE.transportTimeout,writing));
  };

  /** Sends one own request under a signal that already follows the caller and the deadline. */
  async function send<Value>(url:string,schema:z.ZodType<Value>,signal:AbortSignal,write?:{method:"POST"|"PUT";input:object}):Promise<MessagingUsageBrowserResult<Value>>{
    const writing=write!==undefined;
    try{
      const response=await transport(url,{method:write?.method??"GET",credentials:"same-origin",cache:"no-store",signal,...(write?{headers:{"content-type":"application/json"},body:JSON.stringify(write.input)}:{})});
      let body:unknown;try{body=await response.json();}catch{return signal.aborted?{status:"aborted"}:messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);}
      if(signal.aborted)return{status:"aborted"};
      const publicFailure=messagingPublicErrorSchema.safeParse(body);
      if(publicFailure.success)return messagingBrowserFailure(publicFailure.data.code,writing&&isUncertainWriteFailure(publicFailure.data,response.status));
      if(!response.ok)return messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);
      const parsed=schema.safeParse(body);return parsed.success?{status:"ready",value:parsed.data}:messagingBrowserFailure(MESSAGING_ERROR_CODE.publicContractUnusable,writing);
    }catch{return signal.aborted?{status:"aborted"}:messagingBrowserFailure(MESSAGING_ERROR_CODE.dependencyUnavailable,writing,BROWSER_REQUEST_TRANSPORT_MESSAGE);}
  }
}
