/** Describes chosen admission rules in plain words, for the review step and the current status. @module policy-rules-summary */
import type { AdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-draft";
import { ADMISSION_POLICY_MODE, ADMISSION_PHONE_CHANNEL } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_POLICY_MODE_OPTIONS, ADMISSION_POLICY_CONTACT_OPTIONS, ADMISSION_POLICY_PHONE_CHANNEL_OPTIONS } from "@/src/modules/academy-admissions/constants/admission-policy-options";
import styles from "./styles.module.scss";

type PolicyRulesSummaryProps = {
  /** Rules to describe: the draft under review or the saved configuration. */
  rules: AdmissionPolicyDraft;
  /** Shows whether new requests are received; the status view states it in its title instead. */
  showIntake?: boolean;
};

/** @param rules - Chosen rules. @returns How people are admitted, in one short sentence. */
function describeMode(rules: AdmissionPolicyDraft): string {
  const label = ADMISSION_POLICY_MODE_OPTIONS.find((option) => option.value === rules.mode)?.label ?? "";
  return rules.mode === ADMISSION_POLICY_MODE.allowlist && rules.allowCommonExceptions ? `${label}, con solicitudes de excepción` : label;
}

/** @param rules - Chosen rules. @returns Whether a code is sent and through which channel. */
function describeVerification(rules: AdmissionPolicyDraft): string {
  if (!rules.requiresAdditionalVerification) return "No";
  if (rules.contactType !== ADMISSION_CONTACT_TYPE.phone || !rules.phoneChannel) return "Sí";
  const channel = ADMISSION_POLICY_PHONE_CHANNEL_OPTIONS.find((option) => option.value === rules.phoneChannel)?.label ?? "";
  return rules.phoneChannel === ADMISSION_PHONE_CHANNEL.whatsapp && rules.allowSmsAlternative ? `Sí, por ${channel} (con SMS como alternativa)` : `Sí, por ${channel}`;
}

/**
 * @param props - Rules to describe and whether to include intake.
 * @returns A definition list that names every decision of the guided flow.
 */
export function PolicyRulesSummary({ rules, showIntake = true }: PolicyRulesSummaryProps) {
  const contact = ADMISSION_POLICY_CONTACT_OPTIONS.find((option) => option.value === rules.contactType)?.label ?? "";
  return <dl className={styles.PolicyRulesSummary}>
    <div className={styles.PolicyRulesSummary__fact}><dt className={styles.PolicyRulesSummary__term}>Cómo se admite</dt><dd className={styles.PolicyRulesSummary__value}>{describeMode(rules)}</dd></div>
    <div className={styles.PolicyRulesSummary__fact}><dt className={styles.PolicyRulesSummary__term}>Contacto</dt><dd className={styles.PolicyRulesSummary__value}>{contact}</dd></div>
    <div className={styles.PolicyRulesSummary__fact}><dt className={styles.PolicyRulesSummary__term}>Código de comprobación</dt><dd className={styles.PolicyRulesSummary__value}>{describeVerification(rules)}</dd></div>
    <div className={styles.PolicyRulesSummary__fact}><dt className={styles.PolicyRulesSummary__term}>WhatsApp del grupo</dt><dd className={styles.PolicyRulesSummary__value}>{rules.requiresWhatsappNumber ? "Obligatorio" : "Opcional"}</dd></div>
    {showIntake && <div className={styles.PolicyRulesSummary__fact}><dt className={styles.PolicyRulesSummary__term}>Nuevas solicitudes</dt><dd className={styles.PolicyRulesSummary__value}>{rules.isOpen ? "Se reciben" : "No se reciben"}</dd></div>}
  </dl>;
}
