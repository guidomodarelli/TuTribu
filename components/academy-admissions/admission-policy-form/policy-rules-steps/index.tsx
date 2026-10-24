"use client";
/** Splits the admission rules into small decisions, one per step, ending in a single confirmed action. @module policy-rules-steps */
import { Checkbox, RadioGroup, Select } from "@golfo/ui";
import { useId, type ReactNode } from "react";
import { GuidedSteps, type GuidedStep } from "@/components/forms/guided-steps";
import { ButtonLink } from "@/components/navigation/link";
import type { AdmissionPolicyDraft } from "@/src/modules/academy-admissions/application/commands/admission-policy-draft";
import type { AdmissionPolicyStateDto } from "@/src/modules/academy-admissions/application/results/admission-policy-result-schemas";
import { ADMISSION_POLICY_MODE, ADMISSION_PHONE_CHANNEL } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_POLICY_MODE_OPTIONS, ADMISSION_POLICY_CONTACT_OPTIONS, ADMISSION_POLICY_PHONE_CHANNEL_OPTIONS } from "@/src/modules/academy-admissions/constants/admission-policy-options";
import { ADMISSION_POLICY_BROWSER_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_POLICY_STEP, type AdmissionPolicyStepId } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";
import { COMMERCIAL_MEMBERSHIP_REVIEW_COPY } from "@/src/modules/academy-admissions/constants/commercial-membership-review";
import { PolicyRulesSummary } from "../policy-rules-summary";
import type { AdmissionPolicySettingsLinks } from "../policy-action-feedback";
import styles from "./styles.module.scss";

/**
 * @param editing - Whether an activated control is being edited; pause and resume own intake there.
 * @returns The step order of the flow, so callers can open a step by its id.
 */
export function admissionPolicyStepIds(editing: boolean, includeMemberships = false): AdmissionPolicyStepId[] {
  if (editing) return [ADMISSION_POLICY_STEP.admission, ADMISSION_POLICY_STEP.contact, ADMISSION_POLICY_STEP.review];
  return [ADMISSION_POLICY_STEP.admission, ADMISSION_POLICY_STEP.contact, ADMISSION_POLICY_STEP.intake, ...(includeMemberships ? [ADMISSION_POLICY_STEP.memberships] : []), ADMISSION_POLICY_STEP.review];
}

/** The membership review inserted before the final step while memberships blocked by payment need a decision. */
export type PolicyMembershipStep = { content: ReactNode; blockedReason: string | null };

type PolicyRulesStepsProps = {
  state: AdmissionPolicyStateDto; draft: AdmissionPolicyDraft; editing: boolean; step: number; confirmed: boolean;
  busy: boolean; finalLoading: boolean; lockedReason: string | null; validationMessage: string | null; links: AdmissionPolicySettingsLinks; feedback: ReactNode;
  /** Present only before activation, while the review has pending or just-decided memberships. */
  membershipStep?: PolicyMembershipStep | null;
  /** Final action label override, for example «Activar ahora» when the saved rules are being published. */
  finalLabel?: string;
  onChange: (draft: AdmissionPolicyDraft) => void; onStepChange: (step: number) => void; onConfirm: (confirmed: boolean) => void; onRunFinal: () => void;
};

/** @param count - Pending requests. @returns What happens to them, with singular agreement. */
function pendingImpact(count: number): string {
  return count === 1 ? "1 solicitud pendiente conserva su fecha y su estado; se revisa con las reglas vigentes." : `${count} solicitudes pendientes conservan su fecha y su estado; se revisan con las reglas vigentes.`;
}

/**
 * @param props - Current state, retained draft, active step, confirmation and container callbacks.
 * @returns The guided flow whose last step saves (and activates) the rules through one action.
 */
export function PolicyRulesSteps(props: PolicyRulesStepsProps) {
  const instanceId = useId();
  const { draft } = props;
  const change = (patch: Partial<AdmissionPolicyDraft>) => props.onChange({ ...draft, ...patch });
  const phone = draft.contactType === ADMISSION_CONTACT_TYPE.phone;
  const locked = props.state.impact.contactTypeLocked;
  const contactReason = props.validationMessage ?? (phone && draft.requiresAdditionalVerification && !draft.phoneChannel ? ADMISSION_POLICY_BROWSER_COPY.phoneChannelRequired : null);
  const reviewReason = props.lockedReason ?? props.validationMessage ?? (props.confirmed ? null : ADMISSION_POLICY_BROWSER_COPY.confirmRequired);
  const countries = props.state.usage?.allowedCountries ?? [];

  const steps: Record<AdmissionPolicyStepId, GuidedStep> = {
    admission: {
      id: ADMISSION_POLICY_STEP.admission, title: "Cómo se admite", description: "Elegí cómo decide la academia quién entra.",
      content: <>
        <RadioGroup label="Cómo se admite" hideLabel value={draft.mode} options={[...ADMISSION_POLICY_MODE_OPTIONS]} onValueChange={(value) => { const mode = ADMISSION_POLICY_MODE_OPTIONS.find((option) => option.value === value)?.value; if (mode) change({ mode }); }} />
        {draft.mode === ADMISSION_POLICY_MODE.allowlist && <div className={styles.PolicyRulesSteps__group}>
          <Checkbox id={`${instanceId}-exceptions`} checked={draft.allowCommonExceptions} label="Permitir solicitudes comunes como excepción" description="Quien no está en la lista puede enviar una solicitud con un motivo, y la revisás vos." onCheckedChange={(checked) => change({ allowCommonExceptions: checked === true })} />
          {props.state.policy
            ? <ButtonLink className={styles.PolicyRulesSteps__link} variant="secondary" size="sm" href={props.links.allowlist}>Cargar personas en Habilitados</ButtonLink>
            : <p className={styles.PolicyRulesSteps__note}>Después de guardar las reglas vas a poder cargar personas en Habilitados.</p>}
        </div>}
      </>,
    },
    contact: {
      id: ADMISSION_POLICY_STEP.contact, title: "Cómo se contactan", description: "Elegí con qué dato se identifica cada persona y si querés comprobarlo.", blockedReason: contactReason ?? undefined,
      content: <>
        <RadioGroup label="Tipo de contacto" value={draft.contactType} options={ADMISSION_POLICY_CONTACT_OPTIONS.map((option) => ({ ...option, disabled: locked && option.value !== draft.contactType }))} onValueChange={(value) => { const contactType = ADMISSION_POLICY_CONTACT_OPTIONS.find((option) => option.value === value)?.value; if (contactType) change({ contactType }); }} />
        {locked && <p className={styles.PolicyRulesSteps__note}>{ADMISSION_POLICY_BROWSER_COPY.contactLocked}</p>}
        <Checkbox id={`${instanceId}-verification`} checked={draft.requiresAdditionalVerification} label="Comprobar el contacto con un código" description="Le enviamos un código a la persona para confirmar que el contacto es suyo. Para activarlo, el canal de envío tiene que estar preparado en Conexión." onCheckedChange={(checked) => change({ requiresAdditionalVerification: checked === true })} />
        {phone && <div className={styles.PolicyRulesSteps__group}>
          {draft.requiresAdditionalVerification
            ? <>
              <Select id={`${instanceId}-channel`} label="Canal del código" value={draft.phoneChannel ?? ""} options={ADMISSION_POLICY_PHONE_CHANNEL_OPTIONS} placeholder="Elegí un canal" onValueChange={(value) => { const phoneChannel = ADMISSION_POLICY_PHONE_CHANNEL_OPTIONS.find((option) => option.value === value)?.value; if (phoneChannel) change({ phoneChannel, allowSmsAlternative: phoneChannel === ADMISSION_PHONE_CHANNEL.whatsapp && draft.allowSmsAlternative }); }} />
              {draft.phoneChannel === ADMISSION_PHONE_CHANNEL.whatsapp && <Checkbox id={`${instanceId}-sms`} checked={draft.allowSmsAlternative} label="Ofrecer SMS como alternativa a WhatsApp" onCheckedChange={(checked) => change({ allowSmsAlternative: checked === true })} />}
            </>
            : <p className={styles.PolicyRulesSteps__note}>Con teléfono y sin código, el ingreso común manual está disponible; las invitaciones personales por teléfono no están disponibles.</p>}
          <p className={styles.PolicyRulesSteps__note}>{countries.length ? `Países habilitados para el envío telefónico: ${countries.join(", ")}.` : "Todavía no hay países habilitados para el envío telefónico."}</p>
          <ButtonLink className={styles.PolicyRulesSteps__link} variant="secondary" size="sm" href={props.links.usage}>Configurar países y cupos de mensajería</ButtonLink>
        </div>}
        <Checkbox id={`${instanceId}-whatsapp`} checked={draft.requiresWhatsappNumber ?? false} label={ADMISSION_WHATSAPP_COPY.policyLabel} description={ADMISSION_WHATSAPP_COPY.policyHelp} onCheckedChange={(checked) => change({ requiresWhatsappNumber: checked === true })} />
      </>,
    },
    intake: {
      id: ADMISSION_POLICY_STEP.intake, title: "Recibir solicitudes", description: "Decidí si la academia empieza a recibir solicitudes apenas actives las admisiones.",
      content: <Checkbox id={`${instanceId}-open`} checked={draft.isOpen} label="Recibir nuevas solicitudes" description="Si no lo marcás, las admisiones quedan activadas pero pausadas: nadie puede postularse hasta que las reanudes." onCheckedChange={(checked) => change({ isOpen: checked === true })} />,
    },
    memberships: {
      id: ADMISSION_POLICY_STEP.memberships, title: COMMERCIAL_MEMBERSHIP_REVIEW_COPY.stepTitle, description: COMMERCIAL_MEMBERSHIP_REVIEW_COPY.stepDescription,
      blockedReason: props.membershipStep?.blockedReason ?? undefined, content: props.membershipStep?.content ?? null,
    },
    review: {
      id: ADMISSION_POLICY_STEP.review, title: props.editing ? "Revisá y guardá" : "Revisá y activá", description: "Esto es lo que elegiste. Podés volver atrás para cambiarlo.", blockedReason: reviewReason ?? undefined,
      content: <>
        <PolicyRulesSummary rules={draft} />
        <div className={styles.PolicyRulesSteps__impact}>
          <p className={styles.PolicyRulesSteps__note}>{pendingImpact(props.state.impact.pendingRequestCount)}</p>
          {draft.requiresAdditionalVerification && <p className={styles.PolicyRulesSteps__note}>Activar los códigos inicia una nueva exigencia de comprobación y no aprueba solicitudes automáticamente.</p>}
          {!props.editing && <p className={styles.PolicyRulesSteps__note}>Al activar, el tipo de contacto queda fijo y ya no se puede cambiar.</p>}
        </div>
        <Checkbox id={`${instanceId}-confirm`} checked={props.confirmed} label={props.editing ? "Revisé las reglas y quiero guardar los cambios." : "Revisé las reglas y quiero activar las admisiones."} onCheckedChange={(checked) => props.onConfirm(checked === true)} />
      </>,
    },
  };

  return <GuidedSteps label={props.editing ? "Editar reglas de admisión" : "Configurar reglas de admisión"} steps={admissionPolicyStepIds(props.editing, Boolean(props.membershipStep)).map((id) => steps[id])} current={props.step} onCurrentChange={props.onStepChange} busy={props.busy}
    finalAction={{ label: props.finalLabel ?? (props.editing ? "Guardar cambios" : "Guardar y activar admisiones"), loading: props.finalLoading, disabled: Boolean(reviewReason), onRun: props.onRunFinal }}
    footer={props.feedback} />;
}
