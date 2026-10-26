"use client";
/** Presents the Activation step: visible prerequisites and the explicit consent the guided flow's final action needs, without session, persistence or provider ownership. @module messaging-connection-activation */
import {useId} from "react";
import {Checkbox} from "@golfo/ui";
import type {MessagingConfigurationConnection} from "@/src/modules/messaging/application/results/messaging-configuration-result";
import styles from "./styles.module.scss";

/** The route owns current authority, requirements, consent and original-operation coordination; the guided flow's final button runs the activation. */
export type MessagingConnectionActivationProps={candidate:MessagingConfigurationConnection;selected:MessagingConfigurationConnection|null;confirmed:boolean;busy:boolean;requirements:readonly string[];onConfirm:(confirmed:boolean)=>void};

/** @param props - Current own candidate/selection facts and explicit consent callback. @returns Requirements first, then a controlled confirmation; rendering never selects or sends. */
export function MessagingConnectionActivation(props:MessagingConnectionActivationProps){
  const fieldId=useId(),ready=props.requirements.length===0;
  return<section className={styles.MessagingConnectionActivation} aria-labelledby={`${fieldId}-title`}>
    <h2 id={`${fieldId}-title`} className={styles.MessagingConnectionActivation__title}>Activar la candidata</h2>
    <p className={styles.MessagingConnectionActivation__candidate}>{props.candidate.name} · Configuración {props.candidate.configurationVersion}</p>
    {props.selected&&props.selected.id!==props.candidate.id&&<p className={styles.MessagingConnectionActivation__description}>La seleccionada {props.selected.name}, configuración {props.selected.configurationVersion}, seguirá vigente hasta confirmar el reemplazo.</p>}
    <p className={styles.MessagingConnectionActivation__description}>Activar selecciona la candidata comprobada para la mensajería de la academia. Los códigos de admisión y los avisos por correo conservan sus ajustes; activar la conexión no los enciende.</p>
    <div className={styles.MessagingConnectionActivation__requirementsBlock}>
      <h3 className={styles.MessagingConnectionActivation__subtitle}>{ready?"Requisitos cumplidos":"Falta completar"}</h3>
      {ready?<p className={styles.MessagingConnectionActivation__note}>Cuenta de producción y pruebas recibidas de los canales necesarios, para esta configuración, dentro de las últimas 24 horas. La confirmación vuelve a comprobarlos.</p>:<ul className={styles.MessagingConnectionActivation__requirements} aria-label="Requisitos para activar">{props.requirements.map((requirement)=><li key={requirement}>{requirement}</li>)}</ul>}
    </div>
    <div className={styles.MessagingConnectionActivation__form}>
      <Checkbox id={`${fieldId}-consent`} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onConfirm(checked===true)} label="Confirmo que quiero usar esta candidata y reemplazar la conexión seleccionada cuando corresponda." />
    </div>
  </section>;
}
