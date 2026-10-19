"use client";
/** Shows whether activated admissions are open or paused, with pause, resume and edit as the only actions. @module policy-status-panel */
import { Button, Textarea } from "@golfo/ui";
import { useId, type ReactNode } from "react";
import type { AdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-draft";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_POLICY_ACTION, type AdmissionPolicyAction } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import { PolicyRulesSummary } from "../policy-rules-summary";
import styles from "./styles.module.scss";

type PolicyStatusPanelProps = {
  /** Saved rules of the activated control. */
  rules: AdmissionPolicyDraft;
  busy: boolean; locked: boolean; pendingAction: AdmissionPolicyAction | null;
  pauseOpen: boolean; pauseReason: string; feedback: ReactNode;
  onPauseOpen: (open: boolean) => void; onPauseReason: (reason: string) => void; onPause: () => void; onResume: () => void; onEdit: () => void;
};

/**
 * @param props - Saved rules, write state and container callbacks.
 * @returns The open or paused state with its single next action and the rule summary.
 */
export function PolicyStatusPanel(props: PolicyStatusPanelProps) {
  const titleId = useId(), reasonId = useId();
  const open = props.rules.isOpen;
  const pausing = props.pendingAction === ADMISSION_POLICY_ACTION.pause, resuming = props.pendingAction === ADMISSION_POLICY_ACTION.resume;
  return <section className={styles.PolicyStatusPanel} aria-labelledby={titleId}>
    <div className={styles.PolicyStatusPanel__heading}>
      <h2 id={titleId} className={styles.PolicyStatusPanel__title}>{open ? "Admisiones abiertas" : "Admisiones pausadas"}</h2>
      <p className={styles.PolicyStatusPanel__lead}>{open ? "Las personas pueden postularse con estas reglas." : "Nadie puede postularse por ahora. Podés seguir consultando, rechazando o cancelando las solicitudes pendientes."}</p>
    </div>
    <PolicyRulesSummary rules={props.rules} showIntake={false} />
    {props.pauseOpen
      ? <div className={styles.PolicyStatusPanel__pause}>
        <Textarea id={reasonId} label="Motivo de la pausa" description={`Queda registrado como motivo interno. La pausa cierra nuevas solicitudes y aprobaciones. Hasta ${ADMISSION_LIMIT.internalMessageCharacters} caracteres.`} error={undefined} value={props.pauseReason} maxLength={ADMISSION_LIMIT.internalMessageCharacters} disabled={props.busy} onChange={(event) => props.onPauseReason(event.target.value)} />
        <div className={styles.PolicyStatusPanel__actions}>
          <Button variant="danger" loading={pausing} disabled={props.locked || !props.pauseReason.trim() || (props.busy && !pausing)} onClick={props.onPause}>Confirmar pausa</Button>
          <Button variant="ghost" disabled={props.busy} onClick={() => props.onPauseOpen(false)}>Cancelar</Button>
        </div>
      </div>
      : <div className={styles.PolicyStatusPanel__actions}>
        {open
          ? <Button variant="secondary" disabled={props.busy || props.locked} onClick={() => props.onPauseOpen(true)}>Pausar admisiones</Button>
          : <Button variant="primary" loading={resuming} disabled={props.locked || (props.busy && !resuming)} onClick={props.onResume}>Reanudar admisiones</Button>}
        <Button variant="secondary" disabled={props.busy || props.locked} onClick={props.onEdit}>Editar reglas</Button>
      </div>}
    {props.feedback}
  </section>;
}
