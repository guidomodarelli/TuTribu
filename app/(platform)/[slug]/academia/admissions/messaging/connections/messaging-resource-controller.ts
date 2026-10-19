"use client";
/** Owns controlled channel draft and scoped resource pages while the route serializes auth, transport lifetimes and original mutations. @module messaging-resource-controller */
import {useState} from "react";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingResourcePageResult} from "@/src/modules/messaging/application/results/messaging-resource-page-result";
import type {MessagingResourcesBrowserClient} from "@/src/modules/messaging/application/ports/messaging-resources-browser-client";
import type {MessagingUsageBrowserResult} from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import type {MessagingChannelDraft,MessagingChannelFieldErrors} from "@/src/modules/messaging/application/commands/messaging-channel-draft";
import {validateMessagingChannelDraft} from "@/src/modules/messaging/application/commands/messaging-channel-draft";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_RESOURCE_KIND} from "@/src/modules/messaging/constants/messaging-resources";
import {MESSAGING_RESOURCE_UI_COPY} from "@/src/modules/messaging/constants/messaging-resources-browser";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import type {MessagingProviderChannel} from "@/src/modules/messaging/application/ports/messaging-provider-catalog-reader";

/** Route callbacks preserve one auth/phase/original-operation owner instead of creating competing workflows. */
type ResourceControllerOptions={
  candidate:MessagingConfigurationConnection|null;slug:string;client:MessagingResourcesBrowserClient;blocked:boolean;availableChannels:readonly MessagingProviderChannel[];
  observe:<Value>(request:(signal:AbortSignal)=>Promise<MessagingUsageBrowserResult<Value>>,settle:(outcome:MessagingUsageBrowserResult<Value>)=>void)=>Promise<void>;
  configure:(draft:MessagingChannelDraft)=>Promise<void>;
  feedback:(message:{kind:"status"|"alert";text:string}|null)=>void;
  conflict:()=>void;
};

/** @param options - Current immutable scope and route-owned action coordination. @returns Draft, bounded pages and explicit callbacks; scope changes never fetch or select a resource automatically. */
export function useMessagingResourceController(options:ResourceControllerOptions){
  const scopeKey=`${options.candidate?.id??""}:${options.candidate?.configurationVersion??0}`;
  /** @param scope - Current immutable configuration key. @returns Empty controlled proposals for this exact scope, without a fetch or inferred selection. */
  const initialScope=(scope:string)=>({scopeKey:scope,draft:{channel:MESSAGING_PUBLIC_CHANNEL.email,senderId:"",templateId:"",templateLanguage:""} as MessagingChannelDraft,touched:{} as Partial<Record<keyof MessagingChannelFieldErrors,true>>,confirmed:false,senders:{items:[]} as Pick<MessagingResourcePageResult,"items"|"nextCursor">,templates:{items:[]} as Pick<MessagingResourcePageResult,"items"|"nextCursor">});
  const[state,setState]=useState(()=>initialScope(scopeKey));
  if(state.scopeKey!==scopeKey)setState(initialScope(scopeKey));
  const current=state.scopeKey===scopeKey?state:initialScope(scopeKey),{draft,confirmed,senders,templates,touched}=current;
  const update=(patch:Partial<typeof state>)=>setState((previous)=>previous.scopeKey===scopeKey?{...previous,...patch}:previous);
  /** A field is touched once its value changes; a channel switch starts a new untouched draft. */
  const setDraft=(value:MessagingChannelDraft)=>update({draft:value,touched:value.channel!==draft.channel?{}:{...touched,...(value.senderId!==draft.senderId?{senderId:true}:{}),...(value.templateId!==draft.templateId?{templateId:true}:{}),...(value.templateLanguage!==draft.templateLanguage?{templateLanguage:true}:{})}}),setConfirmed=(value:boolean)=>update({confirmed:value});
  const setSenders=(value:Pick<MessagingResourcePageResult,"items"|"nextCursor">)=>update({senders:value}),setTemplates=(value:Pick<MessagingResourcePageResult,"items"|"nextCursor">)=>update({templates:value});
  const validation=validateMessagingChannelDraft(draft),visibleErrors:MessagingChannelFieldErrors=Object.fromEntries(Object.entries(validation.fieldErrors).filter(([field])=>touched[field as keyof MessagingChannelFieldErrors]));
  const channelAvailable=options.availableChannels.includes(draft.channel);
  /** @param next - Explicit field proposal. @returns Nothing after invalidating consent and stale feedback, without reading or saving. */
  const change=(next:MessagingChannelDraft)=>{if(options.blocked)return;setConfirmed(false);if(!options.availableChannels.includes(next.channel)){options.feedback({kind:"alert",text:MESSAGING_RESOURCE_UI_COPY.channelUnavailable});return;}setDraft(next);options.feedback(null);};
  /** @param kind - Fixed own resource kind. @param more - Explicit own continuation action. @returns Nothing until a complete current page is observed; incomplete/failed reads discard publishable options. */
  const read=async(kind:typeof MESSAGING_RESOURCE_KIND[keyof typeof MESSAGING_RESOURCE_KIND],more=false)=>{
    const candidate=options.candidate;if(!candidate||options.blocked)return;
    if(!channelAvailable||kind===MESSAGING_RESOURCE_KIND.templates&&(draft.channel!==MESSAGING_PUBLIC_CHANNEL.whatsapp||!options.availableChannels.includes(MESSAGING_PUBLIC_CHANNEL.whatsapp))){options.feedback({kind:"alert",text:MESSAGING_RESOURCE_UI_COPY.channelUnavailable});return;}
    const previous=kind===MESSAGING_RESOURCE_KIND.senders?senders:templates,cursor=more?previous.nextCursor:undefined;
    if(more&&!cursor)return;
    options.feedback({kind:"status",text:MESSAGING_RESOURCE_UI_COPY.reading});
    await options.observe((signal)=>options.client.read({slug:options.slug,connectionId:candidate.id,configurationVersion:candidate.configurationVersion,kind,...(cursor?{cursor}:{})},signal),(outcome)=>{
      const apply=kind===MESSAGING_RESOURCE_KIND.senders?setSenders:setTemplates;
      if(outcome.status==="ready"){
        if(cursor&&outcome.value.nextCursor===cursor){apply({items:[]});options.feedback({kind:"alert",text:MESSAGING_RESOURCE_UI_COPY.readingFailed});return;}
        const items=more?[...new Map([...previous.items,...outcome.value.items].map((resource)=>[resource.id,resource])).values()]:outcome.value.items;
        apply({items,...(outcome.value.nextCursor?{nextCursor:outcome.value.nextCursor}:{})});// Senders also serve other channels; only the ones usable by the chosen channel count as found.
        const usable=kind===MESSAGING_RESOURCE_KIND.senders?items.filter((sender)=>sender.channels.includes(draft.channel)):items;
        options.feedback(usable.length===0?{kind:"status",text:kind===MESSAGING_RESOURCE_KIND.senders?MESSAGING_RESOURCE_UI_COPY.sendersEmpty:MESSAGING_RESOURCE_UI_COPY.templatesEmpty}:null);
      }else if(outcome.status==="failed"){apply({items:[]});if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict)options.conflict();options.feedback({kind:"alert",text:outcome.message});}
    });
  };
  /** @returns Nothing before explicit valid consent; successful configuration clears consent independently of whether the server reports a no-op. */
  const save=async()=>{if(options.blocked)return;if(!channelAvailable){options.feedback({kind:"alert",text:MESSAGING_RESOURCE_UI_COPY.channelUnavailable});return;}if(!validation.valid)update({touched:{senderId:true,templateId:true,templateLanguage:true}});if(!confirmed||!validation.valid)return;setConfirmed(false);await options.configure(draft);};
  return{draft,confirmed,senders,templates,resetConfirmation:()=>setConfirmed(false),fieldErrors:visibleErrors,canSave:!options.blocked&&channelAvailable&&confirmed&&validation.valid,
    change,confirm:(value:boolean)=>{if(options.blocked)return;setConfirmed(value);options.feedback(null);},save,
    readSenders:()=>read(MESSAGING_RESOURCE_KIND.senders),moreSenders:()=>read(MESSAGING_RESOURCE_KIND.senders,true),readTemplates:()=>read(MESSAGING_RESOURCE_KIND.templates),moreTemplates:()=>read(MESSAGING_RESOURCE_KIND.templates,true),
    chooseTemplate:(templateId:string)=>{const template=templates.items.find((option)=>option.id===templateId);change({...draft,templateId,templateLanguage:template?.language??draft.templateLanguage});},
  };
}
