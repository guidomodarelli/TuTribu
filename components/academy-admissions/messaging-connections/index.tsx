"use client";
/** Presents safe current connection metadata and controlled credential entry without auth, transport or storage ownership. @module messaging-connections-presenter */
import {useId} from "react";
import {Button,Checkbox,Input,Label} from "beez-ui";
import type {MessagingConfigurationResult,MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {MESSAGING_CONNECTION_LABEL,MESSAGING_CREDENTIAL_LABEL,MESSAGING_CREDENTIAL_MODE_LABEL,MESSAGING_CAPABILITY_LABEL,MESSAGING_CHANNEL_LABEL,MESSAGING_OPERATIONAL_ALERT_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import styles from "./styles.module.scss";

/** The route container owns ephemeral key state, validation, consent, mutations and any reauthentication. */
export type MessagingConnectionsProps={configuration:MessagingConfigurationResult;name:string;apiKey:string;confirmed:boolean;busy:boolean;canSave:boolean;canReauthenticate:boolean;fieldErrors:Partial<Record<"name"|"apiKey"|"confirmation",string>>;message:{kind:"status"|"alert";text:string}|null;onNameChange:(value:string)=>void;onApiKeyChange:(value:string)=>void;onConfirmationChange:(confirmed:boolean)=>void;onSave:()=>void;onReauthenticate:()=>void};

/** @param props - Own minimal metadata with no provider/admin/credential bytes. @returns Distinct lifecycle, production and channel facts with semantic headings. */
function ConnectionSummary({connection,title}:{connection:MessagingConfigurationConnection;title:string}){
  return<section className={styles.MessagingConnections__summary} aria-label={title}><h3 className={styles.MessagingConnections__subtitle}>{title}</h3><p className={styles.MessagingConnections__name}>{connection.name}</p><dl className={styles.MessagingConnections__facts}><div><dt>Estado</dt><dd>{MESSAGING_CONNECTION_LABEL[connection.state]}</dd></div><div><dt>Credencial</dt><dd>{MESSAGING_CREDENTIAL_LABEL[connection.credentialState]}</dd></div><div><dt>Cuenta</dt><dd>{MESSAGING_CREDENTIAL_MODE_LABEL[connection.credentialMode]}</dd></div><div><dt>Configuración</dt><dd>{connection.configurationVersion}</dd></div></dl>{connection.capabilities.length>0&&<ul className={styles.MessagingConnections__channels}>{connection.capabilities.map((capability)=><li key={capability.channel}>{MESSAGING_CHANNEL_LABEL[capability.channel]}: {MESSAGING_CAPABILITY_LABEL[capability.state]}</li>)}</ul>}</section>;
}

/** @param props - Current own audience/view state and explicit callbacks. @returns Controlled first connection step; no automatic save, fetch, provider or browser persistence occurs. */
export function MessagingConnections(props:MessagingConnectionsProps){
  const fieldId=useId(),nameId=`${fieldId}-name`,keyId=`${fieldId}-key`,confirmationId=`${fieldId}-confirmation`;
  if(props.configuration.audience===TRIBE_MEMBER_ROLE.guardian)return<section className={styles.MessagingConnections} aria-label="Estado de mensajería"><h2 className={styles.MessagingConnections__title}>Conexión de mensajería</h2><p role="status">{MESSAGING_OPERATIONAL_ALERT_LABEL[props.configuration.operationalAlert]}</p></section>;
  return<section className={styles.MessagingConnections} aria-labelledby={`${fieldId}-title`}>
    <h2 id={`${fieldId}-title`} className={styles.MessagingConnections__title}>Conexión de mensajería</h2>
    <p className={styles.MessagingConnections__intro}>Prepará la conexión de Zavu que usará tu academia. Guardarla crea una candidata; después podrás comprobar la credencial y los canales antes de activarla.</p>
    {props.configuration.selected&&<ConnectionSummary connection={props.configuration.selected} title="Conexión seleccionada" />}
    {props.configuration.candidate&&<ConnectionSummary connection={props.configuration.candidate} title="Conexión candidata" />}
    {props.message&&<p className={styles.MessagingConnections__feedback} role={props.message.kind} aria-live={props.message.kind==="alert"?"assertive":"polite"}>{props.message.text}</p>}
    {!props.configuration.candidate&&<form className={styles.MessagingConnections__form} aria-label="Guardar conexión candidata" onSubmit={(event)=>{event.preventDefault();props.onSave();}}>
      <div className={styles.MessagingConnections__field}><Label htmlFor={nameId}>Nombre de la conexión</Label><Input id={nameId} value={props.name} disabled={props.busy} onChange={(event)=>props.onNameChange(event.target.value)} aria-invalid={Boolean(props.fieldErrors.name)} aria-describedby={props.fieldErrors.name?`${nameId}-error`:undefined} placeholder="Mensajería de mi academia" />{props.fieldErrors.name&&<p id={`${nameId}-error`} className={styles.MessagingConnections__error}>{props.fieldErrors.name}</p>}</div>
      <div className={styles.MessagingConnections__field}><Label htmlFor={keyId}>Clave de Zavu</Label><Input id={keyId} type="password" autoComplete="off" spellCheck={false} value={props.apiKey} disabled={props.busy} onChange={(event)=>props.onApiKeyChange(event.target.value)} aria-invalid={Boolean(props.fieldErrors.apiKey)} aria-describedby={props.fieldErrors.apiKey?`${keyId}-error`:undefined} />{props.fieldErrors.apiKey&&<p id={`${keyId}-error`} className={styles.MessagingConnections__error}>{props.fieldErrors.apiKey}</p>}</div>
      <div className={styles.MessagingConnections__consent}><Checkbox id={confirmationId} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onConfirmationChange(checked===true)} aria-invalid={Boolean(props.fieldErrors.confirmation)} aria-describedby={props.fieldErrors.confirmation?`${confirmationId}-error`:undefined} /><Label htmlFor={confirmationId}>Confirmo que quiero guardar esta credencial para la academia.</Label></div>
      {props.fieldErrors.confirmation&&<p id={`${confirmationId}-error`} className={styles.MessagingConnections__error}>{props.fieldErrors.confirmation}</p>}
      <div className={styles.MessagingConnections__actions}><Button type="button" variant="outline" disabled={!props.canReauthenticate||props.busy} onClick={props.onReauthenticate}>Confirmar con Google</Button><Button type="submit" disabled={!props.canSave||props.busy}>Guardar conexión</Button></div>
    </form>}
  </section>;
}
