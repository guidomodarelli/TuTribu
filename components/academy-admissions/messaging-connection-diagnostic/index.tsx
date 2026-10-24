"use client";
/** Presents the Tests step: the current issued test first, then explicit scoped input for a new one, without session, HTTP, provider or polling ownership. @module messaging-connection-diagnostic */
import {useId} from "react";
import {Badge,Button,Checkbox,Input,Select} from "@golfo/ui";
import {Link} from "@/components/navigation/link";
import type {ConnectionDiagnosticIssueResult} from "@/src/modules/messaging/domain/repositories/connection-diagnostic-issuance";
import type {MessagingUsagePolicyStateDto} from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import type {z} from "zod";
import type {messageDeliverySchema} from "@/src/modules/messaging/application/results/messaging-flow-result-schemas";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {MESSAGING_DELIVERY_STATE_LABEL,MESSAGING_DIAGNOSTIC_RESEND_BLOCK,type MessagingDiagnosticResendBlock} from "@/src/modules/messaging/constants/messaging-diagnostic-browser";
import {MESSAGING_CHANNEL_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import {SECONDS_PER_MINUTE} from "@/src/constants/time";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";
import styles from "./styles.module.scss";

/** Controlled destination/code never belong in durable browser metadata; the route owns authority and lifecycle. `verified` is true only for this exact issued diagnostic. */
/** `busy` covers every read and write; `issuing`, `resending` and `verifying` mark only the pressed write. */
export type MessagingConnectionDiagnosticProps={channel:typeof MESSAGING_PUBLIC_CHANNEL[keyof typeof MESSAGING_PUBLIC_CHANNEL];recipient:string;country:string;verificationCode:string;confirmed:boolean;busy:boolean;issuing?:boolean;resending?:boolean;verifying?:boolean;canIssue:boolean;canVerify:boolean;canResend?:boolean;verified?:boolean;expiresInSeconds?:number|null;resendInSeconds?:number|null;/** What the resend still needs, shown beside its button. */resendBlock?:MessagingDiagnosticResendBlock|null;allowedCountries:readonly string[];usage:MessagingUsagePolicyStateDto;diagnostic:Extract<ConnectionDiagnosticIssueResult,{outcome:"issued"}>|null;delivery:z.infer<typeof messageDeliverySchema>|null;fieldErrors:Partial<Record<"recipient"|"country"|"verificationCode",string>>;usageHref?:string;onChannelChange:(channel:MessagingConnectionDiagnosticProps["channel"])=>void;onRecipientChange:(value:string)=>void;onCountryChange:(value:string)=>void;onCodeChange:(value:string)=>void;/** A guided test step fixes its channel, so the channel choice is hidden. */channelLocked?:boolean;onConfirm:(confirmed:boolean)=>void;onIssue:()=>void;onResend:()=>void;onVerify:()=>void;onReadDelivery:()=>void};

/** Seconds always read with two digits after the minutes. */
const SECONDS_DIGITS=2;
/** @param seconds - Remaining whole seconds. @returns A short minutes/seconds reading, such as "3:07". */
const formatRemaining=(seconds:number)=>`${Math.floor(seconds/SECONDS_PER_MINUTE)}:${String(seconds%SECONDS_PER_MINUTE).padStart(SECONDS_DIGITS,"0")}`;

/** @param props - Own controlled form and readonly current metadata. @returns Explicit sending/verification actions with private controls excluded from feedback screenshots; render and field changes never issue a message. */
export function MessagingConnectionDiagnostic(props:MessagingConnectionDiagnosticProps){
  const fieldId=useId(),phone=props.channel!==MESSAGING_PUBLIC_CHANNEL.email,phoneBlocked=phone&&props.allowedCountries.length===0,diagnostic=props.diagnostic,verified=Boolean(diagnostic&&props.verified),awaitingCode=Boolean(diagnostic&&!props.verified);
  const expired=props.expiresInSeconds===0;
  return<section className={styles.MessagingConnectionDiagnostic} aria-labelledby={`${fieldId}-title`} data-beezping-ignore="true">
    <h2 id={`${fieldId}-title`} className={styles.MessagingConnectionDiagnostic__title}>Probar el canal de la candidata</h2>
    <p className={styles.MessagingConnectionDiagnostic__lead}>El envío de la prueba consume un código del cupo de la academia y puede generar un cargo en el proyecto de Zavu de esta conexión. Guardar o comprobar la clave no envía esta prueba.</p>
    {props.usage.policy&&<p className={styles.MessagingConnectionDiagnostic__note}>Hoy: {props.usage.policy.consumption.verificationToday} de {props.usage.policy.verificationDailyLimit} códigos usados. Cada intento conserva su consumo aunque no se confirme la entrega.</p>}
    {diagnostic&&<section className={`${styles.MessagingConnectionDiagnostic__current} ${verified?styles["MessagingConnectionDiagnostic__current--verified"]:""}`} aria-label={verified?"Prueba confirmada":"Código de prueba emitido"}>
      <div className={styles.MessagingConnectionDiagnostic__currentHeader}>
        <h3 className={styles.MessagingConnectionDiagnostic__subtitle}>{verified?"Prueba confirmada":"Prueba en curso"}</h3>
        {verified?<Badge tone="success">Código confirmado</Badge>:expired?<Badge tone="warning">Código vencido</Badge>:<Badge tone="info">Esperando el código</Badge>}
      </div>
      <p className={styles.MessagingConnectionDiagnostic__lead}>{MESSAGING_CHANNEL_LABEL[diagnostic.channel]} · configuración {diagnostic.connectionVersion} · destino {diagnostic.maskedDestination}</p>
      {verified?<p className={styles.MessagingConnectionDiagnostic__note}>El código recibido quedó confirmado para este canal y configuración. No habilita producción ni concede admisión.</p>:<>
        {props.expiresInSeconds!==undefined&&props.expiresInSeconds!==null&&<p className={styles.MessagingConnectionDiagnostic__note}>{props.expiresInSeconds>0?`El código vence en ${formatRemaining(props.expiresInSeconds)}.`:"El código de esta prueba venció. Podés reenviar uno nuevo."}</p>}
        <p className={styles.MessagingConnectionDiagnostic__note}>La entrega no confirma que recibiste el código. Ingresá el código recibido para probar este canal; no verifica una admisión ni inicia sesión.</p>
      </>}
      {props.delivery&&<p className={styles.MessagingConnectionDiagnostic__note}>Entrega: <span role="status">{MESSAGING_DELIVERY_STATE_LABEL[props.delivery.state]}</span></p>}
      {awaitingCode&&<div className={styles.MessagingConnectionDiagnostic__form} role="group" aria-label="Confirmar el código recibido">
        <Input id={`${fieldId}-code`} label="Código recibido" description={undefined} error={props.fieldErrors.verificationCode} inputMode="numeric" autoComplete="one-time-code" maxLength={ADMISSION_LIMIT.verificationCodeDigits} value={props.verificationCode} disabled={props.busy||expired} onChange={(event)=>props.onCodeChange(event.target.value)} />
        <div className={styles.MessagingConnectionDiagnostic__actions}>
          <Button className={styles.MessagingConnectionDiagnostic__action} variant={expired?"secondary":"primary"} loading={props.verifying} disabled={!props.verifying&&(props.busy||!props.canVerify)} onClick={props.onVerify}>Confirmar código recibido</Button>
          <Button className={styles.MessagingConnectionDiagnostic__action} variant="secondary" disabled={props.busy} onClick={props.onReadDelivery}>Consultar entrega de la prueba</Button>
          {/* An expired code leaves the resend as the only way forward, so it becomes the primary action. */}
          <Button className={styles.MessagingConnectionDiagnostic__action} variant={expired?"primary":"ghost"} loading={props.resending} disabled={!props.resending&&(props.busy||!props.canResend)} aria-describedby={props.resendBlock?`${fieldId}-resend-block`:undefined} onClick={props.onResend}>Reenviar código de prueba</Button>
        </div>
        {props.resendBlock&&<div className={styles.MessagingConnectionDiagnostic__resendBlock}>
          <p id={`${fieldId}-resend-block`} className={styles.MessagingConnectionDiagnostic__note}>{props.resendBlock===MESSAGING_DIAGNOSTIC_RESEND_BLOCK.wait?`Podés reenviar en ${formatRemaining(props.resendInSeconds??0)}. Después, completá otra vez el destino y confirmá el consumo más abajo.`:props.resendBlock===MESSAGING_DIAGNOSTIC_RESEND_BLOCK.destination?"Para reenviar, escribí otra vez el destino de la prueba más abajo y confirmá el consumo. Por seguridad, el destino no se conserva después de cada envío.":props.resendBlock===MESSAGING_DIAGNOSTIC_RESEND_BLOCK.consent?"Para reenviar, confirmá el destino y el consumo más abajo.":"Para reenviar este código, elegí el mismo canal de la prueba en curso."}</p>
          {(props.resendBlock===MESSAGING_DIAGNOSTIC_RESEND_BLOCK.destination||props.resendBlock===MESSAGING_DIAGNOSTIC_RESEND_BLOCK.consent)&&<Button variant="ghost" size="sm" disabled={props.busy} onClick={()=>document.getElementById(props.resendBlock===MESSAGING_DIAGNOSTIC_RESEND_BLOCK.destination?`${fieldId}-recipient`:`${fieldId}-consent`)?.focus()}>{props.resendBlock===MESSAGING_DIAGNOSTIC_RESEND_BLOCK.destination?"Completar el destino":"Ir a la confirmación"}</Button>}
        </div>}
      </div>}
      {verified&&<div className={styles.MessagingConnectionDiagnostic__actions}><Button className={styles.MessagingConnectionDiagnostic__action} variant="secondary" size="sm" disabled={props.busy} onClick={props.onReadDelivery}>Consultar entrega de la prueba</Button></div>}
    </section>}
    <div className={styles.MessagingConnectionDiagnostic__form} role="group" aria-busy={props.busy} aria-label={diagnostic?undefined:"Enviar un código de prueba"} aria-labelledby={diagnostic?`${fieldId}-new`:undefined}>
      {diagnostic&&<h3 id={`${fieldId}-new`} className={styles.MessagingConnectionDiagnostic__subtitle}>{awaitingCode?"Destino para reenviar o probar otro canal":"Nueva prueba"}</h3>}
      {!props.channelLocked&&<div className={styles.MessagingConnectionDiagnostic__field}><Select value={props.channel} disabled={props.busy} onValueChange={(value)=>{const channel=Object.values(MESSAGING_PUBLIC_CHANNEL).find((candidate)=>candidate===value);if(channel)props.onChannelChange(channel);}} id={`${fieldId}-channel`} label="Canal de la prueba" options={Object.values(MESSAGING_PUBLIC_CHANNEL).map((channel) => ({ value: channel, label: MESSAGING_CHANNEL_LABEL[channel] }))} /></div>}
      {phone&&<div className={styles.MessagingConnectionDiagnostic__field}><Select value={props.country} disabled={props.busy||phoneBlocked} onValueChange={props.onCountryChange} id={`${fieldId}-country`} aria-invalid={Boolean(props.fieldErrors.country)} aria-describedby={props.fieldErrors.country?`${fieldId}-country-error`:undefined} label="País guardado del teléfono" options={props.allowedCountries.map((country) => ({ value: country, label: country }))} placeholder="Elegí un país guardado" />{props.fieldErrors.country&&<p id={`${fieldId}-country-error`} className={styles.MessagingConnectionDiagnostic__error}>{props.fieldErrors.country}</p>}{phoneBlocked&&<p className={styles.MessagingConnectionDiagnostic__note}>Guardá los países de mensajería antes de solicitar una prueba telefónica.{props.usageHref&&<> <Link href={props.usageHref}>Preparar países y cupos</Link></>}</p>}</div>}
      <Input id={`${fieldId}-recipient`} label="Destino de la prueba" description={phone?"Teléfono que va a recibir el código.":"Correo que va a recibir el código."} error={props.fieldErrors.recipient} type={phone?"tel":"email"} autoComplete="off" value={props.recipient} disabled={props.busy} onChange={(event)=>props.onRecipientChange(event.target.value)} />
      <Checkbox id={`${fieldId}-consent`} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onConfirm(checked===true)} label="Confirmo el destino y el consumo para enviar un código de prueba." />
      <div className={styles.MessagingConnectionDiagnostic__actions}><Button className={styles.MessagingConnectionDiagnostic__action} variant={awaitingCode?"secondary":"primary"} loading={props.issuing} disabled={!props.issuing&&(props.busy||phoneBlocked||!props.canIssue)} onClick={props.onIssue}>Enviar código de prueba</Button></div>
    </div>
  </section>;
}
