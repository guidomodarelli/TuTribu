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

/** Own references are proposals; the server confirms detail before committing any effective version. */
export type MessagingConnectionResourcesProps={
  /** `busy` covers every read and write; `saving` marks only the pressed configuration save. */
  channel:MessagingProviderChannel;availableChannels:readonly MessagingProviderChannel[];senderId:string;templateId:string;templateLanguage:string;confirmed:boolean;busy:boolean;saving?:boolean;canSave:boolean;
  senders:Pick<MessagingResourcePageResult,"items"|"nextCursor">;templates:Pick<MessagingResourcePageResult,"items"|"nextCursor">;
  fieldErrors:Partial<Record<"senderId"|"templateId"|"templateLanguage",string>>;message:{kind:"status"|"alert";text:string}|null;
  onChannelChange:(channel:MessagingConnectionResourcesProps["channel"])=>void;onSenderChange:(value:string)=>void;onTemplateChange:(value:string)=>void;onTemplateLanguageChange:(value:string)=>void;onConfirmationChange:(confirmed:boolean)=>void;
  onReadSenders:()=>void;onReadTemplates:()=>void;onMoreSenders:()=>void;onMoreTemplates:()=>void;onSave:()=>void;
};

/** @param props - Controlled own resource pages and explicit action callbacks. @returns Only fields required by the selected channel; no choice is selected automatically. */
export function MessagingConnectionResources(props:MessagingConnectionResourcesProps){
  const fieldId=useId(),senderId=`${fieldId}-sender`,templateId=`${fieldId}-template`,languageId=`${fieldId}-language`,channelId=`${fieldId}-channel`;
  const channelAvailable=props.availableChannels.includes(props.channel),whatsapp=channelAvailable&&props.channel===MESSAGING_PUBLIC_CHANNEL.whatsapp,senders=channelAvailable?props.senders.items.filter((sender)=>sender.channels.includes(props.channel)):[];
  return<section className={styles.MessagingConnectionResources} aria-labelledby={`${fieldId}-title`}>
    <h2 id={`${fieldId}-title`} className={styles.MessagingConnectionResources__title}>Preparar un canal</h2>
    <p className={styles.MessagingConnectionResources__lead}>Elegí recursos que ya existen en Zavu. El guardado comprueba el recurso y crea una nueva versión de la configuración, que después necesita sus pruebas. No envía mensajes.</p>
    <form className={styles.MessagingConnectionResources__form} aria-busy={props.busy} onSubmit={(event)=>{event.preventDefault();if(!props.busy&&props.canSave&&channelAvailable)props.onSave();}}>
      <div className={styles.MessagingConnectionResources__field}><Select value={channelAvailable?props.channel:""} disabled={props.busy||props.availableChannels.length===0} onValueChange={(value)=>{const channel=props.availableChannels.find((candidate)=>candidate===value);if(channel)props.onChannelChange(channel);}} id={channelId} aria-invalid={!channelAvailable} aria-describedby={channelAvailable?undefined:`${channelId}-error`} label="Canal que querés preparar" options={props.availableChannels.map((channel) => ({ value: channel, label: MESSAGING_CHANNEL_LABEL[channel] }))} placeholder="Elegí un canal" />{!channelAvailable&&<p id={`${channelId}-error`} className={styles.MessagingConnectionResources__error} role="alert">{MESSAGING_RESOURCE_UI_COPY.channelUnavailable}</p>}</div>
      <fieldset className={styles.MessagingConnectionResources__group} disabled={props.busy}>
        <legend className={styles.MessagingConnectionResources__subtitle}>Remitente</legend>
        <div className={styles.MessagingConnectionResources__actions}><Button className={styles.MessagingConnectionResources__action} variant="secondary" size="sm" disabled={props.busy||!channelAvailable} onClick={props.onReadSenders}>Consultar remitentes</Button>{props.senders.nextCursor&&<Button className={styles.MessagingConnectionResources__action} variant="ghost" size="sm" disabled={props.busy||!channelAvailable} onClick={props.onMoreSenders}>Ver más remitentes</Button>}</div>
        <div className={styles.MessagingConnectionResources__field}><Select value={senders.some((sender)=>sender.id===props.senderId)?props.senderId:""} disabled={props.busy||senders.length===0} onValueChange={props.onSenderChange} id={`${senderId}-choice`} label="Remitente del canal" options={senders.map((sender) => ({ value: sender.id, label: `${sender.label || sender.id}${sender.readiness !== MESSAGING_RESOURCE_READINESS.ready ? " · Requiere preparación" : ""}` }))} placeholder={senders.length===0?"Consultá los remitentes primero":"Elegí un remitente"} /></div>
        <Input id={senderId} label="Identificador del remitente" description="Completalo al elegir un remitente o ingresalo a mano; el guardado lo comprueba." error={props.fieldErrors.senderId} value={props.senderId} disabled={props.busy} onChange={(event)=>props.onSenderChange(event.target.value)} />
      </fieldset>
      {whatsapp&&<fieldset className={styles.MessagingConnectionResources__group} disabled={props.busy}>
        <legend className={styles.MessagingConnectionResources__subtitle}>Plantilla de WhatsApp</legend>
        <p className={styles.MessagingConnectionResources__note}>WhatsApp requiere una plantilla de autenticación aprobada y su idioma exacto. Preparala en Zavu antes de guardar; TuTribu no conecta Meta ni crea plantillas.</p>
        <div className={styles.MessagingConnectionResources__actions}><Button className={styles.MessagingConnectionResources__action} variant="secondary" size="sm" disabled={props.busy} onClick={props.onReadTemplates}>Consultar plantillas</Button>{props.templates.nextCursor&&<Button className={styles.MessagingConnectionResources__action} variant="ghost" size="sm" disabled={props.busy} onClick={props.onMoreTemplates}>Ver más plantillas</Button>}</div>
        <div className={styles.MessagingConnectionResources__field}><Select value={props.templates.items.some((template)=>template.id===props.templateId)?props.templateId:""} disabled={props.busy||props.templates.items.length===0} onValueChange={props.onTemplateChange} id={`${templateId}-choice`} label="Plantilla de autenticación" options={props.templates.items.map((template) => ({ value: template.id, label: `${template.label || template.id}${template.language ? ` · ${template.language}` : ""}${template.readiness !== MESSAGING_RESOURCE_READINESS.ready ? " · Requiere preparación" : ""}` }))} placeholder={props.templates.items.length===0?"Consultá las plantillas primero":"Elegí una plantilla"} /></div>
        <Input id={templateId} label="Identificador de plantilla" description={undefined} error={props.fieldErrors.templateId} value={props.templateId} disabled={props.busy} onChange={(event)=>props.onTemplateChange(event.target.value)} />
        <Input id={languageId} label="Idioma de la plantilla" description={undefined} error={props.fieldErrors.templateLanguage} value={props.templateLanguage} disabled={props.busy} onChange={(event)=>props.onTemplateLanguageChange(event.target.value)} />
      </fieldset>}
      {props.message&&<p className={styles.MessagingConnectionResources__feedback} role={props.message.kind}>{props.message.text}</p>}
      <Checkbox id={`${fieldId}-confirmation`} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onConfirmationChange(checked===true)} label="Revisé el canal y sus recursos y quiero guardar esta configuración." />
      <div className={styles.MessagingConnectionResources__actions}><Button className={styles.MessagingConnectionResources__action} type="submit" variant="primary" loading={props.saving} disabled={!props.saving&&(props.busy||!props.canSave||!channelAvailable)}>Guardar configuración del canal</Button></div>
    </form>
  </section>;
}
