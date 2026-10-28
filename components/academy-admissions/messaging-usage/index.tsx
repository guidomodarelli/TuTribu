/** Presents the country and daily quota owner as a current summary plus small guided steps, without auth, provider or HTTP dependencies. @module messaging-usage */
import { useId, type ReactNode } from "react";
import { Button, Checkbox, Input, Select, UsageMeter } from "@golfo/ui";
import { GuidedSteps, type GuidedStep } from "@/components/forms/guided-steps";
import type { MessagingUsagePolicyStateDto } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import type { MessagingUsageDraft, MessagingUsageCountryChoice } from "@/src/modules/messaging/application/commands/messaging-usage-draft";
import type { MessagingQuotaChangeImpact, MessagingUsageChangeImpact } from "@/src/modules/messaging/application/results/messaging-usage-change-impact";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";
import { MESSAGING_USAGE_COUNT_PATTERN, MESSAGING_USAGE_LOW_NOTIFICATION_DAILY_LIMIT, MESSAGING_USAGE_STEP, MESSAGING_USAGE_STEP_ORDER, type MessagingUsageStepId } from "@/src/modules/messaging/constants/messaging-usage";
import styles from "./styles.module.scss";

/** Current state, proposed input, safe feedback and explicit interactions are owned by the route container. */
export type MessagingUsageProps = {
  state: MessagingUsagePolicyStateDto; draft: MessagingUsageDraft; countryChoices: readonly MessagingUsageCountryChoice[];
  /** True while the guided steps are open; the container keeps them open while nothing is configured. */
  editing: boolean;
  /** Zero-based active step, kept by the container so a re-render never loses the place. */
  step: number;
  confirmed: boolean;
  /** Any read or write in flight: controls and navigation wait. */
  busy: boolean;
  /** Only the final write is in flight: the final button shows its spinner. */
  saving: boolean;
  /** Current sub-step of the final write, announced while it runs. */
  progressMessage: string | null;
  canEdit: boolean; validationMessage: string | null; errorMessage: string | null; statusMessage: string | null;
  /** Set when the first configuration was created but the chosen values are not saved yet. */
  partialMessage?: string | null;
  /** True when the final save can be repeated right away from the partial-save notice. */
  canRetrySave?: boolean;
  impact?: MessagingUsageChangeImpact | null;
  uncertain?: boolean; canRetry?: boolean; retryConfirmed?: boolean;
  onChange: (draft: MessagingUsageDraft) => void; onConfirm: (confirmed: boolean) => void; onStepChange: (step: number) => void;
  onStartEditing: () => void; onCancelEditing: () => void; onSave: () => void; onReloadCurrent: () => void;
  onRetryConfirm?: (confirmed: boolean) => void; onRetryOriginal?: () => void;
};

/**
 * Reads a typed daily quota.
 * @param value - Raw field text.
 * @param maximum - Platform ceiling for that quota.
 * @returns The whole number when it is between zero and the maximum, otherwise null.
 */
function readQuota(value: string, maximum: number): number | null {
  if (!MESSAGING_USAGE_COUNT_PATTERN.test(value)) return null;
  const quota = Number(value);
  return quota <= maximum ? quota : null;
}

/** @param count - Amount to show. @param singular - Noun for one. @param plural - Noun for the rest. @returns The amount with its agreeing noun. */
function formatCount(count: number, singular: string, plural: string) { return `${count} ${count === 1 ? singular : plural}`; }

/**
 * Explains what a zero or very low daily notice quota means.
 * @param limit - Valid notice quota, or null while the field is invalid.
 * @returns The consequence to show, or null when the quota is not low.
 */
function describeNoticeQuota(limit: number | null): string | null {
  if (limit === null) return null;
  if (limit === 0) return "Con 0 no se envía ningún aviso por correo o SMS.";
  if (limit < MESSAGING_USAGE_LOW_NOTIFICATION_DAILY_LIMIT) return `Es un cupo muy bajo: con ${formatCount(limit, "aviso", "avisos")} por día, los avisos siguientes no se envían hasta que empieza el día siguiente, a las 21:00 (hora de Argentina).`;
  return null;
}

/**
 * Plain help of a daily quota field. It is rendered as ordinary text instead of the field's animated description,
 * which splits numbers into rolling digits that assistive technology reads one by one.
 * @param maximum - Platform ceiling. @param sentToday - Messages already sent today, when a configuration exists.
 * @returns The help sentence.
 */
function quotaHelp(maximum: number, sentToday: number | undefined): string {
  return `Podés elegir de 0 a ${maximum}, el máximo de la plataforma.${sentToday === undefined ? "" : ` Hoy ya se enviaron ${sentToday}.`}`;
}

/** @param change - Saved and proposed values when a configuration exists. @param proposed - Proposed field text. @returns "De X a Y" when the value changes, otherwise the proposed value. */
function describeQuotaChange(change: MessagingQuotaChangeImpact | undefined, proposed: string) {
  return change && change.previous !== change.proposed ? `De ${change.previous} a ${change.proposed}` : proposed;
}

/** @param choices - Countries the academy may choose. @param country - Country code. @returns Its readable name, or the code when it is not a choice. */
function countryName(choices: readonly MessagingUsageCountryChoice[], country: string): string {
  return choices.find((choice) => choice.value === country)?.label ?? country;
}

/** @param choices - Countries the academy may choose. @param countries - Chosen country codes. @returns Their readable names, or that none is chosen. */
function describeCountries(choices: readonly MessagingUsageCountryChoice[], countries: readonly string[]): string {
  return countries.length ? countries.map((country) => countryName(choices, country)).join(", ") : "Ninguno";
}

/** @param props - Write progress, outcome messages and the retry or reread actions. @returns The announced save progress, success and failure with its next action. */
function UsageFeedback({ props }: { props: MessagingUsageProps }) {
  return <>
    {props.progressMessage && <p role="status" className={styles.MessagingUsage__progress}>{props.progressMessage}</p>}
    {props.statusMessage && <p role="status" className={styles.MessagingUsage__success}>{props.statusMessage}</p>}
    {(props.errorMessage || props.partialMessage) && <div role="alert" className={styles.MessagingUsage__error}>
      {props.partialMessage && <p className={styles.MessagingUsage__errorText}>{props.partialMessage}</p>}
      {props.errorMessage && <p className={styles.MessagingUsage__errorText}>{props.errorMessage}</p>}
      {props.canRetrySave
        ? <Button variant="secondary" size="sm" disabled={props.busy} onClick={props.onSave}>Reintentar guardado</Button>
        : !props.uncertain && <Button variant="secondary" size="sm" disabled={props.busy} onClick={props.onReloadCurrent}>Consultar uso actual</Button>}
    </div>}
  </>;
}

/** @param props - The saved configuration, the country choices and the saved notice warning. @returns The saved countries, quotas, today's meters and versions. */
function SavedUsageSummary({ policy, countryChoices, savedNoticeWarning }: { policy: NonNullable<MessagingUsagePolicyStateDto["policy"]>; countryChoices: readonly MessagingUsageCountryChoice[]; savedNoticeWarning: string | null }) {
  return <>
    <dl className={styles.MessagingUsage__facts}>
      <div className={styles.MessagingUsage__fact}><dt className={styles.MessagingUsage__term}>Países</dt><dd className={styles.MessagingUsage__value}>{describeCountries(countryChoices, policy.allowedCountries)}</dd></div>
      <div className={styles.MessagingUsage__fact}><dt className={styles.MessagingUsage__term}>Códigos de verificación por día</dt><dd className={styles.MessagingUsage__value}>{policy.verificationDailyLimit}</dd></div>
      <div className={styles.MessagingUsage__fact}><dt className={styles.MessagingUsage__term}>Avisos por día</dt><dd className={styles.MessagingUsage__value}>{policy.notificationDailyLimit}</dd></div>
    </dl>
    {policy.allowedCountries.length === 0 && <p className={styles.MessagingUsage__warning}>Sin países guardados no se envía ningún código ni aviso por SMS.</p>}
    {savedNoticeWarning && <p className={styles.MessagingUsage__warning}>{savedNoticeWarning}</p>}
    <div className={styles.MessagingUsage__meters}>
      {[{ id: "codes", label: "Códigos de hoy", segment: "Códigos enviados", used: policy.consumption.verificationToday, limit: policy.verificationDailyLimit, zero: "Códigos de hoy: cupo en cero; no se envía ningún código." },
        { id: "notices", label: "Avisos de hoy", segment: "Avisos enviados", used: policy.consumption.notificationToday, limit: policy.notificationDailyLimit, zero: "Avisos de hoy: cupo en cero; con 0 no se envía ningún aviso por correo o SMS." }].map((quota) => quota.limit > 0
        ? <UsageMeter key={quota.id} className={styles.MessagingUsage__meter} label={quota.label} limit={quota.limit} decimals={0} freeLabel="Disponibles" overLabel="Excedente" segments={[{ id: quota.id, label: quota.segment, value: quota.used }]} />
        : <p key={quota.id} className={styles.MessagingUsage__warning}>{quota.zero}</p>)}
    </div>
    <p className={styles.MessagingUsage__help}>{policy.consumption.verificationToday} códigos y {policy.consumption.notificationToday} avisos consumidos hoy. Cambiar cupos o países no reinicia ese consumo.</p>
    <p className={styles.MessagingUsage__help}>Configuración actual: versión {policy.version}. Máximos de la plataforma: {policy.platformMaximums.verificationDailyLimit} códigos y {policy.platformMaximums.notificationDailyLimit} avisos por día.</p>
  </>;
}

/** @param props - Retry consent and the original operation actions. @param instanceId - Prefix of the field ids. @returns The recovery of a save whose result is unknown. */
function UsageOriginalRecovery({ props, instanceId }: { props: MessagingUsageProps; instanceId: string }) {
  return <section className={styles.MessagingUsage__recovery} aria-label="Recuperar operación original">
    <p role="status" className={styles.MessagingUsage__recoveryText}>Todavía no podemos confirmar el guardado. Consultá la operación original antes de repetir.</p>
    <Button variant="secondary" disabled={props.busy} onClick={props.onReloadCurrent}>Consultar operación original</Button>
    {props.canRetry && <>
      <Checkbox id={`${instanceId}-retry`} checked={props.retryConfirmed ?? false} disabled={props.busy} onCheckedChange={(checked) => props.onRetryConfirm?.(checked === true)} label="Confirmo reintentar el guardado con sus datos originales." />
      <Button variant="primary" disabled={props.busy || !props.retryConfirmed} onClick={props.onRetryOriginal}>Reintentar operación original</Button>
    </>}
  </section>;
}

/** @param props - Draft, change impact and consent. @param instanceId - Prefix of the field ids. @param controlsDisabled - Whether edits wait. @param draftNoticeWarning - Consequence of a low notice quota. @returns What the save changes, its billing impact and the single confirmation. */
function UsageReviewContent({ props, instanceId, controlsDisabled, draftNoticeWarning }: { props: MessagingUsageProps; instanceId: string; controlsDisabled: boolean; draftNoticeWarning: string | null }) {
  const names = (countries: readonly string[]) => countries.map((country) => countryName(props.countryChoices, country)).join(", ");
  return <>
    <dl className={styles.MessagingUsage__facts}>
      <div className={styles.MessagingUsage__fact}><dt className={styles.MessagingUsage__term}>Países</dt><dd className={styles.MessagingUsage__value}>{describeCountries(props.countryChoices, props.draft.allowedCountries)}</dd></div>
      <div className={styles.MessagingUsage__fact}><dt className={styles.MessagingUsage__term}>Códigos de verificación por día</dt><dd className={styles.MessagingUsage__value}>{describeQuotaChange(props.impact?.verification, props.draft.verificationDailyLimit)}</dd></div>
      <div className={styles.MessagingUsage__fact}><dt className={styles.MessagingUsage__term}>Avisos por día</dt><dd className={styles.MessagingUsage__value}>{describeQuotaChange(props.impact?.notification, props.draft.notificationDailyLimit)}</dd></div>
    </dl>
    {props.impact && props.impact.addedCountries.length > 0 && <p className={styles.MessagingUsage__help}>Países que se agregan: {names(props.impact.addedCountries)}.</p>}
    {props.impact && props.impact.removedCountries.length > 0 && <p className={styles.MessagingUsage__help}>Países que se quitan: {names(props.impact.removedCountries)}.</p>}
    {props.impact?.increasesQuota && <p className={styles.MessagingUsage__help}>El aumento permite más envíos, que el proveedor factura a la cuenta del líder.</p>}
    {(props.impact?.reducesQuota || (props.impact?.removedCountries.length ?? 0) > 0) && <p className={styles.MessagingUsage__help}>Los códigos ya enviados siguen valiendo y lo enviado hoy sigue contando para el cupo.</p>}
    {draftNoticeWarning && <p className={styles.MessagingUsage__warning}>{draftNoticeWarning}</p>}
    {!props.state.policy && <p className={styles.MessagingUsage__help}>Al guardar, primero se crea la configuración y enseguida se guarda lo que elegiste.</p>}
    <Checkbox id={`${instanceId}-confirmation`} checked={props.confirmed} disabled={controlsDisabled} onCheckedChange={(checked) => props.onConfirm(checked === true)}
      label={props.impact?.increasesQuota ? "Revisé los países y cupos y confirmo el aumento indicado." : "Revisé los países y cupos y quiero guardarlos."} />
  </>;
}

/** @param props - Draft and country choices. @param instanceId - Prefix of the field ids. @param controlsDisabled - Whether edits wait. @param update - Applies a draft change. @returns The country picker and the chosen countries with their remove actions. */
function UsageCountriesContent({ props, instanceId, controlsDisabled, update }: { props: MessagingUsageProps; instanceId: string; controlsDisabled: boolean; update: (change: Partial<MessagingUsageDraft>) => void }) {
  const chosen = props.draft.allowedCountries;
  return <>
    <p className={styles.MessagingUsage__help}>Sólo reciben mensajes los teléfonos de los países que elijas. Así evitás envíos, que el proveedor cobra, a países que tu academia no atiende. El correo no depende de esta lista.</p>
    <Select value="" disabled={controlsDisabled || props.countryChoices.length === 0} id={`${instanceId}-country`} label="Agregar un país" placeholder="Elegí un país"
      options={props.countryChoices.filter((choice) => !chosen.includes(choice.value))}
      onValueChange={(value) => { if (!chosen.includes(value) && props.countryChoices.some((choice) => choice.value === value)) update({ allowedCountries: [...chosen, value] }); }} />
    {chosen.length > 0
      ? <ul className={styles.MessagingUsage__countries} aria-label="Países elegidos">{chosen.map((country) => <li className={styles.MessagingUsage__country} key={country}>
        <span>{countryName(props.countryChoices, country)}</span>
        <Button variant="ghost" size="sm" disabled={controlsDisabled} aria-label={`Quitar ${countryName(props.countryChoices, country)}`} onClick={() => update({ allowedCountries: chosen.filter((selected) => selected !== country) })}>Quitar</Button>
      </li>)}</ul>
      : <p className={styles.MessagingUsage__warning}>Sin países elegidos no se envía ningún código ni aviso por SMS.</p>}
  </>;
}

/** @param props - Safe own data and callback-only workflow. @returns The current usage summary and, when editing, the guided steps that save countries and daily quotas. */
export function MessagingUsage(props: MessagingUsageProps) {
  const instanceId = useId(), titleId = `${instanceId}-title`, editorTitleId = `${instanceId}-editor-title`, noticeWarningId = `${instanceId}-notice-warning`;
  const verificationHelpId = `${instanceId}-verification-help`, notificationHelpId = `${instanceId}-notification-help`;
  const policy = props.state.policy, controlsDisabled = !props.canEdit || props.busy;
  const verificationMaximum = policy?.platformMaximums.verificationDailyLimit ?? MESSAGING_USAGE_LIMIT.verificationDailyMaximum;
  const notificationMaximum = policy?.platformMaximums.notificationDailyLimit ?? MESSAGING_USAGE_LIMIT.notificationDailyMaximum;
  const verification = readQuota(props.draft.verificationDailyLimit, verificationMaximum);
  const notification = readQuota(props.draft.notificationDailyLimit, notificationMaximum);
  const suggestedNotification = Math.min(MESSAGING_USAGE_LIMIT.notificationDailyDefault, notificationMaximum);
  const draftNoticeWarning = describeNoticeQuota(notification), savedNoticeWarning = policy && policy.notificationDailyLimit > 0 ? describeNoticeQuota(policy.notificationDailyLimit) : null;
  const update = (change: Partial<MessagingUsageDraft>) => props.onChange({ ...props.draft, ...change });

  const feedback: ReactNode = <UsageFeedback props={props} />;

  const reviewBlockedReason = props.validationMessage
    ?? (!props.saving && props.impact && !props.impact.hasChanges ? "Todavía no cambiaste ningún país ni cupo." : null)
    ?? (props.confirmed ? undefined : "Marcá la confirmación para guardar.");

  const stepsById: Record<MessagingUsageStepId, GuidedStep> = {
    countries: {
      id: MESSAGING_USAGE_STEP.countries, title: "Países",
      description: "Elegí a qué países se pueden enviar códigos y avisos por SMS.",
      content: <UsageCountriesContent props={props} instanceId={instanceId} controlsDisabled={controlsDisabled} update={update} />,
    },
    verification: {
      id: MESSAGING_USAGE_STEP.verification, title: "Códigos de verificación por día",
      description: "Cuántos códigos de verificación se pueden enviar como máximo en un día.",
      blockedReason: verification === null ? "Corregí el número para continuar." : undefined,
      content: <>
        <Input type="number" inputMode="numeric" min={0} max={verificationMaximum} step={1} label="Códigos por día" value={props.draft.verificationDailyLimit} disabled={controlsDisabled}
          description={undefined} aria-describedby={verificationHelpId}
          error={verification === null ? `Ingresá un número entero entre 0 y ${verificationMaximum}.` : undefined}
          onChange={(event) => update({ verificationDailyLimit: event.target.value })} />
        <p id={verificationHelpId} className={styles.MessagingUsage__help}>{quotaHelp(verificationMaximum, policy?.consumption.verificationToday)}</p>
      </>,
    },
    notification: {
      id: MESSAGING_USAGE_STEP.notification, title: "Avisos por día",
      description: "Cuántos avisos por correo o SMS se pueden enviar como máximo en un día.",
      blockedReason: notification === null ? "Corregí el número para continuar." : undefined,
      content: <>
        <Input type="number" inputMode="numeric" min={0} max={notificationMaximum} step={1} label="Avisos por día" value={props.draft.notificationDailyLimit} disabled={controlsDisabled}
          description={undefined} aria-describedby={draftNoticeWarning ? `${notificationHelpId} ${noticeWarningId}` : notificationHelpId}
          error={notification === null ? `Ingresá un número entero entre 0 y ${notificationMaximum}.` : undefined}
          onChange={(event) => update({ notificationDailyLimit: event.target.value })} />
        <p id={notificationHelpId} className={styles.MessagingUsage__help}>{quotaHelp(notificationMaximum, policy?.consumption.notificationToday)}</p>
        {draftNoticeWarning && <p id={noticeWarningId} className={styles.MessagingUsage__warning}>{draftNoticeWarning}</p>}
        {notification !== suggestedNotification && <div className={styles.MessagingUsage__suggestion}>
          <p className={styles.MessagingUsage__help}>Sugerencia: {suggestedNotification} avisos por día, el valor inicial de la plataforma.</p>
          <Button variant="ghost" size="sm" disabled={controlsDisabled} onClick={() => update({ notificationDailyLimit: String(suggestedNotification) })}>Usar {suggestedNotification}</Button>
        </div>}
      </>,
    },
    review: {
      id: MESSAGING_USAGE_STEP.review, title: "Revisá y guardá",
      description: policy ? "Esto es lo que va a cambiar." : "Esto es lo que se va a guardar.",
      blockedReason: reviewBlockedReason,
      content: <UsageReviewContent props={props} instanceId={instanceId} controlsDisabled={controlsDisabled} draftNoticeWarning={draftNoticeWarning} />,
    },
  };

  return <div className={styles.MessagingUsage}>
    <section className={styles.MessagingUsage__summary} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.MessagingUsage__title}>Uso actual</h2>
      {policy ? <SavedUsageSummary policy={policy} countryChoices={props.countryChoices} savedNoticeWarning={savedNoticeWarning} /> : <p className={styles.MessagingUsage__lead}>Todavía no hay países ni cupos guardados. Seguí los pasos para elegirlos; nada se guarda hasta el último paso.</p>}
      <p className={styles.MessagingUsage__help}>El proveedor factura los envíos a la cuenta del líder. Los cupos de TuTribu no son una garantía monetaria exacta.</p>
      <p className={styles.MessagingUsage__help}>El consumo se cuenta por día, de 21:00 a 21:00 (hora de Argentina), y no se reinicia al cambiar países, cupos o conexión.</p>
      {!props.editing && <div className={styles.MessagingUsage__actions}><Button variant="primary" disabled={controlsDisabled} onClick={props.onStartEditing}>Cambiar países y cupos</Button></div>}
      {!props.editing && feedback}
    </section>
    {props.uncertain && <UsageOriginalRecovery props={props} instanceId={instanceId} />}
    {props.editing && <section className={styles.MessagingUsage__editor} aria-labelledby={editorTitleId}>
      <div className={styles.MessagingUsage__editorHeader}>
        <h2 id={editorTitleId} className={styles.MessagingUsage__title}>{policy ? "Cambiar países y cupos" : "Configurar países y cupos"}</h2>
        {policy && <Button variant="ghost" size="sm" disabled={props.busy} onClick={props.onCancelEditing}>Cancelar</Button>}
      </div>
      <GuidedSteps label="Pasos para guardar países y cupos" steps={MESSAGING_USAGE_STEP_ORDER.map((id) => stepsById[id])} current={props.step} onCurrentChange={props.onStepChange} busy={props.busy}
        finalAction={{ label: "Guardar países y cupos", loading: props.saving, disabled: !props.canEdit && !props.saving, onRun: props.onSave }} footer={feedback} />
    </section>}
  </div>;
}
