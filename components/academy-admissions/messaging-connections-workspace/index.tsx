"use client";
/** Presents the connection summary, the single advisory next action and the linear guided flow (one small step per decision), without owning auth, transport, storage or operation feedback (toasts). @module messaging-connections-workspace */
import {useId,type ReactNode} from "react";
import {Alert,Badge,Button,type BadgeTone} from "@golfo/ui";
import {ButtonLink} from "@/components/navigation/link";
import {GuidedSteps,type GuidedStep,type GuidedStepsFinalAction} from "@/components/forms/guided-steps";
import type {MessagingConnectionsNextAction} from "@/src/modules/messaging/application/commands/messaging-connections-next-action";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {MESSAGING_CAPABILITY_LABEL,MESSAGING_CHANNEL_LABEL,MESSAGING_CONNECTION_LABEL,MESSAGING_CREDENTIAL_LABEL,MESSAGING_CREDENTIAL_MODE_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import {MESSAGING_CONNECTIONS_FLOW_COPY,MESSAGING_CONNECTIONS_NEXT_ACTION_COPY,MESSAGING_CONNECTIONS_NEXT_STEP} from "@/src/modules/messaging/constants/messaging-connections-workspace";
import styles from "./styles.module.scss";

/** Lifecycle, credential, account and capability facts keep distinct tones so a ready candidate never reads as active. */
const CONNECTION_STATE_TONE={draft:"neutral",ready:"info",active:"success",degraded:"warning",suspended:"warning",disconnected:"danger"} as const satisfies Record<keyof typeof MESSAGING_CONNECTION_LABEL,BadgeTone>;
const CREDENTIAL_STATE_TONE={not_validated:"neutral",valid:"success",invalid:"danger",unavailable:"warning"} as const satisfies Record<keyof typeof MESSAGING_CREDENTIAL_LABEL,BadgeTone>;
const CREDENTIAL_MODE_TONE={production:"neutral",test:"warning",unknown:"neutral"} as const satisfies Record<keyof typeof MESSAGING_CREDENTIAL_MODE_LABEL,BadgeTone>;
const CAPABILITY_STATE_TONE={unprepared:"neutral",prepared:"success",unavailable:"danger"} as const satisfies Record<keyof typeof MESSAGING_CAPABILITY_LABEL,BadgeTone>;

/** @param props - One current connection and its role in the academy. @returns A compact row with its name and separately toned facts. */
function ConnectionRow({connection,role}:{connection:MessagingConfigurationConnection;role:string}){
  return<li className={styles.MessagingConnectionsWorkspace__connection}>
    <h3 className={styles.MessagingConnectionsWorkspace__role}>{role}</h3>
    <p className={styles.MessagingConnectionsWorkspace__name}>{connection.name}</p>
    <ul className={styles.MessagingConnectionsWorkspace__badges} aria-label={`Estado de ${connection.name}`}>
      <li><Badge tone={CONNECTION_STATE_TONE[connection.state]}>{MESSAGING_CONNECTION_LABEL[connection.state]}</Badge></li>
      <li><Badge tone={CREDENTIAL_STATE_TONE[connection.credentialState]}>{MESSAGING_CREDENTIAL_LABEL[connection.credentialState]}</Badge></li>
      <li><Badge tone={CREDENTIAL_MODE_TONE[connection.credentialMode]}>{MESSAGING_CREDENTIAL_MODE_LABEL[connection.credentialMode]}</Badge></li>
      <li><Badge>{`Configuración ${connection.configurationVersion}`}</Badge></li>
      {connection.capabilities.map((capability)=><li key={capability.channel}><Badge tone={CAPABILITY_STATE_TONE[capability.state]}>{`${MESSAGING_CHANNEL_LABEL[capability.channel]}: ${MESSAGING_CAPABILITY_LABEL[capability.state]}`}</Badge></li>)}
    </ul>
  </li>;
}

/** @param props - Persistent explanation (null while the original's own write still runs) and pending-original controls supplied by the container. @returns A named region above the tabs, because it blocks every step; its notice stays until the state resolves, unlike operation toasts. */
export function MessagingConnectionsAttention({notice,children}:{notice:string|null;children?:ReactNode}){
  return<section className={styles.MessagingConnectionsWorkspace__attention} aria-label="Acciones pendientes">{notice&&<p className={styles.MessagingConnectionsWorkspace__attentionNotice} role="alert">{notice}</p>}{children}</section>;
}

/** @param props - Why a step has nothing to decide yet. @returns A quiet note in place of an empty form, inside the guided step. */
export function MessagingConnectionsStepNote({children}:{children:ReactNode}){
  return<p className={styles.MessagingConnectionsWorkspace__empty}>{children}</p>;
}

/** @param props - Messaging usage page. @returns Why a test step cannot send yet and the link to Países y cupos, in place of the test form; nothing is sent from here. */
export function MessagingConnectionsUsageRequired({usageHref}:{usageHref:string}){
  return<div className={styles.MessagingConnectionsWorkspace__usageRequired}>
    <p className={styles.MessagingConnectionsWorkspace__empty}>{MESSAGING_CONNECTIONS_FLOW_COPY.usageRequiredDetail}</p>
    <div><ButtonLink href={usageHref} variant="secondary" size="sm">{MESSAGING_CONNECTIONS_FLOW_COPY.usageLink}</ButtonLink></div>
  </div>;
}

/** @param props - Restore buttons for archived originals. @returns A secondary list that explains that archiving neither cancelled nor repeated anything. */
export function MessagingConnectionsPreservedAttempts({children}:{children:ReactNode}){
  return<section className={styles.MessagingConnectionsWorkspace__preserved} aria-label="Intentos conservados"><h2 className={styles.MessagingConnectionsWorkspace__preservedTitle}>Intentos conservados</h2><p className={styles.MessagingConnectionsWorkspace__empty}>Estas referencias siguen disponibles para consultar el resultado original. Guardarlas no canceló ni repitió operaciones.</p><div className={styles.MessagingConnectionsWorkspace__preservedActions}>{children}</div></section>;
}

/** The container owns every request, consent, recovery and toast; steps arrive already wired with their blocked reasons. */
export type MessagingConnectionsWorkspaceProps={
  selected:MessagingConfigurationConnection|null;candidate:MessagingConfigurationConnection|null;
  /** The one highlighted action and why it is next. */
  nextAction:MessagingConnectionsNextAction;
  /** True when the open step already shows that action, so the highlight drops its button instead of competing with the step's own action. */
  nextActionInView:boolean;
  /** Messaging usage page, for actions resolved there (allowed countries). */
  usageHref:string;
  busy:boolean;attention?:ReactNode;
  /** Linear steps in server order: key, credential, channels, one test per configured channel, activation. */
  steps:readonly GuidedStep[];current:number;onCurrentChange:(index:number)=>void;
  /** Activation, run by the last step's button. */
  finalAction:GuidedStepsFinalAction;
  /** Secondary, collapsed recovery shown under the flow (preserved tests). */
  recovery?:ReactNode;
  /** Security and retirement: outside the flow, always mounted so its drafts and observations survive. */
  security:ReactNode;securityOpen:boolean;onSecurityToggle:()=>void;
  onNextAction:()=>void;onReadCurrent:()=>void;
};

/** @param props - The resolved next action and where it is resolved. @returns The highlighted button, or nothing when the open step already shows it or nothing is left. */
function NextActionButton({nextAction,inView,busy,usageHref,onNextAction}:{nextAction:MessagingConnectionsNextAction;inView:boolean;busy:boolean;usageHref:string;onNextAction:()=>void}){
  if(!nextAction.action||!nextAction.target||inView)return null;
  if(nextAction.target.kind==="usage")return<ButtonLink href={usageHref} variant="secondary" size="sm">{nextAction.action}</ButtonLink>;
  return<Button variant="secondary" size="sm" disabled={busy} onClick={onNextAction}>{nextAction.action}</Button>;
}

/** @param props - Current own metadata and the wired guided flow. @returns A summary, one highlighted next action and the linear steps; moving between steps never sends, saves or activates anything. */
export function MessagingConnectionsWorkspace(props:MessagingConnectionsWorkspaceProps){
  const instanceId=useId(),overviewId=`${instanceId}-overview`;
  const shared=props.selected&&props.candidate&&props.selected.id===props.candidate.id?props.selected:null;
  const rows=shared?[{connection:shared,role:"Conexión seleccionada y candidata"}]:[...(props.selected?[{connection:props.selected,role:"Conexión seleccionada"}]:[]),...(props.candidate?[{connection:props.candidate,role:"Conexión candidata"}]:[])];
  const done=props.nextAction.step===MESSAGING_CONNECTIONS_NEXT_STEP.active;
  return<div className={styles.MessagingConnectionsWorkspace} data-beezping-ignore="true">
    <section className={styles.MessagingConnectionsWorkspace__overview} aria-labelledby={overviewId}>
      <div className={styles.MessagingConnectionsWorkspace__overviewHeader}>
        <h2 id={overviewId} className={styles.MessagingConnectionsWorkspace__overviewTitle}>Estado actual</h2>
        <Button variant="ghost" size="sm" disabled={props.busy} onClick={props.onReadCurrent}>Consultar conexión actual</Button>
      </div>
      {rows.length>0?<ul className={styles.MessagingConnectionsWorkspace__connections}>{rows.map((row)=><ConnectionRow key={`${row.role}:${row.connection.id}`} {...row} />)}</ul>:<p className={styles.MessagingConnectionsWorkspace__empty}>Todavía no hay conexiones guardadas.</p>}
    </section>
    {/* What is missing and why; its button jumps to the step that resolves it when the flow shows another one. */}
    <div className={styles.MessagingConnectionsWorkspace__nextAction} role="group" aria-label={MESSAGING_CONNECTIONS_NEXT_ACTION_COPY.region}>
      <Alert tone={done?"success":"info"} title={props.nextAction.title} action={<NextActionButton nextAction={props.nextAction} inView={props.nextActionInView} busy={props.busy} usageHref={props.usageHref} onNextAction={props.onNextAction} />}>{props.nextAction.reason}</Alert>
    </div>
    {props.attention}
    <div className={styles.MessagingConnectionsWorkspace__stepActions}>
      <Button variant="ghost" size="sm" aria-pressed={props.securityOpen} onClick={props.onSecurityToggle}>{props.securityOpen?MESSAGING_CONNECTIONS_FLOW_COPY.steps:MESSAGING_CONNECTIONS_FLOW_COPY.security}</Button>
    </div>
    {/* The flow stays mounted under Security so drafts survive; one step at a time, Siguiente only after its write finished. */}
    <div className={styles.MessagingConnectionsWorkspace__flow} hidden={props.securityOpen}>
      <GuidedSteps label={MESSAGING_CONNECTIONS_FLOW_COPY.label} steps={props.steps} current={props.current} onCurrentChange={props.onCurrentChange} finalAction={props.finalAction} nextLabel={MESSAGING_CONNECTIONS_FLOW_COPY.next} />
      {props.recovery}
    </div>
    <section aria-label={MESSAGING_CONNECTIONS_FLOW_COPY.securityRegion} hidden={!props.securityOpen} className={styles.MessagingConnectionsWorkspace__panel}>{props.security}</section>
  </div>;
}
