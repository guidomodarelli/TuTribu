"use client";
/** Presents explicit original continuation without owning transport, credentials, storage or authority. @module messaging-original-recovery */
import {useId} from "react";
import {Button,Checkbox,Label} from "beez-ui";
import {MESSAGING_CONNECTION_RECOVERY_UI_COPY} from "@/src/modules/messaging/constants/messaging-connections-browser";
import styles from "./styles.module.scss";

/** The container must prove an original/current read and supply guarded resumable metadata. */
export type MessagingOriginalRecoveryProps={requiresKey:boolean;resumable:boolean;confirmed:boolean;archiveConfirmed:boolean;busy:boolean;canResume:boolean;onConfirm:(confirmed:boolean)=>void;onArchiveConfirm:(confirmed:boolean)=>void;onResume:()=>void;onArchive:()=>void;onReauthenticate:()=>void};
/** @param props - Explicit controlled consent and route-owned actions. @returns A separate continuation that never invents rollback or starts a retry automatically. */
export function MessagingOriginalRecovery(props:MessagingOriginalRecoveryProps){
  const fieldId=useId();
  return<section className={styles.MessagingOriginalRecovery} aria-label="Reanudar operación original">
    <p className={styles.MessagingOriginalRecovery__explanation}>{props.resumable?MESSAGING_CONNECTION_RECOVERY_UI_COPY.originalUnconfirmed:MESSAGING_CONNECTION_RECOVERY_UI_COPY.originalMissing}</p>
    {props.requiresKey&&<p className={styles.MessagingOriginalRecovery__explanation}>{MESSAGING_CONNECTION_RECOVERY_UI_COPY.keyAgain}</p>}
    {props.resumable&&<><div className={styles.MessagingOriginalRecovery__confirmation}><Checkbox id={fieldId} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onConfirm(checked===true)} /><Label htmlFor={fieldId}>Confirmo reanudar la operación original con los mismos datos.</Label></div><div className={styles.MessagingOriginalRecovery__actions}><Button className={styles.MessagingOriginalRecovery__action} type="button" variant="outline" disabled={props.busy||!props.canResume} onClick={props.onResume}>Reanudar operación original</Button><Button className={styles.MessagingOriginalRecovery__action} type="button" variant="outline" disabled={props.busy} onClick={props.onReauthenticate}>Confirmar recuperación con Google</Button></div></>}
    <p className={styles.MessagingOriginalRecovery__explanation}>{MESSAGING_CONNECTION_RECOVERY_UI_COPY.archiveExplanation}</p>
    <div className={styles.MessagingOriginalRecovery__confirmation}><Checkbox id={`${fieldId}-archive`} checked={props.archiveConfirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onArchiveConfirm(checked===true)} /><Label htmlFor={`${fieldId}-archive`}>Entiendo que dejar de seguir este intento no lo cancela ni revierte sus efectos.</Label></div>
    <Button className={styles.MessagingOriginalRecovery__action} type="button" variant="outline" disabled={props.busy||!props.archiveConfirmed} onClick={props.onArchive}>Conservar en historial y continuar</Button>
  </section>;
}
