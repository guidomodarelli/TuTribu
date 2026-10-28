/** Builds the guided steps of a personal invitation action from its controlled draft, without state, session or HTTP access. @module invitation-steps */
import type { ReactNode } from "react";
import { Button, Checkbox, Input, Label, Select, Textarea } from "@golfo/ui";
import type { GuidedStep } from "@/components/forms/guided-steps";
import type { PersonalInvitationManagementDraft } from "@/src/modules/academy-admissions/application/commands/personal-invitation-management-intent";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { PERSONAL_INVITATION_MANAGEMENT_COPY as COPY } from "@/src/modules/academy-admissions/constants/personal-invitation-management-browser";
import { formatBuenosAiresDateTime } from "@/lib/date-time/buenos-aires-format";
import { fromBuenosAiresMinuteKey } from "@/src/modules/shared/application/date-time/buenos-aires-minute";
import type { InvitationManagementProps } from "./index";
import styles from "./styles.module.scss";

/** The chosen action and the derived facts every step builder reads beside the controlled props. */
export type InvitationStepContext = {
  props: InvitationManagementProps; id: string; disabled: boolean;
  create: boolean; revoke: boolean; replacing: boolean; cannotCreate: boolean;
  reviewReason: string | undefined;
  /** The focusable save error, rendered by the component that owns its ref. */
  feedback: ReactNode;
  change: (patch: Partial<PersonalInvitationManagementDraft>) => void;
};

/** @param expiry - The datetime-local value, read as Argentina time. @returns The chosen expiry as people read dates, or that none is chosen yet. */
function formatInvitationExpiry(expiry: string): string {
  const instant = fromBuenosAiresMinuteKey(expiry);
  return instant ? formatBuenosAiresDateTime(instant) : "Sin elegir";
}

/** @param props - Contact type of the policy. @returns Why a new invitation cannot be issued: phone invitations are off, or there is no policy. */
function cannotCreateReason(props: InvitationManagementProps): string {
  return props.contactType ? COPY.phoneOff : COPY.noPolicy;
}

/** @param props - Current state of the guided action. @param facts - The chosen action and its derived blockers. @returns What blocks the final save, or undefined. */
export function invitationReviewBlockedReason(props: InvitationManagementProps, facts: { unresolved: boolean; create: boolean; replacing: boolean; cannotCreate: boolean }): string | undefined {
  if (facts.unresolved) return COPY.pendingStepBlocked;
  if (props.conflict) return COPY.conflictBlocked;
  if (props.needsCurrent) return COPY.currentRequired;
  if (facts.create && facts.cannotCreate) return cannotCreateReason(props);
  if (facts.replacing && !props.draft.replacementAcknowledged) return COPY.replacementRequired;
  return props.confirmed ? undefined : COPY.confirmRequired;
}

/** @param draft - Selected invitation of a revocation. @param labels - Labels of a redeemed and of an unredeemed revocation. @returns The label that matches the selected invitation. */
function revokeLabel(draft: PersonalInvitationManagementDraft, labels: { redeemed: string; other: string }): string {
  return draft.selected?.status === "redeemed" ? labels.redeemed : labels.other;
}

/** @param draft - Current draft. @param action - The chosen action. @returns The editor title and the final action label. */
export function invitationLabels(draft: PersonalInvitationManagementDraft, action: { create: boolean; revoke: boolean; replacing: boolean }): { title: string; finalLabel: string } {
  if (action.replacing) return { title: "Reemitir invitación", finalLabel: "Reemitir invitación" };
  if (action.create) return { title: "Emitir invitación personal", finalLabel: "Emitir invitación" };
  if (action.revoke) {
    const label = revokeLabel(draft, { redeemed: "Retirar autorización", other: "Revocar invitación" });
    return { title: label, finalLabel: label };
  }
  return { title: "Renombrar invitación", finalLabel: "Guardar nombre" };
}

/** @param props - Policy contact facts and draft. @param cannotCreate - Whether the policy forbids a new invitation. @returns What blocks the recipient step, or undefined. */
function recipientBlockedReason(props: InvitationManagementProps, cannotCreate: boolean): string | undefined {
  if (cannotCreate) return cannotCreateReason(props);
  return !props.draft.internalName.trim() || !props.draft.identity.trim() ? COPY.recipientRequired : undefined;
}

/** @param draft - Expiry choice and its acknowledgement. @returns What blocks the expiry step, or undefined. */
function expiryBlockedReason(draft: PersonalInvitationManagementDraft): string | undefined {
  if (draft.noExpiry) return draft.noExpiryAcknowledged ? undefined : COPY.noExpiryRequired;
  return draft.expiry ? undefined : COPY.expiryRequired;
}

/** @param draft - Revocation reason and withdrawal acknowledgement. @returns What blocks the reason step, or undefined. */
function reasonBlockedReason(draft: PersonalInvitationManagementDraft): string | undefined {
  if (!draft.internalReason.trim()) return COPY.reasonRequired;
  return draft.selected?.status === "redeemed" && !draft.withdrawalAcknowledged ? COPY.withdrawalRequired : undefined;
}

/** @param context - Chosen action, derived facts and draft callbacks. @returns The final review step: what will be saved, feedback and the single confirmation. */
function reviewStep(context: InvitationStepContext): GuidedStep {
  const { props, id, disabled, create, revoke, replacing, cannotCreate, reviewReason, feedback, change } = context, draft = props.draft;
  return {
    id: "review", title: create ? "Revisá y emití" : "Revisá y guardá", description: "Esto es lo que se va a guardar. Podés volver atrás para cambiarlo.", blockedReason: reviewReason,
    content: <>
      <dl className={styles.InvitationManagement__facts}>
        {!revoke && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Nombre interno</dt><dd className={styles.InvitationManagement__value}>{draft.internalName.trim() || "Sin nombre"}</dd></div>}
        {(create || draft.selected) && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Destinatario</dt><dd className={styles.InvitationManagement__value}>{draft.identity || "Sin destinatario"}{props.contactType === "phone" && draft.country ? ` (${draft.country})` : ""}</dd></div>}
        {create && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Lista de habilitados</dt><dd className={styles.InvitationManagement__value}>{draft.requiresAllowlist ? "Exige coincidencia" : "Dispensada"}</dd></div>}
        {create && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Vencimiento del enlace</dt><dd className={styles.InvitationManagement__value}>{draft.noExpiry ? "Sin vencimiento" : formatInvitationExpiry(draft.expiry)}</dd></div>}
        {revoke && draft.selected && <div className={styles.InvitationManagement__fact}><dt className={styles.InvitationManagement__term}>Invitación</dt><dd className={styles.InvitationManagement__value}>{draft.selected.internalName}, versión {draft.selected.version}</dd></div>}
      </dl>
      {replacing && draft.selected && <Checkbox id={`${id}-replacement`} checked={draft.replacementAcknowledged} disabled={disabled} label={`Confirmo revocar ${draft.selected.internalName} en su versión ${draft.selected.version} y emitir otra invitación.`} onCheckedChange={(value) => change({ replacementAcknowledged: value === true })} />}
      {feedback}
      <Checkbox id={`${id}-confirmed`} checked={props.confirmed} disabled={disabled || props.conflict || props.needsCurrent || create && cannotCreate} label="Confirmo esta acción sobre la invitación personal." onCheckedChange={(value) => props.onConfirm(value === true)} />
    </>,
  };
}

/** Pieces shared by the create, rename and revoke flows. */
type SharedPieces = { startOver: ReactNode; nameField: ReactNode };

/** @param context - Chosen action, derived facts and draft callbacks. @param review - The final review step. @param shared - Restart action and name field. @returns The recipient, allowlist, expiry and review steps of a new or reissued invitation. */
function createSteps(context: InvitationStepContext, review: GuidedStep, { startOver, nameField }: SharedPieces): GuidedStep[] {
  const { props, id, disabled, cannotCreate, change } = context, draft = props.draft;
  return [
    {
      id: "recipient", title: "Destinatario", description: "Cada invitación corresponde a un destinatario, que queda fijo.", blockedReason: recipientBlockedReason(props, cannotCreate),
      content: <>
        {nameField}
        <div className={styles.InvitationManagement__field}><Label htmlFor={`${id}-recipient`}>{props.contactType === "phone" ? "Teléfono destinatario" : "Correo destinatario"}</Label><Input id={`${id}-recipient`} type={props.contactType === "phone" ? "tel" : "email"} value={draft.identity} disabled={disabled || cannotCreate || draft.replaceSelected} aria-describedby={`${id}-recipient-help`} onChange={(event) => change({ identity: event.target.value })} /><p id={`${id}-recipient-help`} className={styles.InvitationManagement__help}>Cambiar contacto, requisito de lista o vigencia exige otra emisión.</p></div>
        {props.contactType === "phone" && <div className={styles.InvitationManagement__field}><Select value={draft.country} disabled={disabled || cannotCreate || draft.replaceSelected} onValueChange={(country) => change({ country })} id={`${id}-country`} label="País del teléfono" options={props.allowedCountries.map((country) => ({ value: country, label: country }))} placeholder="Elegí un país habilitado" /><p className={styles.InvitationManagement__help}>Ingresá un teléfono con prefijo internacional y un país habilitado por la academia.</p></div>}
      </>,
      secondary: startOver || undefined,
    },
    {
      id: "allowlist", title: "Lista de habilitados", description: "Decidí si el destinatario también tiene que estar en la lista.", blockedReason: !draft.requiresAllowlist && !draft.exemptionAcknowledged ? COPY.exemptionRequired : undefined,
      content: <>
        <Checkbox id={`${id}-list`} checked={draft.requiresAllowlist} disabled={disabled || !props.hasUsableAllowlist && !draft.requiresAllowlist} label="Exigir coincidencia en la lista de habilitados" onCheckedChange={(value) => change({ requiresAllowlist: value === true, exemptionAcknowledged: false })} />
        {!props.hasUsableAllowlist && <p className={styles.InvitationManagement__help}>No hay una lista utilizable para este tipo de contacto. La dispensa requiere reconocimiento explícito.</p>}
        {!draft.requiresAllowlist && <Checkbox id={`${id}-exemption`} checked={draft.exemptionAcknowledged} disabled={disabled} label="Reconozco la dispensa de lista; se conservan la prueba del destinatario, los códigos exigibles, la revisión manual y los bloqueos." onCheckedChange={(value) => change({ exemptionAcknowledged: value === true })} />}
      </>,
    },
    {
      id: "expiry", title: "Vencimiento", description: "Elegí hasta cuándo se puede usar el enlace.", blockedReason: expiryBlockedReason(draft),
      content: <>
        <div className={styles.InvitationManagement__field}><Label htmlFor={`${id}-expiry`}>Vencimiento del enlace (hora de Argentina)</Label><Input id={`${id}-expiry`} type="datetime-local" value={draft.expiry} disabled={disabled || draft.noExpiry} onChange={(event) => change({ expiry: event.target.value })} /><p className={styles.InvitationManagement__help}>La propuesta inicial tiene siete días de vigencia. El vencimiento del enlace no cambia el plazo de una solicitud ya canjeada.</p></div>
        <Checkbox id={`${id}-no-expiry`} checked={draft.noExpiry} disabled={disabled} label="Sin vencimiento" onCheckedChange={(value) => change({ noExpiry: value === true, noExpiryAcknowledged: false })} />
        {draft.noExpiry && <Checkbox id={`${id}-no-expiry-ack`} checked={draft.noExpiryAcknowledged} disabled={disabled} label="Reconozco que el enlace seguirá utilizable hasta su canje o revocación." onCheckedChange={(value) => change({ noExpiryAcknowledged: value === true })} />}
      </>,
    },
    review,
  ];
}

/** @param context - Chosen action and draft. @param review - The final review step. @param shared - Restart action and name field. @returns The name and review steps of a rename. */
function renameSteps(context: InvitationStepContext, review: GuidedStep, { startOver, nameField }: SharedPieces): GuidedStep[] {
  const draft = context.props.draft;
  return [
    { id: "name", title: "Nombre interno", description: "El nombre sólo lo ves vos; el enlace y el destinatario no cambian.", blockedReason: !draft.internalName.trim() ? COPY.nameRequired : undefined, content: nameField, secondary: startOver || undefined },
    review,
  ];
}

/** @param context - Chosen action, derived facts and draft callbacks. @param review - The final review step. @param shared - Restart action. @returns The reason and review steps of a revocation. */
function revokeSteps(context: InvitationStepContext, review: GuidedStep, { startOver }: Pick<SharedPieces, "startOver">): GuidedStep[] {
  const { props, id, disabled, change } = context, draft = props.draft;
  return [
    {
      id: "reason", title: "Motivo", description: draft.selected ? `Se revoca la versión ${draft.selected.version} de ${draft.selected.internalName}.` : undefined, blockedReason: reasonBlockedReason(draft),
      content: <>
        <div className={styles.InvitationManagement__field}><Label htmlFor={`${id}-reason`}>Motivo interno</Label><Textarea id={`${id}-reason`} value={draft.internalReason} maxLength={ADMISSION_LIMIT.internalMessageCharacters} disabled={disabled} onChange={(event) => change({ internalReason: event.target.value })} /></div>
        {draft.selected?.status === "redeemed" && <Checkbox id={`${id}-withdrawal`} checked={draft.withdrawalAcknowledged} disabled={disabled} label="Confirmo retirar la autorización canjeada. Si su solicitud sigue pendiente, se cancela; un miembro admitido no se expulsa y el enlace no se recicla." onCheckedChange={(value) => change({ withdrawalAcknowledged: value === true })} />}
      </>,
      secondary: startOver || undefined,
    },
    review,
  ];
}

/** @param context - Chosen action, derived facts and draft callbacks. @returns The guided steps of the chosen action. */
export function invitationSteps(context: InvitationStepContext): GuidedStep[] {
  const { props, id, disabled, change } = context, draft = props.draft;
  const startOver = draft.selected && <Button type="button" variant="ghost" size="sm" disabled={disabled || props.conflict} onClick={props.onNew}>Descartar y emitir una invitación nueva</Button>;
  const nameField = <div className={styles.InvitationManagement__field}><Label htmlFor={`${id}-name`}>Nombre interno</Label><Input id={`${id}-name`} value={draft.internalName} maxLength={ADMISSION_LIMIT.displayNameCharacters} disabled={disabled} onChange={(event) => change({ internalName: event.target.value })} /></div>;
  const review = reviewStep(context), shared = { startOver, nameField };
  if (context.create) return createSteps(context, review, shared);
  return context.revoke ? revokeSteps(context, review, shared) : renameSteps(context, review, shared);
}
