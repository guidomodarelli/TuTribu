"use client";
/** Presents preserved issued references as a collapsed, secondary recovery for explicit readonly lookup, without owning storage, HTTP or destination/code. @module messaging-diagnostic-history */
import {useId,useState} from "react";
import {Button,Dialog,DialogClose,DialogContent} from "@golfo/ui";
import type {MessagingDiagnosticObservationReference} from "@/src/modules/messaging/application/ports/messaging-connections-intent-store";
import {MESSAGING_CONNECTION_HISTORY_LIMIT} from "@/src/modules/messaging/constants/messaging-connections-browser";
import {MESSAGING_CHANNEL_LABEL} from "@/src/modules/messaging/constants/messaging-connection-presentation";
import styles from "./styles.module.scss";

/** All metadata is already scoped to the current own viewer/route by the container. `onClearEarlier` keeps only the latest reference; the container owns that local write. */
export type MessagingDiagnosticHistoryProps={references:readonly MessagingDiagnosticObservationReference[];busy:boolean;onRead:(reference:MessagingDiagnosticObservationReference)=>void;onClearEarlier:()=>void};

/** @param props - Preserved operation references, one explicit lookup callback and the confirmed exit from a full history. @returns A full-history block that stays visible with its exit, and the references collapsed under a disclosure; nothing is sent or disclosed. */
export function MessagingDiagnosticHistory(props:MessagingDiagnosticHistoryProps){
  const titleId=useId(),[open,setOpen]=useState(false),[confirmingClear,setConfirmingClear]=useState(false);if(props.references.length===0)return null;
  const full=props.references.length>=MESSAGING_CONNECTION_HISTORY_LIMIT,earlierCount=props.references.length-1;
  /** Closes the confirmation before the container clears, so the dialog never outlives the list it describes. */
  const confirmClear=()=>{setConfirmingClear(false);props.onClearEarlier();};
  return<section className={styles.MessagingDiagnosticHistory} aria-labelledby={titleId}>
    {/* A full history blocks new tests, so it stays outside the collapsed recovery together with its only exit. */}
    {full&&<div className={styles.MessagingDiagnosticHistory__full}>
      <p role="alert" className={styles.MessagingDiagnosticHistory__alert}>Se alcanzó el límite de {MESSAGING_CONNECTION_HISTORY_LIMIT} referencias de esta pestaña. No se solicitará otra emisión mientras no pueda conservarse su referencia. Podés consultar y confirmar las pruebas conservadas, o vaciar las anteriores para pedir otra.</p>
      <Button className={styles.MessagingDiagnosticHistory__button} variant="secondary" size="sm" disabled={props.busy} onClick={()=>setConfirmingClear(true)}>Vaciar pruebas anteriores</Button>
    </div>}
    <details className={styles.MessagingDiagnosticHistory__details} open={open} onToggle={(event)=>setOpen(event.currentTarget.open)}>
      <summary className={styles.MessagingDiagnosticHistory__summary}><h2 id={titleId} className={styles.MessagingDiagnosticHistory__title}>Pruebas conservadas ({props.references.length})</h2></summary>
      {/* Hidden while collapsed, so a closed recovery never takes room or reaches assistive technology. */}<div className={styles.MessagingDiagnosticHistory__body} hidden={!open}>
        <p className={styles.MessagingDiagnosticHistory__description}>Solo hace falta si perdiste una prueba en curso. Consultá una emisión anterior para recuperar la prueba y confirmar el código que recibiste o reemplazar su desafío. No guardan el destino completo ni el código; consultarlas no envía mensajes.</p>
        <ul className={styles.MessagingDiagnosticHistory__list}>{props.references.map((reference,index)=><li className={styles.MessagingDiagnosticHistory__item} key={reference.operationId}><span className={styles.MessagingDiagnosticHistory__label}>Configuración {reference.configurationVersion} · {MESSAGING_CHANNEL_LABEL[reference.channel]}</span><Button className={styles.MessagingDiagnosticHistory__button} variant="secondary" size="sm" disabled={props.busy} onClick={()=>props.onRead(reference)}>Consultar prueba {index+1}: {MESSAGING_CHANNEL_LABEL[reference.channel]}</Button></li>)}</ul>
      </div>
    </details>
    <Dialog alert open={confirmingClear} onOpenChange={setConfirmingClear}>
      <DialogContent title="¿Vaciar pruebas anteriores?" description={`Se quitan de esta pestaña las referencias de ${earlierCount} pruebas anteriores y se conserva solo la última, que podés seguir consultando. Las pruebas ya enviadas no se cancelan ni se reenvían, pero ya no vas a poder consultarlas desde acá. No se puede deshacer.`} footer={<>
        <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
        <Button type="button" variant="danger" disabled={props.busy} onClick={confirmClear}>Vaciar pruebas anteriores</Button>
      </>} />
    </Dialog>
  </section>;
}
