"use client";
/** Owns controlled channel draft and scoped resource pages while the route serializes auth, transport lifetimes and original mutations. @module messaging-resource-controller */
import {useRef,useState} from "react";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import type {MessagingResourcePageResult} from "@/src/modules/messaging/application/results/messaging-resource-page-result";
import type {MessagingResourcesBrowserClient} from "@/src/modules/messaging/application/ports/messaging-resources-browser-client";
import type {MessagingUsageBrowserResult} from "@/src/modules/messaging/application/ports/messaging-usage-browser-client";
import {type MessagingChannelDraft,type MessagingChannelFieldErrors,validateMessagingChannelDraft} from "@/src/modules/messaging/application/commands/messaging-channel-draft";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_RESOURCE_KIND} from "@/src/modules/messaging/constants/messaging-resources";
import {MESSAGING_RESOURCE_UI_COPY} from "@/src/modules/messaging/constants/messaging-resources-browser";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import type {MessagingProviderChannel} from "@/src/modules/messaging/application/ports/messaging-provider-catalog-reader";
import type {MessagingResourceListState,MessagingResourceReading} from "@/components/academy-admissions/messaging-connection-resources";

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
  const initialScope=(scope:string)=>({scopeKey:scope,draft:{channel:MESSAGING_PUBLIC_CHANNEL.email,senderId:"",templateId:"",templateLanguage:""} as MessagingChannelDraft,touched:{} as Partial<Record<keyof MessagingChannelFieldErrors,true>>,confirmed:false,senders:{items:[]} as Pick<MessagingResourcePageResult,"items"|"nextCursor">,templates:{items:[]} as Pick<MessagingResourcePageResult,"items"|"nextCursor">,sendersList:{status:"unread"} as MessagingResourceListState,templatesList:{status:"unread"} as MessagingResourceListState});
  const[state,setState]=useState(()=>initialScope(scopeKey));
  if(state.scopeKey!==scopeKey)setState(initialScope(scopeKey));
  const current=state.scopeKey===scopeKey?state:initialScope(scopeKey),{draft,confirmed,senders,templates,touched,sendersList,templatesList}=current;
  /** The list read in flight: its control shows progress, and a second press is ignored until it settles. */
  const[reading,setReading]=useState<MessagingResourceReading|null>(null),readingRef=useRef(false);
  const update=(patch:Partial<typeof state>)=>setState((previous)=>previous.scopeKey===scopeKey?{...previous,...patch}:previous);
  /** A field is touched once its value changes; a channel switch starts a new untouched draft. */
  const setDraft=(value:MessagingChannelDraft)=>update({draft:value,touched:value.channel!==draft.channel?{}:{...touched,...(value.senderId!==draft.senderId?{senderId:true}:{}),...(value.templateId!==draft.templateId?{templateId:true}:{}),...(value.templateLanguage!==draft.templateLanguage?{templateLanguage:true}:{})}}),setConfirmed=(value:boolean)=>update({confirmed:value});
  const validation=validateMessagingChannelDraft(draft),visibleErrors:MessagingChannelFieldErrors=Object.fromEntries(Object.entries(validation.fieldErrors).filter(([field])=>touched[field as keyof MessagingChannelFieldErrors]));
  const channelAvailable=options.availableChannels.includes(draft.channel);
  /** @param next - Explicit field proposal. @returns Nothing after invalidating consent and stale feedback, without reading or saving. */
  const change=(next:MessagingChannelDraft)=>{if(options.blocked)return;setConfirmed(false);if(!options.availableChannels.includes(next.channel)){options.feedback({kind:"alert",text:MESSAGING_RESOURCE_UI_COPY.channelUnavailable});return;}setDraft(next);options.feedback(null);};
  /** @param kind - Fixed own resource kind. @param more - Explicit own continuation action. @returns Nothing until a complete current page is observed; incomplete/failed reads discard publishable options. */
  const read=async(kind:typeof MESSAGING_RESOURCE_KIND[keyof typeof MESSAGING_RESOURCE_KIND],more=false)=>{
    const candidate=options.candidate;if(!candidate||options.blocked)return;
    if(!channelAvailable||kind===MESSAGING_RESOURCE_KIND.templates&&(draft.channel!==MESSAGING_PUBLIC_CHANNEL.whatsapp||!options.availableChannels.includes(MESSAGING_PUBLIC_CHANNEL.whatsapp))){options.feedback({kind:"alert",text:MESSAGING_RESOURCE_UI_COPY.channelUnavailable});return;}
    const previous=kind===MESSAGING_RESOURCE_KIND.senders?senders:templates,cursor=more?previous.nextCursor:undefined;
    if(more&&!cursor||readingRef.current)return;
    const senderKind=kind===MESSAGING_RESOURCE_KIND.senders,apply=(page:Pick<MessagingResourcePageResult,"items"|"nextCursor">,list:MessagingResourceListState)=>update(senderKind?{senders:page,sendersList:list}:{templates:page,templatesList:list});
    readingRef.current=true;setReading(senderKind?(more?"moreSenders":"senders"):(more?"moreTemplates":"templates"));
    try{
      await options.observe((signal)=>options.client.read({slug:options.slug,connectionId:candidate.id,configurationVersion:candidate.configurationVersion,kind,...(cursor?{cursor}:{})},signal),(outcome)=>{
        // The outcome stays beside its list: an empty result explains itself under the select, a failure keeps its retry there.
        if(outcome.status==="ready"){
          if(cursor&&outcome.value.nextCursor===cursor){apply({items:[]},{status:"failed",message:MESSAGING_RESOURCE_UI_COPY.readingFailed});return;}
          const items=more?[...new Map([...previous.items,...outcome.value.items].map((resource)=>[resource.id,resource])).values()]:outcome.value.items;
          apply({items,...(outcome.value.nextCursor?{nextCursor:outcome.value.nextCursor}:{})},{status:"read"});
        }else if(outcome.status==="failed"){
          // A conflict is explained once by the page banner that asks to read the current connection.
          if(outcome.code===MESSAGING_ERROR_CODE.connectionConflict){apply({items:[]},{status:"unread"});options.conflict();}
          else apply({items:[]},{status:"failed",message:outcome.message});
        }
      });
    }finally{readingRef.current=false;setReading(null);}
  };
  /** @returns Nothing before explicit valid consent; successful configuration clears consent independently of whether the server reports a no-op. */
  const save=async()=>{if(options.blocked)return;if(!channelAvailable){options.feedback({kind:"alert",text:MESSAGING_RESOURCE_UI_COPY.channelUnavailable});return;}if(!validation.valid)update({touched:{senderId:true,templateId:true,templateLanguage:true}});if(!confirmed||!validation.valid)return;setConfirmed(false);await options.configure(draft);};
  return{draft,confirmed,senders,templates,sendersList,templatesList,reading,resetConfirmation:()=>setConfirmed(false),fieldErrors:visibleErrors,canSave:!options.blocked&&channelAvailable&&confirmed&&validation.valid,
    change,confirm:(value:boolean)=>{if(options.blocked)return;setConfirmed(value);options.feedback(null);},save,
    readSenders:()=>read(MESSAGING_RESOURCE_KIND.senders),moreSenders:()=>read(MESSAGING_RESOURCE_KIND.senders,true),readTemplates:()=>read(MESSAGING_RESOURCE_KIND.templates),moreTemplates:()=>read(MESSAGING_RESOURCE_KIND.templates,true),
    chooseTemplate:(templateId:string)=>{const template=templates.items.find((option)=>option.id===templateId);change({...draft,templateId,templateLanguage:template?.language??draft.templateLanguage});},
  };
}
