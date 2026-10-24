"use client";
/** Presents the Connection step: controlled credential entry or the candidate credential check, without auth, transport or storage ownership. @module messaging-connections-presenter */
import {useId} from "react";
import {Button,Checkbox,Input} from "@golfo/ui";
import type {MessagingConfigurationResult} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {MESSAGING_OPERATIONAL_ALERT_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import {TRIBE_MEMBER_ROLE} from "@/src/modules/tribes/constants/tribe-member-role";
import {ADMISSION_LIMIT} from "@/src/modules/academy-admissions/constants/admission-limits";
import {MESSAGING_KEY_REPLACEMENT_COPY as REPLACEMENT_COPY} from "@/src/modules/messaging/constants/messaging-lifecycle-browser";
import styles from "./styles.module.scss";

/** The route container owns ephemeral key state, validation, consent, mutations and feedback. `onReplaceKey` appears only while the candidate credential is not proven and opens the Clave step that retires it. `focusKey` focuses the key field when the form replaces the retired candidate, so focus does not fall back to the page. `busy` covers every read and write; `saving` and `validating` mark only the pressed write. */
export type MessagingConnectionsProps={configuration:MessagingConfigurationResult;name:string;apiKey:string;confirmed:boolean;busy:boolean;saving?:boolean;validating?:boolean;canSave:boolean;validationConfirmed:boolean;canValidate:boolean;fieldErrors:Partial<Record<"name"|"apiKey"|"confirmation",string>>;onNameChange:(value:string)=>void;onApiKeyChange:(value:string)=>void;onConfirmationChange:(confirmed:boolean)=>void;onValidationConfirmationChange:(confirmed:boolean)=>void;onValidate:()=>void;onSave:()=>void;onReplaceKey?:()=>void;focusKey?:boolean};

/** @param props - Current own audience/view state and explicit callbacks. @returns The guardian's operational status, or the leader's credential fields grouped for one guided step (the flow owns the only form); no automatic save, fetch, provider or browser persistence occurs. */
export function MessagingConnections(props:MessagingConnectionsProps){
  const fieldId=useId(),titleId=`${fieldId}-title`,confirmationId=`${fieldId}-confirmation`;
  if(props.configuration.audience===TRIBE_MEMBER_ROLE.guardian)return<section className={styles.MessagingConnections} aria-label="Estado de mensajería"><p className={styles.MessagingConnections__lead} role="status">{MESSAGING_OPERATIONAL_ALERT_LABEL[props.configuration.operationalAlert]}</p></section>;
  if(props.configuration.candidate)return<section className={styles.MessagingConnections} aria-labelledby={titleId} data-beezping-ignore="true">
    <h2 id={titleId} className={styles.MessagingConnections__title}>Comprobar la credencial</h2>
    <p className={styles.MessagingConnections__lead}>Consulta el acceso y el tipo de cuenta en Zavu. No envía mensajes, no prueba canales ni activa producción.</p>
    <div className={styles.MessagingConnections__form} role="group" aria-label="Comprobar credencial candidata">
      <Checkbox id={`${fieldId}-validation`} checked={props.validationConfirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onValidationConfirmationChange(checked===true)} label="Confirmo que quiero comprobar la credencial de esta candidata." />
      <div className={styles.MessagingConnections__actions}><Button className={styles.MessagingConnections__action} variant="primary" loading={props.validating} disabled={!props.validating&&(!props.canValidate||props.busy)} onClick={props.onValidate}>Comprobar credencial</Button>{props.onReplaceKey&&<Button className={styles.MessagingConnections__action} variant="secondary" disabled={props.busy} onClick={props.onReplaceKey}>{REPLACEMENT_COPY.credentialAction}</Button>}</div>
    </div>
  </section>;
  return<section className={styles.MessagingConnections} aria-labelledby={titleId} data-beezping-ignore="true">
    <h2 id={titleId} className={styles.MessagingConnections__title}>Conectar Zavu</h2>
    <p className={styles.MessagingConnections__lead}>Se guarda como conexión candidata. Después vas a comprobar la credencial y los canales antes de activarla.</p>
    <div className={styles.MessagingConnections__form} role="group" aria-label="Guardar conexión candidata">
      <Input id={`${fieldId}-name`} label="Nombre de la conexión" description={undefined} error={props.fieldErrors.name} value={props.name} disabled={props.busy} onChange={(event)=>props.onNameChange(event.target.value)} placeholder="Mensajería de mi academia" maxLength={ADMISSION_LIMIT.displayNameCharacters} />
      <Input id={`${fieldId}-key`} autoFocus={props.focusKey} label="Clave de Zavu" description="No se muestra ni se guarda en el navegador." error={props.fieldErrors.apiKey} type="password" autoComplete="off" spellCheck={false} value={props.apiKey} disabled={props.busy} onChange={(event)=>props.onApiKeyChange(event.target.value)} />
      <div className={styles.MessagingConnections__consent}>
        <Checkbox id={confirmationId} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onConfirmationChange(checked===true)} aria-invalid={Boolean(props.fieldErrors.confirmation)} aria-describedby={props.fieldErrors.confirmation?`${confirmationId}-error`:undefined} label="Confirmo que quiero guardar esta credencial para la academia." />
        {props.fieldErrors.confirmation&&<p id={`${confirmationId}-error`} className={styles.MessagingConnections__error}>{props.fieldErrors.confirmation}</p>}
      </div>
      <div className={styles.MessagingConnections__actions}><Button className={styles.MessagingConnections__action} variant="primary" loading={props.saving} disabled={!props.saving&&(!props.canSave||props.busy)} onClick={props.onSave}>Guardar conexión</Button></div>
    </div>
  </section>;
}
