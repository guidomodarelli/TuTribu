/** Presents the direct replacement of a candidate key from the Clave step, without auth, transport or storage ownership. @module messaging-candidate-key-replacement */
import { useId } from "react";
import { Button, Checkbox } from "@golfo/ui";
import { MESSAGING_KEY_REPLACEMENT_COPY as COPY } from "@/src/modules/messaging/constants/messaging-lifecycle-browser";
import styles from "./styles.module.scss";

/** The container owns consent scope and the retirement write. `replacing` marks only the pressed retirement. */
export type MessagingCandidateKeyReplacementProps={candidateName:string;credentialLabel:string;selectedName:string|null;confirmed:boolean;busy:boolean;replacing?:boolean;canReplace:boolean;onConfirm:(confirmed:boolean)=>void;onReplace:()=>void};

/** @param props - Current candidate and selection names, consent and callbacks. @returns The explicit retirement of the candidate only, naming what stays untouched; it never sends, saves or activates. */
export function MessagingCandidateKeyReplacement(props:MessagingCandidateKeyReplacementProps){
  const instanceId=useId(),titleId=`${instanceId}-title`,consentId=`${instanceId}-consent`;
  return<section className={styles.MessagingCandidateKeyReplacement} aria-labelledby={titleId}>
    <h2 id={titleId} className={styles.MessagingCandidateKeyReplacement__title}>{COPY.title}</h2>
    <p className={styles.MessagingCandidateKeyReplacement__lead}>{COPY.lead(props.candidateName,props.credentialLabel)}</p>
    <p className={styles.MessagingCandidateKeyReplacement__impact}>{props.selectedName?COPY.keepsSelected(props.selectedName):COPY.noSelected}</p>
    <div className={styles.MessagingCandidateKeyReplacement__consent}><Checkbox id={consentId} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked)=>props.onConfirm(checked===true)} label={COPY.consent(props.candidateName)} /></div>
    <div className={styles.MessagingCandidateKeyReplacement__actions}><Button className={styles.MessagingCandidateKeyReplacement__action} variant="danger" loading={props.replacing} disabled={!props.replacing&&(props.busy||!props.canReplace||!props.confirmed)} onClick={props.onReplace}>{COPY.action}</Button></div>
  </section>;
}
