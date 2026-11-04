"use client";
/** Presents the Channels step: explicit channel/resource choices without session, transport, SDK or persistence ownership. @module messaging-connection-resources */
import {useId} from "react";
import {Button,Checkbox,Input,Select} from "@golfo/ui";
import type {MessagingResourcePageResult} from "@/src/modules/messaging/application/results/messaging-resource-page-result";
import {MESSAGING_PUBLIC_CHANNEL,MESSAGING_RESOURCE_READINESS} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_CHANNEL_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import {MESSAGING_RESOURCE_UI_COPY} from "@/src/modules/messaging/constants/messaging-resources-browser";
import type {MessagingProviderChannel} from "@/src/modules/messaging/application/ports/messaging-provider-catalog-reader";
import styles from "./styles.module.scss";

/** What the last explicit read of one list left: nothing read yet, a complete page (possibly empty for the channel), or a failure with its safe message. */
export type MessagingResourceListState={status:"unread"}|{status:"read"}|{status:"failed";message:string};
/** The list read in flight, so only its control shows progress. */
export type MessagingResourceReading="senders"|"moreSenders"|"templates"|"moreTemplates";
const UNREAD_LIST:MessagingResourceListState={status:"unread"};

/** Own references are proposals; the server confirms detail before committing any effective version. */
export type MessagingConnectionResourcesProps={
  /** Outcome of the last sender and template reads, shown under their select; `reading` names the read in flight. */
  sendersList?:MessagingResourceListState;templatesList?:MessagingResourceListState;reading?:MessagingResourceReading|null;
  /** `busy` covers every read and write; `saving` marks only the pressed configuration save. */
  channel:MessagingProviderChannel;availableChannels:readonly MessagingProviderChannel[];senderId:string;templateId:string;templateLanguage:string;confirmed:boolean;busy:boolean;saving?:boolean;canSave:boolean;
  senders:Pick<MessagingResourcePageResult,"items"|"nextCursor">;templates:Pick<MessagingResourcePageResult,"items"|"nextCursor">;
  fieldErrors:Partial<Record<"senderId"|"templateId"|"templateLanguage",string>>;message:{kind:"status"|"alert";text:string}|null;
  onChannelChange:(channel:MessagingConnectionResourcesProps["channel"])=>void;onSenderChange:(value:string)=>void;onTemplateChange:(value:string)=>void;onTemplateLanguageChange:(value:string)=>void;onConfirmationChange:(confirmed:boolean)=>void;
  onReadSenders:()=>void;onReadTemplates:()=>void;onMoreSenders:()=>void;onMoreTemplates:()=>void;onSave:()=>void;
};

/** Placeholders of one resource select, by what its last read found. */
type ResourcePlaceholderCopy={empty:string;later:string;unread:string;choose:string};
/** What the last read of one list found for the chosen channel. */
type ResourceReadFinding={nothing:boolean;morePages:boolean;count:number};
/** @param finding - What the last read found. @param copy - Placeholders of the resource. @returns The select placeholder: why it is empty, that the next page may have one, that it needs a read, or to choose one. */
function resourcePlaceholder({nothing,morePages,count}:ResourceReadFinding,copy:ResourcePlaceholderCopy):string{
  if(nothing)return morePages?copy.later:copy.empty;
  return count===0?copy.unread:copy.choose;
}

/** What a complete read left for one list: whether it found nothing usable, whether that is final, and the note shown under its select. */
type ResourceReadNote={nothing:boolean;empty:boolean;note:string|null};
/** @param read - Whether the last read completed. @param count - Usable resources shown. @param morePages - Whether a next page exists. @param copy - Notes of a final empty read and of an empty page with more to read. @returns What that read left. */
function resourceReadNote(read:boolean,count:number,morePages:boolean,copy:{empty:string;later:string}):ResourceReadNote{
  const nothing=read&&count===0,empty=nothing&&!morePages;
  if(!nothing)return{nothing,empty,note:null};
  return{nothing,empty,note:empty?copy.empty:copy.later};
}

/** @param props - Controlled own resource pages and explicit action callbacks. @returns Only fields required by the selected channel; no choice is selected automatically. */
export function MessagingConnectionResources(props:MessagingConnectionResourcesProps){
  const fieldId=useId(),senderId=`${fieldId}-sender`,templateId=`${fieldId}-template`,languageId=`${fieldId}-language`,channelId=`${fieldId}-channel`;
  const channelAvailable=props.availableChannels.includes(props.channel),whatsapp=channelAvailable&&props.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp,senders=channelAvailable?props.senders.items.filter((sender)=>sender.channels.includes(props.channel)):[];
  const sendersList=props.sendersList??UNREAD_LIST,templatesList=props.templatesList??UNREAD_LIST,reading=props.reading??null;
  // A complete read with nothing usable for the channel explains itself under its select instead of asking to read again; with a next page, it points to Ver más instead.
  const{nothing:sendersNothing,empty:sendersEmpty,note:sendersNote}=resourceReadNote(sendersList.status==="read",senders.length,Boolean(props.senders.nextCursor),{empty:MESSAGING_RESOURCE_UI_COPY.sendersEmpty,later:MESSAGING_RESOURCE_UI_COPY.sendersOnLaterPage});
  const{nothing:templatesNothing,empty:templatesEmpty,note:templatesNote}=resourceReadNote(templatesList.status==="read",props.templates.items.length,Boolean(props.templates.nextCursor),{empty:MESSAGING_RESOURCE_UI_COPY.templatesEmpty,later:MESSAGING_RESOURCE_UI_COPY.templatesOnLaterPage});
  const senderPlaceholder=resourcePlaceholder({nothing:sendersNothing,morePages:!sendersEmpty,count:senders.length},{empty:MESSAGING_RESOURCE_UI_COPY.sendersEmptyPlaceholder,later:"Buscá con Ver más remitentes",unread:"Consultá los remitentes primero",choose:"Elegí un remitente"});
  const templatePlaceholder=resourcePlaceholder({nothing:templatesNothing,morePages:!templatesEmpty,count:props.templates.items.length},{empty:MESSAGING_RESOURCE_UI_COPY.templatesEmptyPlaceholder,later:"Buscá con Ver más plantillas",unread:"Consultá las plantillas primero",choose:"Elegí una plantilla"});
  /** @param kind - Read whose control is drawn. @returns Its progress and disabled state: the pressed read stays focused and busy, every other control waits. */
  const readControl=(kind:MessagingResourceReading,available=true)=>({loading:reading===kind,disabled:reading!==kind&&(props.busy||!available)});
  return<section className={styles.MessagingConnectionResources} aria-labelledby={`${fieldId}-title`}>
    <h2 id={`${fieldId}-title`} className={styles.MessagingConnectionResources__title}>Preparar un canal</h2>
    <p className={styles.MessagingConnectionResources__lead}>Elegí recursos que ya existen en Zavu. El guardado comprueba el recurso y crea una nueva versión de la configuración, que después necesita sus pruebas. No envía mensajes.</p>
    <div className={styles.MessagingConnectionResources__form} role="group" aria-label="Recursos del canal" aria-busy={props.busy}>
      <div className={styles.MessagingConnectionResources__field}><Select value={channelAvailable?props.channel:""} disabled={props.busy||props.availableChannels.length===0} onValueChange={(value)=>{const channel=props.availableChannels.find((candidate)=>candidate===value);if(channel)props.onChannelChange(channel);}} id={channelId} aria-invalid={!channelAvailable} aria-describedby={channelAvailable?undefined:`${channelId}-error`} label="Canal que querés preparar" options={props.availableChannels.map((channel) => ({ value: channel, label: MESSAGING_CHANNEL_LABEL[channel] }))} placeholder="Elegí un canal" />{!channelAvailable&&<p id={`${channelId}-error`} className={styles.MessagingConnectionResources__error} role="alert">{MESSAGING_RESOURCE_UI_COPY.channelUnavailable}</p>}</div>
      <fieldset className={styles.MessagingConnectionResources__group} disabled={props.busy&&reading===null}>
        <legend className={styles.MessagingConnectionResources__subtitle}>Remitente</legend>
        <div className={styles.MessagingConnectionResources__actions}><Button className={styles.MessagingConnectionResources__action} variant="secondary" size="sm" {...readControl("senders",channelAvailable)} onClick={props.onReadSenders}>Consultar remitentes</Button>{props.senders.nextCursor&&<Button className={styles.MessagingConnectionResources__action} variant="ghost" size="sm" {...readControl("moreSenders",channelAvailable)} onClick={props.onMoreSenders}>Ver más remitentes</Button>}</div>
        <div className={styles.MessagingConnectionResources__field}><Select value={senders.some((sender)=>sender.id===props.senderId)?props.senderId:""} disabled={props.busy||senders.length===0} onValueChange={props.onSenderChange} id={`${senderId}-choice`} label="Remitente del canal" options={senders.map((sender) => ({ value: sender.id, label: `${sender.label || sender.id}${sender.readiness !== MESSAGING_RESOURCE_READINESS.ready ? " · Requiere preparación" : ""}` }))} placeholder={senderPlaceholder} error={sendersList.status==="failed"?sendersList.message:undefined} aria-describedby={sendersNote?`${senderId}-empty`:undefined} />{sendersNote&&<p id={`${senderId}-empty`} className={styles.MessagingConnectionResources__note} role="status">{sendersNote}</p>}</div>
        <Input id={senderId} label="Identificador del remitente" description="Completalo al elegir un remitente o ingresalo a mano; el guardado lo comprueba." error={props.fieldErrors.senderId} value={props.senderId} disabled={props.busy} onChange={(event)=>props.onSenderChange(event.target.value)} />
      </fieldset>
      {whatsapp&&<fieldset className={styles.MessagingConnectionResources__group} disabled={props.busy&&reading===null}>
        <legend className={styles.MessagingConnectionResources__subtitle}>Plantilla de WhatsApp</legend>
        <p className={styles.MessagingConnectionResources__note}>WhatsApp requiere una plantilla de autenticación aprobada y su idioma exacto. Preparala en Zavu antes de guardar; TuTribu no conecta Meta ni crea plantillas.</p>
        <div className={styles.MessagingConnectionResources__actions}><Button className={styles.MessagingConnectionResources__action} variant="secondary" size="sm" {...readControl("templates")} onClick={props.onReadTemplates}>Consultar plantillas</Button>{props.templates.nextCursor&&<Button className={styles.MessagingConnectionResources__action} variant="ghost" size="sm" {...readControl("moreTemplates")} onClick={props.onMoreTemplates}>Ver más plantillas</Button>}</div>
        <div className={styles.MessagingConnectionResources__field}><Select value={props.templates.items.some((template)=>template.id===props.templateId)?props.templateId:""} disabled={props.busy||props.templates.items.length===0} onValueChange={props.onTemplateChange} id={`${templateId}-choice`} label="Plantilla de autenticación" options={props.templates.items.map((template) => ({ value: template.id, label: `${template.label || template.id}${template.language ? ` · ${template.language}` : ""}${template.readiness !== MESSAGING_RESOURCE_READINESS.ready ? " · Requiere preparación" : ""}` }))} placeholder={templatePlaceholder} error={templatesList.status==="failed"?templatesList.message:undefined} aria-describedby={templatesNote?`${templateId}-empty`:undefined} />{templatesNote&&<p id={`${templateId}-empty`} className={styles.MessagingConnectionResources__note} role="status">{templatesNote}</p>}</div>
        <Input id={templateId} label="Identificador de plantilla" description={undefined} error={props.fieldErrors.templateId} value={props.templateId} disabled={props.busy} onChange={(event)=>props.onTemplateChange(event.target.value)} />
        <Input id={languageId} label="Idioma de la plantilla" description={undefined} error={props.fieldErrors.templateLanguage} value={props.templateLanguage} disabled={props.busy} onChange={(event)=>props.onTemplateLanguageChange(event.target.value)} />
      </fieldset>}
      {props.message&&<p className={styles.MessagingConnectionResources__feedback} role={props.message.kind}>{props.message.text}</p>}
      <Checkbox id={`${fieldId}-confirmation`} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onConfirmationChange(checked===true)} label="Revisé el canal y sus recursos y quiero guardar esta configuración." />
      <div className={styles.MessagingConnectionResources__actions}><Button className={styles.MessagingConnectionResources__action} variant="primary" loading={props.saving} disabled={!props.saving&&(props.busy||!props.canSave||!channelAvailable)} onClick={()=>{if(!props.busy&&props.canSave&&channelAvailable)props.onSave();}}>Guardar configuración del canal</Button></div>
    </div>
  </section>;
}
