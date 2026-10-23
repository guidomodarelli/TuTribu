/** Presents explicit local connection safety/retirement controls without auth, transport or storage ownership. @module messaging-connection-lifecycle */
import { useId } from "react";
import { Button, Checkbox, Label, Select } from "@golfo/ui";
import type { MessagingConnectionSuspensionInput } from "@/src/modules/messaging/domain/repositories/messaging-connection-lifecycle";
import { MESSAGING_CONNECTION_SECURITY_REASON } from "@/src/modules/messaging/constants/messaging-connection-security";
import { MESSAGING_CONNECTION_LABEL } from "@/src/modules/messaging/constants/messaging-connection-presentation";
import { MESSAGING_LIFECYCLE_BROWSER_PATH, MESSAGING_LIFECYCLE_IMPACT_COPY as IMPACT_COPY } from "@/src/modules/messaging/constants/messaging-lifecycle-browser";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_LIFECYCLE_ACTION_OPTIONS, MESSAGING_LIFECYCLE_REASON_OPTIONS } from "@/src/modules/messaging/constants/messaging-lifecycle-options";
import styles from "./styles.module.scss";

/** Own current view facts contain no credential, provider IDs or recipient information. */
export type MessagingLifecycleConnectionView={id:string;name:string;version:number;state:keyof typeof MESSAGING_CONNECTION_LABEL;selected:boolean;candidate:boolean};
/** The route container supplies current resource state, renewed confirmation and every action callback. `acting` marks only the pressed suspension or disconnection. */
export type MessagingConnectionLifecycleProps={connections:readonly MessagingLifecycleConnectionView[];targetId:string;retiring:boolean;reason:MessagingConnectionSuspensionInput["reason"];confirmed:boolean;busy:boolean;acting?:boolean;canAct:boolean;onTarget:(id:string)=>void;onRetiring:(retiring:boolean)=>void;onReason:(reason:MessagingConnectionSuspensionInput["reason"])=>void;onConfirm:(confirmed:boolean)=>void;onAct:()=>void;message?:{kind:"status"|"alert";text:string}|null};

/** @param props - Guarded current metadata and callbacks only. @returns Accessible local safety/retirement confirmation and explicit impact. */
export function MessagingConnectionLifecycle(props:MessagingConnectionLifecycleProps){
  const instanceId=useId(),targetId=`${instanceId}-target`,actionId=`${instanceId}-action`,reasonId=`${instanceId}-reason`,confirmationId=`${instanceId}-consent`,target=props.connections.find((connection)=>connection.id===props.targetId),selectedName=props.connections.find((connection)=>connection.selected&&connection.id!==target?.id)?.name??null;
  // Suspending the connection the academy uses now stops every notice and code, so its confirmation names that impact.
  const suspendingActive=Boolean(target&&!props.retiring&&target.selected&&target.state===MESSAGING_CONNECTION_STATE.active),retiringCandidate=Boolean(target&&props.retiring&&target.candidate&&!target.selected),retiringSelected=Boolean(target&&props.retiring&&target.selected);
  return<section className={styles.MessagingConnectionLifecycle} aria-label="Seguridad y retiro de conexiones"><h2 className={styles.MessagingConnectionLifecycle__title}>Seguridad y retiro</h2><p className={styles.MessagingConnectionLifecycle__note}>Usá estas acciones si sospechás un problema o querés dejar de usar una conexión.</p>
    {props.connections.length===0?<p className={styles.MessagingConnectionLifecycle__help}>No hay conexiones vigentes para gestionar.</p>:<>
      <div className={styles.MessagingConnectionLifecycle__field}><Select value={props.targetId} disabled={props.busy} onValueChange={props.onTarget} id={targetId} label="Conexión que querés gestionar" options={props.connections.map((connection) => ({ value: connection.id, label: `${connection.name} · ${connection.selected && connection.candidate ? "Seleccionada y candidata" : connection.selected ? "Seleccionada" : "Candidata"} · ${MESSAGING_CONNECTION_LABEL[connection.state]}` }))} /></div>
      {target&&<p className={styles.MessagingConnectionLifecycle__help}>Estado actual: {MESSAGING_CONNECTION_LABEL[target.state]}. La acción afecta a esta conexión y todas sus versiones.</p>}
      <div className={styles.MessagingConnectionLifecycle__field}><Select value={props.retiring?MESSAGING_LIFECYCLE_BROWSER_PATH.disconnect:MESSAGING_LIFECYCLE_BROWSER_PATH.suspend} disabled={props.busy} onValueChange={(value)=>props.onRetiring(value===MESSAGING_LIFECYCLE_BROWSER_PATH.disconnect)} id={actionId} label="Acción local" options={MESSAGING_LIFECYCLE_ACTION_OPTIONS} /></div>
      <p className={styles.MessagingConnectionLifecycle__note}>{IMPACT_COPY.difference}</p>
      {!props.retiring&&<div className={styles.MessagingConnectionLifecycle__field}><Select value={props.reason} disabled={props.busy} onValueChange={(value)=>{const reason=Object.values(MESSAGING_CONNECTION_SECURITY_REASON).find((candidate)=>candidate===value);if(reason)props.onReason(reason);}} id={reasonId} label="Motivo de suspensión" options={MESSAGING_LIFECYCLE_REASON_OPTIONS} /></div>}
      <p className={styles.MessagingConnectionLifecycle__help}>{props.retiring?"El servidor comprueba las dependencias vigentes. Para retirar la seleccionada, resolvé la verificación requerida o pausá admisiones y desactivá los avisos externos dependientes. Las pruebas ya aplicadas conservan su procedencia.":props.reason===MESSAGING_CONNECTION_SECURITY_REASON.suspectedCompromise?"Se detienen los nuevos envíos y las pruebas afectadas de solicitudes pendientes requieren recomprobación. Los miembros admitidos y las invitaciones permanecen.":"Se detienen los nuevos envíos sin depender del proveedor. La selección y los ajustes de admisión permanecen; no se dispensa una verificación requerida."}</p>
      {suspendingActive&&target&&<p className={styles.MessagingConnectionLifecycle__warning} role="note">{IMPACT_COPY.activeSuspension(target.name)}</p>}
      {retiringSelected&&target&&<p className={styles.MessagingConnectionLifecycle__warning} role="note">{IMPACT_COPY.selectedRetirement(target.name)}</p>}
      {retiringCandidate&&target&&<p className={styles.MessagingConnectionLifecycle__impact}>{IMPACT_COPY.candidateRetirement(target.name,selectedName)}</p>}
      <p className={styles.MessagingConnectionLifecycle__note}>Los mensajes ya aceptados o inciertos pueden continuar y conservan su consumo. Revocar la clave en Zavu es una acción separada.</p>
      <div className={styles.MessagingConnectionLifecycle__consent}><Checkbox id={confirmationId} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onConfirm(checked===true)} /><Label htmlFor={confirmationId}>{suspendingActive&&target?IMPACT_COPY.activeSuspensionConsent(target.name):IMPACT_COPY.consent}</Label></div>
      <div className={styles.MessagingConnectionLifecycle__actions}><Button type="button" variant={props.retiring?"danger":"primary"} loading={props.acting} disabled={!props.acting&&(props.busy||!props.canAct||!props.confirmed)} onClick={props.onAct}>{props.retiring?"Desconectar conexión":"Suspender conexión"}</Button></div>
    </>}
    {props.message&&<p className={styles.MessagingConnectionLifecycle__feedback} role={props.message.kind} aria-live={props.message.kind==="alert"?"assertive":"polite"}>{props.message.text}</p>}
  </section>;
}
