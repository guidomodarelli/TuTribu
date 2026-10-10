"use client";
/** Presents preserved issued references for explicit readonly recovery without owning storage, HTTP or destination/code. @module messaging-diagnostic-history */
import {useId} from "react";
import {Button} from "beez-ui";
import type {MessagingDiagnosticObservationReference} from "@/src/modules/messaging/application/ports/messaging-connections-intent-store";
import {MESSAGING_CONNECTION_HISTORY_LIMIT} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_CHANNEL_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import styles from "./styles.module.scss";

/** All metadata is already scoped to the current own viewer/route by the container. */
export type MessagingDiagnosticHistoryProps={references:readonly MessagingDiagnosticObservationReference[];busy:boolean;onRead:(reference:MessagingDiagnosticObservationReference)=>void};

/** @param props - Preserved operation references and one explicit lookup callback. @returns Accessible original choices without another send or recipient disclosure. */
export function MessagingDiagnosticHistory(props:MessagingDiagnosticHistoryProps){
  const titleId=useId();if(props.references.length===0)return null;
  return<section className={styles.MessagingDiagnosticHistory} aria-labelledby={titleId}><h3 id={titleId} className={styles.MessagingDiagnosticHistory__title}>Pruebas conservadas</h3><p className={styles.MessagingDiagnosticHistory__description}>Consultá una emisión anterior para recuperar la prueba emitida y confirmar el código que recibiste o reemplazar su desafío de forma explícita. Estas referencias no guardan el destino completo ni el código; consultarlas no envía mensajes.</p>{props.references.length>=MESSAGING_CONNECTION_HISTORY_LIMIT&&<p role="alert" className={styles.MessagingDiagnosticHistory__description}>Se alcanzó el límite de {MESSAGING_CONNECTION_HISTORY_LIMIT} referencias de esta pestaña. No se solicitará otra emisión mientras no pueda conservarse su referencia. Podés consultar y confirmar las pruebas conservadas.</p>}<ul className={styles.MessagingDiagnosticHistory__list}>{props.references.map((reference,index)=><li className={styles.MessagingDiagnosticHistory__item} key={reference.operationId}><span>Configuración {reference.configurationVersion} · {MESSAGING_CHANNEL_LABEL[reference.channel]}</span><Button className={styles.MessagingDiagnosticHistory__button} type="button" variant="outline" disabled={props.busy} onClick={()=>props.onRead(reference)}>Consultar prueba {index+1}: {MESSAGING_CHANNEL_LABEL[reference.channel]}</Button></li>)}</ul></section>;
}
