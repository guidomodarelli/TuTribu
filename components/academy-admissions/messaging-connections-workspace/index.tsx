"use client";
/** Presents the connection summary, the advisory next step, global feedback and one tab per workflow step, without owning auth, transport or storage. @module messaging-connections-workspace */
import {useId,type ReactNode} from "react";
import {Badge,Button,Tabs,TabsContent,TabsList,TabsTrigger,type BadgeTone} from "@astra-kit/ui";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import {MESSAGING_CAPABILITY_LABEL,MESSAGING_CHANNEL_LABEL,MESSAGING_CONNECTION_LABEL,MESSAGING_CREDENTIAL_LABEL,MESSAGING_CREDENTIAL_MODE_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import {MESSAGING_CONNECTIONS_NEXT_STEP,MESSAGING_CONNECTIONS_NEXT_STEP_COPY,MESSAGING_CONNECTIONS_NEXT_STEP_TAB,MESSAGING_CONNECTIONS_TAB,MESSAGING_CONNECTIONS_TAB_LABEL,MESSAGING_CONNECTIONS_TAB_ORDER,type MessagingConnectionsNextStep,type MessagingConnectionsTab} from "@/src/modules/messaging/constants/messaging-connections-workspace";
import styles from "./styles.module.scss";

/** Lifecycle, credential, account and capability facts keep distinct tones so a ready candidate never reads as active. */
const CONNECTION_STATE_TONE={draft:"neutral",ready:"info",active:"success",degraded:"warning",suspended:"warning",disconnected:"danger"} as const satisfies Record<keyof typeof MESSAGING_CONNECTION_LABEL,BadgeTone>;
const CREDENTIAL_STATE_TONE={not_validated:"neutral",valid:"success",invalid:"danger",unavailable:"warning"} as const satisfies Record<keyof typeof MESSAGING_CREDENTIAL_LABEL,BadgeTone>;
const CREDENTIAL_MODE_TONE={production:"neutral",test:"warning",unknown:"neutral"} as const satisfies Record<keyof typeof MESSAGING_CREDENTIAL_MODE_LABEL,BadgeTone>;
const CAPABILITY_STATE_TONE={unprepared:"neutral",prepared:"success",unavailable:"danger"} as const satisfies Record<keyof typeof MESSAGING_CAPABILITY_LABEL,BadgeTone>;

/** The container owns every request, consent and recovery; panels arrive already wired. A null panel means the step needs a candidate first. */
export type MessagingConnectionsWorkspaceProps={
  selected:MessagingConfigurationConnection|null;candidate:MessagingConfigurationConnection|null;
  activeTab:MessagingConnectionsTab;nextStep:MessagingConnectionsNextStep;busy:boolean;
  message:{kind:"status"|"alert";text:string}|null;messageAction?:ReactNode;attention?:ReactNode;
  panels:Record<MessagingConnectionsTab,ReactNode|null>;
  onTabChange:(tab:MessagingConnectionsTab)=>void;onReadCurrent:()=>void;
};

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

/** @param props - Pending-original or Google continuation controls supplied by the container. @returns A named region above the tabs, because it blocks every step. */
export function MessagingConnectionsAttention({children}:{children:ReactNode}){
  return<section className={styles.MessagingConnectionsWorkspace__attention} aria-label="Acciones pendientes">{children}</section>;
}

/** @param props - Restore buttons for archived originals. @returns A secondary list that explains that archiving neither cancelled nor repeated anything. */
export function MessagingConnectionsPreservedAttempts({children}:{children:ReactNode}){
  return<section className={styles.MessagingConnectionsWorkspace__preserved} aria-label="Intentos conservados"><h2 className={styles.MessagingConnectionsWorkspace__preservedTitle}>Intentos conservados</h2><p className={styles.MessagingConnectionsWorkspace__empty}>Estas referencias siguen disponibles para consultar el resultado original. Guardarlas no canceló ni repitió operaciones.</p><div className={styles.MessagingConnectionsWorkspace__preservedActions}>{children}</div></section>;
}

/** @param props - Current own metadata, controlled tab and pre-wired panels. @returns A summary followed by tabs; changing tabs never sends, saves or activates anything. */
export function MessagingConnectionsWorkspace(props:MessagingConnectionsWorkspaceProps){
  const instanceId=useId(),overviewId=`${instanceId}-overview`,nextTab=MESSAGING_CONNECTIONS_NEXT_STEP_TAB[props.nextStep];
  const shared=props.selected&&props.candidate&&props.selected.id===props.candidate.id?props.selected:null;
  const rows=shared?[{connection:shared,role:"Conexión seleccionada y candidata"}]:[...(props.selected?[{connection:props.selected,role:"Conexión seleccionada"}]:[]),...(props.candidate?[{connection:props.candidate,role:"Conexión candidata"}]:[])];
  const done=props.nextStep===MESSAGING_CONNECTIONS_NEXT_STEP.active;
  return<div className={styles.MessagingConnectionsWorkspace} data-beezping-ignore="true">
    <p className={styles.MessagingConnectionsWorkspace__intro}>Conectá Zavu, prepará los canales, probalos y activá la conexión de tu academia.</p>
    <section className={styles.MessagingConnectionsWorkspace__overview} aria-labelledby={overviewId}>
      <div className={styles.MessagingConnectionsWorkspace__overviewHeader}>
        <h2 id={overviewId} className={styles.MessagingConnectionsWorkspace__overviewTitle}>Estado actual</h2>
        <Button variant="ghost" size="sm" disabled={props.busy} onClick={props.onReadCurrent}>Consultar conexión actual</Button>
      </div>
      {rows.length>0?<ul className={styles.MessagingConnectionsWorkspace__connections}>{rows.map((row)=><ConnectionRow key={`${row.role}:${row.connection.id}`} {...row} />)}</ul>:<p className={styles.MessagingConnectionsWorkspace__empty}>Todavía no hay conexiones guardadas.</p>}
      <div className={`${styles.MessagingConnectionsWorkspace__nextStep} ${done?styles["MessagingConnectionsWorkspace__nextStep--done"]:""}`}>
        <p className={styles.MessagingConnectionsWorkspace__nextStepText}><span className={styles.MessagingConnectionsWorkspace__nextStepLabel}>{done?"Listo":"Próximo paso"}</span>{MESSAGING_CONNECTIONS_NEXT_STEP_COPY[props.nextStep]}</p>
        {!done&&props.activeTab!==nextTab&&<Button variant="secondary" size="sm" onClick={()=>props.onTabChange(nextTab)}>{`Ir a ${MESSAGING_CONNECTIONS_TAB_LABEL[nextTab]}`}</Button>}
      </div>
    </section>
    {props.attention}
    <Tabs className={styles.MessagingConnectionsWorkspace__tabs} value={props.activeTab} onValueChange={(value)=>{const tab=MESSAGING_CONNECTIONS_TAB_ORDER.find((candidate)=>candidate===value);if(tab)props.onTabChange(tab);}}>
      <TabsList className={styles.MessagingConnectionsWorkspace__tabList} aria-label="Pasos de la conexión">
        {MESSAGING_CONNECTIONS_TAB_ORDER.map((tab)=><TabsTrigger key={tab} value={tab}>{MESSAGING_CONNECTIONS_TAB_LABEL[tab]}</TabsTrigger>)}
      </TabsList>
      {MESSAGING_CONNECTIONS_TAB_ORDER.map((tab)=><TabsContent key={tab} value={tab} forceMount={tab===MESSAGING_CONNECTIONS_TAB.security||undefined} hidden={props.activeTab!==tab} className={styles.MessagingConnectionsWorkspace__panel}>
        {props.panels[tab]??<div className={styles.MessagingConnectionsWorkspace__blocked}><p className={styles.MessagingConnectionsWorkspace__empty}>Este paso necesita una conexión candidata. Guardá la clave de Zavu en Conexión para continuar.</p><Button variant="secondary" size="sm" onClick={()=>props.onTabChange(MESSAGING_CONNECTIONS_TAB.connection)}>Ir a Conexión</Button></div>}
        {/* The result sits next to the actions that produce it, so it stays in view on narrow screens. */}
        {props.activeTab===tab&&(props.message||props.messageAction)&&<div className={styles.MessagingConnectionsWorkspace__result}>{props.message&&<p className={`${styles.MessagingConnectionsWorkspace__feedback} ${props.message.kind==="alert"?styles["MessagingConnectionsWorkspace__feedback--alert"]:""}`} role={props.message.kind} aria-live={props.message.kind==="alert"?"assertive":"polite"}>{props.message.text}</p>}{props.messageAction}</div>}
      </TabsContent>)}
    </Tabs>
  </div>;
}
