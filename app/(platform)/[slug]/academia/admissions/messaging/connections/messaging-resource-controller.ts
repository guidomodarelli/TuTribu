"use client";
/** Owns controlled channel draft and scoped resource pages while the route serializes auth, transport lifetimes and original mutations. @module messaging-resource-controller */
import {useState} from "react";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingResourcePageResult} from "@/src/modules/messaging/application/results/messaging-resource-page-result";
import type {MessagingResourcesBrowserClient} from "@/src/modules/messaging/application/ports/messaging-resources-browser-client";
import type {MessagingUsageBrowserResult} from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type {MessagingChannelDraft} from "@/src/modules/messaging/application/commands/messaging-channel-draft";
import {validateMessagingChannelDraft} from "@/src/modules/messaging/application/commands/messaging-channel-draft";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_RESOURCE_KIND} from "@/src/modules/messaging/constants/messaging-resources";
import {MESSAGING_RESOURCE_UI_COPY} from "@/src/modules/messaging/constants/messaging-resources-browser";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";

/** Route callbacks preserve one auth/phase/original-operation owner instead of creating competing workflows. */
type ResourceControllerOptions={
  candidate:MessagingConfigurationConnection|null;slug:string;client:MessagingResourcesBrowserClient;blocked:boolean;
  observe:<Value>(request:(signal:AbortSignal)=>Promise<MessagingUsageBrowserResult<Value>>,settle:(outcome:MessagingUsageBrowserResult<Value>)=>void)=>Promise<void>;
  configure:(draft:MessagingChannelDraft)=>Promise<void>;
  feedback:(message:{kind:"status"|"alert";text:string}|null)=>void;
  conflict:()=>void;
};

/** @param options - Current immutable scope and route-owned action coordination. @returns Draft, bounded pages and explicit callbacks; scope changes never fetch or select a resource automatically. */
export function useMessagingResourceController(options:ResourceControllerOptions){
  const scopeKey=`${options.candidate?.id??""}:${options.candidate?.configurationVersion??0}`;
  /** @param scope - Current immutable configuration key. @returns Empty controlled proposals for this exact scope, without a fetch or inferred selection. */
  const initialScope=(scope:string)=>({scopeKey:scope,draft:{channel:MESSAGING_PUBLIC_CHANNEL.email,senderId:"",templateId:"",templateLanguage:""} as MessagingChannelDraft,confirmed:false,senders:{items:[]} as Pick<MessagingResourcePageResult,"items"|"nextCursor">,templates:{items:[]} as Pick<MessagingResourcePageResult,"items"|"nextCursor">});
  const[state,setState]=useState(()=>initialScope(scopeKey));
  if(state.scopeKey!==scopeKey)setState(initialScope(scopeKey));
  const current=state.scopeKey===scopeKey?state:initialScope(scopeKey),{draft,confirmed,senders,templates}=current;
  const update=(patch:Partial<typeof state>)=>setState((previous)=>previous.scopeKey===scopeKey?{...previous,...patch}:previous);
  const setDraft=(value:MessagingChannelDraft)=>update({draft:value}),setConfirmed=(value:boolean)=>update({confirmed:value});
  const setSenders=(value:Pick<MessagingResourcePageResult,"items"|"nextCursor">)=>update({senders:value}),setTemplates=(value:Pick<MessagingResourcePageResult,"items"|"nextCursor">)=>update({templates:value});
  const validation=validateMessagingChannelDraft(draft);
  /** @param next - Explicit field proposal. @returns Nothing after invalidating consent and stale feedback, without reading or saving. */
  const change=(next:MessagingChannelDraft)=>{if(options.blocked)return;setDraft(next);setConfirmed(false);options.feedback(null);};
  /** @param kind - Fixed own resource kind. @param more - Explicit own continuation action. @returns Nothing until a complete current page is observed; incomplete/failed reads discard publishable options. */
  const read=async(kind:typeof MESSAGING_RESOURCE_KIND[keyof typeof MESSAGING_RESOURCE_KIND],more=false)=>{
    const candidate=options.candidate;if(!candidate||options.blocked)return;
    const previous=kind===MESSAGING_RESOURCE_KIND.senders?senders:templates,cursor=more?previous.nextCursor:undefined;
    if(more&&!cursor)return;
    options.feedback({kind:"status",text:MESSAGING_RESOURCE_UI_COPY.reading});
    await options.observe((signal)=>options.client.read({slug:options.slug,connectionId:candidate.id,configurationVersion:candidate.configurationVersion,kind,...(cursor?{cursor}:{})},signal),(outcome)=>{
      const apply=kind===MESSAGING_RESOURCE_KIND.senders?setSenders:setTemplates;
      if(outcome.status==="ready"){
        if(cursor&&outcome.value.nextCursor===cursor){apply({items:[]});options.feedback({kind:"alert",text:MESSAGING_RESOURCE_UI_COPY.readingFailed});return;}
        const items=more?[...new Map([...previous.items,...outcome.value.items].map((resource)=>[resource.id,resource])).values()]:outcome.value.items;
        apply({items,...(outcome.value.nextCursor?{nextCursor:outcome.value.nextCursor}:{})});options.feedback(null);
      }else if(outcome.status==="failed"){apply({items:[]});if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict)options.conflict();options.feedback({kind:"alert",text:outcome.message});}
    });
  };
  /** @returns Nothing before explicit valid consent; successful configuration clears consent independently of whether the server reports a no-op. */
  const save=async()=>{if(options.blocked||!confirmed||!validation.valid)return;setConfirmed(false);await options.configure(draft);};
  return{draft,confirmed,senders,templates,resetConfirmation:()=>setConfirmed(false),fieldErrors:validation.fieldErrors,canSave:!options.blocked&&confirmed&&validation.valid,
    change,confirm:(value:boolean)=>{if(options.blocked)return;setConfirmed(value);options.feedback(null);},save,
    readSenders:()=>read(MESSAGING_RESOURCE_KIND.senders),moreSenders:()=>read(MESSAGING_RESOURCE_KIND.senders,true),readTemplates:()=>read(MESSAGING_RESOURCE_KIND.templates),moreTemplates:()=>read(MESSAGING_RESOURCE_KIND.templates,true),
    chooseTemplate:(templateId:string)=>{const template=templates.items.find((option)=>option.id===templateId);change({...draft,templateId,templateLanguage:template?.language??draft.templateLanguage});},
  };
}
