/** Presents admission notices as a summary or as small guided steps, without session, transport or recovery storage dependencies. @module admission-notification-settings */
import { useId } from "react";
import { Alert, Badge, Button, Checkbox, Input, RadioGroup, type BadgeTone } from "@golfo/ui";
import { Link } from "@/components/navigation/link";
import { GuidedSteps, type GuidedStep } from "@/components/forms/guided-steps";
import type { AdmissionNotificationPreferenceMode } from "@/src/modules/notifications/domain/entities/admission-notification-preference";
import type { AdmissionNotificationPreferenceView, AdmissionNotificationEmailSettingsView } from "@/src/modules/notifications/application/results/admission-notification-settings-result";
import type { AdmissionNotificationEmailSettingsDraft } from "@/src/modules/notifications/application/commands/admission-notification-email-settings-draft";
import { ADMISSION_NOTIFICATION_PREFERENCE_MODE as MODE } from "@/src/modules/notifications/constants/admission-notification-preference";
import { ADMISSION_NOTIFICATION_SETTINGS_TIME_ZONE_MAX_LENGTH } from "@/src/modules/notifications/constants/admission-notification-settings-http";
import { ADMISSION_NOTIFICATION_TIME_ZONE_HELP, ADMISSION_NOTIFICATION_PREFERENCE_OPTIONS as OPTIONS, ADMISSION_NOTIFICATION_PREFERENCE_SUMMARY as SUMMARY, ADMISSION_NOTIFICATION_EMAIL_PLAN_LABEL, ADMISSION_NOTIFICATION_PREFERENCE_PLAN_LABEL } from "@/src/modules/notifications/constants/admission-notification-settings-options";
import { ADMISSION_NOTIFICATION_SETTINGS_COPY as COPY, ADMISSION_NOTIFICATION_SETTINGS_EMAIL_PLAN as EMAIL_PLAN, ADMISSION_NOTIFICATION_SETTINGS_GUIDED_STEP as GUIDED_STEP, ADMISSION_NOTIFICATION_SETTINGS_SAVE_STEP as SAVE_STEP, type AdmissionNotificationSettingsEmailPlan, type AdmissionNotificationSettingsSaveStep } from "@/src/modules/notifications/constants/admission-notification-settings-browser";
import { isKnownTimeZone } from "@/lib/date-time/time-zone";
import { PlatformSecurityNotice } from "@/components/academy-admissions/platform-security-notice";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import styles from "./styles.module.scss";

/** What the final save writes: the tribe email outcome and whether the personal preference changes. */
export type AdmissionNotificationSettingsPlan = { email: AdmissionNotificationSettingsEmailPlan; preference: boolean };

/** All private state and side effects remain owned by the route container. */
export type AdmissionNotificationSettingsProps = {
  /** Saved personal preference. */
  preference: AdmissionNotificationPreferenceView;
  /** Chosen frequency, saved or not. */
  mode: AdmissionNotificationPreferenceMode;
  /** Saved tribe email; null when the viewer is not the tribe leader. */
  email: AdmissionNotificationEmailSettingsView | null;
  /** Edited tribe email fields. */
  draft: AdmissionNotificationEmailSettingsDraft;
  /** Whether the tribe sends admission email, or null when this viewer cannot know it. */
  tribeEmailEnabled: boolean | null;
  /** Why the platform cannot protect a tribe email change right now; null when it can or the viewer cannot configure that email. */
  platformRequirement: PlatformSecurityRequirement | null;
  plan: AdmissionNotificationSettingsPlan;
  /** True shows the steps (or the member form); false shows the saved summary. */
  editing: boolean;
  /** Zero-based active guided step of the leader. */
  step: number;
  busy: boolean;
  /** True until the current state is read again after an uncertain or rejected write. */
  disabled: boolean;
  confirmed: boolean;
  /** An original tribe email command is retained for recovery. */
  pending: boolean;
  /** The write in flight inside the chained save. */
  saving: AdmissionNotificationSettingsSaveStep | null;
  error: string | null;
  status: string | null;
  /** What remained saved or pending after a partial save. */
  progress: string | null;
  /** Whether there is a saved state to go back to without saving. */
  canCancel: boolean;
  messagingHref: string;
  onMode: (mode: AdmissionNotificationPreferenceMode) => void;
  onDraft: (draft: AdmissionNotificationEmailSettingsDraft) => void;
  onConfirm: (confirmed: boolean) => void;
  onStep: (index: number) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onRead: () => void;
};

/** Tone of the tribe email marker: a new write informs, a retained original warns. */
const EMAIL_PLAN_TONE = { unchanged: "neutral", save: "info", retry: "warning", blocked: "warning" } satisfies Record<AdmissionNotificationSettingsEmailPlan, BadgeTone>;

/** @param mode - A known frequency. @returns Its visible option label. */
function modeLabel(mode: AdmissionNotificationPreferenceMode): string {
  return OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

/** @param value - Value reported by the radio group. @returns The matching frequency, or null for an unknown value. */
function toMode(value: string): AdmissionNotificationPreferenceMode | null {
  return OPTIONS.find((option) => option.value === value)?.value ?? null;
}

/** @param plan - Current save plan. @returns Whether the final save writes anything. */
function hasPlannedWrite(plan: AdmissionNotificationSettingsPlan): boolean {
  return plan.preference || plan.email === EMAIL_PLAN.save || plan.email === EMAIL_PLAN.retry;
}

/** @param props - Current state. @param needsConsent - Whether the save requires the review confirmation. @returns Why the save cannot run yet, or undefined while it can (or while another request is in flight). */
function saveBlockedReason(props: AdmissionNotificationSettingsProps, needsConsent: boolean): string | undefined {
  if (props.busy) return undefined;
  if (props.disabled) return COPY.staleRead;
  if (!hasPlannedWrite(props.plan)) return props.plan.email === EMAIL_PLAN.blocked ? COPY.emailOriginalBlocked : COPY.noChanges;
  return needsConsent && !props.confirmed ? COPY.confirmRequired : undefined;
}

/** @param saving - The save step in flight, if any. @returns The progress line of that step, empty while nothing saves. */
function savingCopy(saving: AdmissionNotificationSettingsSaveStep | null): string {
  if (saving === SAVE_STEP.email) return COPY.savingEmail;
  return saving === SAVE_STEP.preference ? COPY.savingPreference : "";
}

/** @param props - Save step and feedback. @returns The announced save progress, error, partial result and success lines. */
function Feedback({ saving, error, progress, status }: Pick<AdmissionNotificationSettingsProps, "saving" | "error" | "progress" | "status">) {
  const savingText = savingCopy(saving);
  return <>
    <p role="status" className={saving ? styles.AdmissionNotificationSettings__note : styles.AdmissionNotificationSettings__hidden}>{savingText}</p>
    {error && <p role="alert" className={styles.AdmissionNotificationSettings__error}>{error}</p>}
    {progress && <p role="status" className={styles.AdmissionNotificationSettings__note}>{progress}</p>}
    {status && <p role="status" className={styles.AdmissionNotificationSettings__success}>{status}</p>}
  </>;
}

/** @param props - Chosen frequency and busy state. @returns The frequency choice with the omitted warning. */
function FrequencyField({ mode, busy, onMode }: Pick<AdmissionNotificationSettingsProps, "mode" | "busy" | "onMode">) {
  return <div className={styles.AdmissionNotificationSettings__fields}>
    <RadioGroup label="Frecuencia" value={mode} options={OPTIONS.map((option) => ({ ...option, disabled: busy }))} onValueChange={(value) => { const next = toMode(value); if (next) onMode(next); }} />
    {mode === MODE.omitted && <Alert tone="warning" title="No vas a recibir correos de revisión">Vas a ver los avisos sólo dentro de TuTribu. Elegí otra frecuencia si querés recibirlos por correo.</Alert>}
  </div>;
}

/** @param props - Whether the tribe sends admission email, when known. @returns The member notice that their email depends on the tribe. */
function MemberTribeNotice({ tribeEmailEnabled }: Pick<AdmissionNotificationSettingsProps, "tribeEmailEnabled">) {
  if (tribeEmailEnabled === true) return null;
  return tribeEmailEnabled === false
    ? <Alert tone="info" title="La tribu todavía no habilitó el correo de admisión">No vas a recibir correos hasta que lo haga.</Alert>
    : <Alert tone="info" title="El correo de admisión lo habilita el líder de la tribu">Si todavía no lo habilitó, no vas a recibir correos hasta que lo haga.</Alert>;
}

/** @param props - Recovery state and platform requirement. @returns Whether the tribe email fields cannot be edited: an original waits to be retried as it was sent, or the platform cannot protect a change. */
function isTribeEmailLocked({ pending, platformRequirement }: Pick<AdmissionNotificationSettingsProps, "pending" | "platformRequirement">): boolean {
  return pending || platformRequirement !== null;
}

/** @param props - Platform requirement of the tribe email. @returns The block that says only the TuTribu team can resolve it, or nothing while the platform can protect a change. */
function TribeEmailPlatformNotice({ platformRequirement }: Pick<AdmissionNotificationSettingsProps, "platformRequirement">) {
  return platformRequirement ? <PlatformSecurityNotice requirement={platformRequirement} consequence={COPY.platformConsequence} /> : null;
}

/**
 * @param draft - Edited tribe email settings.
 * @param locked - Whether the fields cannot be edited (a retained original or a platform requirement).
 * @returns Why the zone blocks the step (missing, or a name the runtime does not recognize), or `null`; checked here so a
 * mistyped zone is caught next to its field instead of failing at the final save.
 */
function describeZoneProblem(draft: AdmissionNotificationSettingsProps["draft"], locked: boolean): string | null {
  const zone = draft.timeZone.trim();
  if (!draft.enabled || locked) return null;
  if (!zone) return COPY.zoneRequired;
  return isKnownTimeZone(zone) ? null : COPY.zoneUnknown;
}

/** @param problem - What blocks the zone. @returns The short reason shown beside «Continuar»; the field already explains an unknown zone. */
function zoneBlockedReason(problem: string | null): string | undefined {
  if (!problem) return undefined;
  return problem === COPY.zoneUnknown ? COPY.zoneFix : problem;
}

/** @param props - Edited email fields, recovery state and platform requirement. @returns The tribe email switch, its zone and the messaging requirement, locked while the platform cannot protect a change. */
function TribeEmailFields({ draft, pending, platformRequirement, messagingHref, onDraft }: Pick<AdmissionNotificationSettingsProps, "draft" | "pending" | "platformRequirement" | "messagingHref" | "onDraft">) {
  const locked = isTribeEmailLocked({ pending, platformRequirement });
  const zoneHelpId = useId(), zoneErrorId = useId(), zoneProblem = describeZoneProblem(draft, locked), zoneUnknown = zoneProblem === COPY.zoneUnknown;
  return <div className={styles.AdmissionNotificationSettings__fields}>
    <TribeEmailPlatformNotice platformRequirement={platformRequirement} />
    <Checkbox label="Habilitar correo de admisión" description="Se aplica a las solicitudes nuevas y respeta la frecuencia que elija cada responsable." checked={draft.enabled} disabled={locked} onCheckedChange={(checked) => onDraft({ ...draft, enabled: checked === true })} />
    {/* Plain help instead of the field's animated description, which splits "09:00" into rolling digits and is read twice. */}
    {draft.enabled && <div className={styles.AdmissionNotificationSettings__zone}>
      <Input label="Zona horaria de la tribu" description={undefined} error={undefined} value={draft.timeZone} disabled={locked} maxLength={ADMISSION_NOTIFICATION_SETTINGS_TIME_ZONE_MAX_LENGTH} aria-describedby={zoneUnknown ? `${zoneHelpId} ${zoneErrorId}` : zoneHelpId} aria-invalid={zoneProblem ? true : undefined} onChange={(event) => onDraft({ ...draft, timeZone: event.target.value })} />
      <p id={zoneHelpId} className={styles.AdmissionNotificationSettings__help}>{ADMISSION_NOTIFICATION_TIME_ZONE_HELP}</p>
      {/* A plain row, like the help: the field's animated error row would announce the message twice. */}
      {zoneUnknown && <p id={zoneErrorId} role="alert" className={styles.AdmissionNotificationSettings__error}>{COPY.zoneUnknown}</p>}
    </div>}
    <p className={styles.AdmissionNotificationSettings__note}>Para enviar correos, la tribu necesita un correo preparado en mensajería. <Link href={messagingHref}>Revisar mensajería</Link></p>
    {pending && <p className={styles.AdmissionNotificationSettings__note}>Este cambio quedó pendiente. Lo vas a poder reintentar en el último paso, con la misma referencia.</p>}
  </div>;
}

/** @param draft - Tribe email draft. @param mode - Chosen review notification mode. @returns What the leader will receive once saved. */
function reviewOutcome(draft: AdmissionNotificationSettingsProps["draft"], mode: AdmissionNotificationSettingsProps["mode"]): string {
  if (mode === MODE.omitted) return SUMMARY[MODE.omitted];
  return draft.enabled ? SUMMARY[mode] : "Con el correo de la tribu deshabilitado no vas a recibir correos de revisión.";
}

/** @param props - Drafts, plan, platform requirement and consent. @returns A readable summary of what will be saved, why the tribe email cannot change when the platform blocks it, and the single confirmation. */
function ReviewSummary({ draft, mode, plan, platformRequirement, confirmed, onConfirm }: Pick<AdmissionNotificationSettingsProps, "draft" | "mode" | "plan" | "platformRequirement" | "confirmed" | "onConfirm">) {
  const outcome = reviewOutcome(draft, mode);
  return <div className={styles.AdmissionNotificationSettings__fields}>
    <dl className={styles.AdmissionNotificationSettings__facts}>
      <div className={styles.AdmissionNotificationSettings__fact}>
        <dt className={styles.AdmissionNotificationSettings__term}>Correo de la tribu</dt>
        <dd className={styles.AdmissionNotificationSettings__value}>{draft.enabled ? `Habilitado, zona ${draft.timeZone.trim()}` : "Deshabilitado"}<Badge size="sm" tone={EMAIL_PLAN_TONE[plan.email]}>{ADMISSION_NOTIFICATION_EMAIL_PLAN_LABEL[plan.email]}</Badge></dd>
      </div>
      <div className={styles.AdmissionNotificationSettings__fact}>
        <dt className={styles.AdmissionNotificationSettings__term}>Tus avisos</dt>
        <dd className={styles.AdmissionNotificationSettings__value}>{modeLabel(mode)}<Badge size="sm" tone={plan.preference ? "info" : "neutral"}>{plan.preference ? ADMISSION_NOTIFICATION_PREFERENCE_PLAN_LABEL.changed : ADMISSION_NOTIFICATION_PREFERENCE_PLAN_LABEL.unchanged}</Badge></dd>
      </div>
    </dl>
    <TribeEmailPlatformNotice platformRequirement={platformRequirement} />
    <p className={styles.AdmissionNotificationSettings__note}>{outcome}</p>
    <Checkbox label="Revisé el resumen y quiero guardar estos avisos." checked={confirmed} onCheckedChange={(checked) => onConfirm(checked === true)} />
  </div>;
}

/** @param props - Saved state. @returns The summary shown once everything is saved, with the action that opens the steps. */
function SettingsSummary(props: AdmissionNotificationSettingsProps) {
  const titleId = useId(), { email, preference } = props;
  const sentence = props.tribeEmailEnabled === false && preference.mode !== MODE.omitted ? "El correo de la tribu está deshabilitado, así que no recibís correos de revisión." : SUMMARY[preference.mode];
  return <section className={styles.AdmissionNotificationSettings__section} aria-labelledby={titleId}>
    <h2 id={titleId} className={styles.AdmissionNotificationSettings__subtitle}>Tus avisos</h2>
    <dl className={styles.AdmissionNotificationSettings__facts}>
      {email && <div className={styles.AdmissionNotificationSettings__fact}><dt className={styles.AdmissionNotificationSettings__term}>Correo de la tribu</dt><dd className={styles.AdmissionNotificationSettings__value}>{email.enabled ? "Habilitado" : "Deshabilitado"}</dd></div>}
      {email?.enabled && <div className={styles.AdmissionNotificationSettings__fact}><dt className={styles.AdmissionNotificationSettings__term}>Zona horaria</dt><dd className={styles.AdmissionNotificationSettings__value}>{email.timeZone}</dd></div>}
      <div className={styles.AdmissionNotificationSettings__fact}><dt className={styles.AdmissionNotificationSettings__term}>Frecuencia</dt><dd className={styles.AdmissionNotificationSettings__value}>{modeLabel(preference.mode)}</dd></div>
    </dl>
    <p className={styles.AdmissionNotificationSettings__lead}>{sentence}</p>
    {email && <TribeEmailPlatformNotice platformRequirement={props.platformRequirement} />}
    {!email && preference.mode !== MODE.omitted && <MemberTribeNotice tribeEmailEnabled={props.tribeEmailEnabled} />}
    <div className={styles.AdmissionNotificationSettings__actions}><Button variant="primary" onClick={props.onEdit} disabled={props.busy}>Cambiar avisos</Button></div>
    <Feedback saving={props.saving} error={props.error} progress={props.progress} status={props.status} />
  </section>;
}

/** @param props - Current state of a reviewer who is not the leader. @returns One frequency choice saved directly. */
function MemberForm(props: AdmissionNotificationSettingsProps) {
  const titleId = useId(), reason = saveBlockedReason(props, false);
  return <form className={styles.AdmissionNotificationSettings__section} aria-labelledby={titleId} onSubmit={(event) => { event.preventDefault(); if (!reason && !props.busy) props.onSave(); }}>
    <h2 id={titleId} className={styles.AdmissionNotificationSettings__subtitle}>Cómo querés recibir los avisos</h2>
    <p className={styles.AdmissionNotificationSettings__note}>Esta elección es sólo tuya; no cambia la de otros responsables.</p>
    <FrequencyField mode={props.mode} busy={props.busy} onMode={props.onMode} />
    {props.mode !== MODE.omitted && <MemberTribeNotice tribeEmailEnabled={props.tribeEmailEnabled} />}
    <div className={styles.AdmissionNotificationSettings__actions}><Button type="submit" variant="primary" loading={props.saving !== null} disabled={Boolean(reason) || props.busy && props.saving === null}>Guardar avisos</Button></div>
    {reason && <p className={styles.AdmissionNotificationSettings__note}>{reason}</p>}
    <Feedback saving={props.saving} error={props.error} progress={props.progress} status={props.status} />
  </form>;
}

/** @param props - Current state of the tribe leader. @returns Three small steps: tribe email, personal frequency, and review with one save. */
function LeaderSteps(props: AdmissionNotificationSettingsProps) {
  const zoneProblem = describeZoneProblem(props.draft, isTribeEmailLocked(props));
  const steps: GuidedStep[] = [
    { id: GUIDED_STEP.tribeEmail, title: "Correo de la tribu", description: "Habilitalo para que TuTribu envíe por correo los avisos de solicitudes de admisión a quienes las revisan.", content: <TribeEmailFields draft={props.draft} pending={props.pending} platformRequirement={props.platformRequirement} messagingHref={props.messagingHref} onDraft={props.onDraft} />, blockedReason: zoneBlockedReason(zoneProblem) },
    { id: GUIDED_STEP.frequency, title: "Cómo querés recibir los avisos", description: "Elegí la frecuencia de tus correos. Esta elección es sólo tuya.", content: <>
      <FrequencyField mode={props.mode} busy={props.busy} onMode={props.onMode} />
      {!props.draft.enabled && props.mode !== MODE.omitted && <Alert tone="info" title="El correo de la tribu va a quedar deshabilitado">{props.platformRequirement
        ? "Mientras esté deshabilitado nadie recibe correos de revisión. Vas a poder habilitarlo cuando el equipo de TuTribu lo resuelva."
        : "Mientras esté deshabilitado nadie recibe correos de revisión. Podés habilitarlo en el paso anterior."}</Alert>}
    </> },
    { id: GUIDED_STEP.review, title: "Revisá y guardá", description: "Guardamos sólo lo que cambió.", content: <ReviewSummary draft={props.draft} mode={props.mode} plan={props.plan} platformRequirement={props.platformRequirement} confirmed={props.confirmed} onConfirm={props.onConfirm} />, blockedReason: saveBlockedReason(props, true) },
  ];
  return <GuidedSteps label="Configurar avisos de admisión" steps={steps} current={props.step} onCurrentChange={props.onStep} busy={props.busy}
    finalAction={{ label: "Guardar avisos", loading: props.saving !== null, onRun: props.onSave }}
    footer={<Feedback saving={props.saving} error={props.error} progress={props.progress} status={props.status} />} />;
}

/** @param props - Guarded current state, drafts and explicit callbacks. @returns The saved summary outside editing, else the leader's guided steps or the member's frequency form. */
function renderSettingsBody(props: AdmissionNotificationSettingsProps) {
  if (!props.editing) return <SettingsSummary {...props} />;
  return props.email ? <LeaderSteps {...props} /> : <MemberForm {...props} />;
}

/** @param props - Guarded current state, drafts and explicit callbacks. @returns The saved summary, or the guided steps (leader) or the single frequency form (member). */
export function AdmissionNotificationSettings(props: AdmissionNotificationSettingsProps) {
  const unsaved = props.editing && hasPlannedWrite(props.plan);
  return <div className={styles.AdmissionNotificationSettings} aria-busy={props.busy}>
    <p className={styles.AdmissionNotificationSettings__lead}>Elegí cómo te avisamos por correo cuando hay solicitudes de admisión para revisar. Los avisos dentro de TuTribu se mantienen siempre.</p>
    <div className={styles.AdmissionNotificationSettings__toolbar}>
      {unsaved && <Badge tone="warning" size="sm">Cambios sin guardar</Badge>}
      <div className={styles.AdmissionNotificationSettings__toolbarActions}>
        {props.editing && props.canCancel && <Button variant="ghost" size="sm" onClick={props.onCancel} disabled={props.busy}>Cancelar</Button>}
        <Button variant="ghost" size="sm" onClick={props.onRead} disabled={props.busy}>Consultar estado actual</Button>
      </div>
    </div>
    {props.busy && props.saving === null && <p role="status" className={styles.AdmissionNotificationSettings__note}>Consultando los ajustes actuales…</p>}
    {props.pending && <p role="status" className={styles.AdmissionNotificationSettings__callout}>Conservamos el cambio original del correo de la tribu. Consultá su estado antes de empezar otro; los ajustes actuales pueden tener una versión posterior.</p>}
    {renderSettingsBody(props)}
  </div>;
}
