/** Presents the single country/quota owner without auth, provider or HTTP dependencies. @module messaging-usage */
import { useId } from "react";
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "beez-ui";
import type { MessagingUsagePolicyStateDto } from "@/src/modules/messaging/application/results/messaging-public-result-schemas";
import type { MessagingUsageDraft, MessagingUsageCountryChoice } from "@/src/modules/messaging/application/commands/messaging-usage-draft";
import { MESSAGING_USAGE_LIMIT } from "@/src/modules/messaging/constants/messaging-limits";
import { Link } from "@/components/navigation/link";
import styles from "./styles.module.scss";

/** Current state, proposed input, safe validation and explicit interactions are owned by the route container. */
export type MessagingUsageProps = {
  state: MessagingUsagePolicyStateDto; draft: MessagingUsageDraft; countryChoices: readonly MessagingUsageCountryChoice[];
  confirmed: boolean; busy: boolean; canEdit: boolean; validationMessage: string | null; errorMessage: string | null; statusMessage: string | null;
  onChange: (draft: MessagingUsageDraft) => void; onConfirm: (confirmed: boolean) => void; onInitialize: () => void; onSave: () => void; onReloadCurrent: () => void;
  uncertain?: boolean; canRetry?: boolean; onRetryOriginal?: () => void; reauthenticationRequired?: boolean; reauthenticationHref?: string | null; onPrepareReauthentication?: () => void;
};

/** @param props - Safe own data and callback-only workflow. @returns An accessible early usage form that distinguishes saved countries from the proposed draft. */
export function MessagingUsage(props: MessagingUsageProps) {
  const instanceId = useId(), countryId = `${instanceId}-country`, verificationId = `${instanceId}-verification`, notificationId = `${instanceId}-notification`, confirmationId = `${instanceId}-confirmation`, validationId = `${instanceId}-validation`;
  const disabled = !props.canEdit || props.busy, policy = props.state.policy, canSubmit = !disabled && props.confirmed && !props.validationMessage, canInitialize = !disabled && props.confirmed;
  const countryName = (country: string) => props.countryChoices.find((choice) => choice.value === country)?.label ?? country;
  return <section className={styles.MessagingUsage} aria-labelledby={`${instanceId}-title`}>
    <header className={styles.MessagingUsage__header}><h2 id={`${instanceId}-title`} className={styles.MessagingUsage__title}>Países y cupos de mensajería</h2><p>Prepará el uso antes de conectar un canal o solicitar una prueba telefónica.</p></header>
    {!policy && <p role="status">El uso todavía no está configurado. Los valores iniciales no se guardan al abrir esta pantalla.</p>}
    <p role="status">{policy?.allowedCountries.length ? `Países guardados: ${policy.allowedCountries.map(countryName).join(", ")}.` : "Los países vacíos no habilitan envíos telefónicos. El correo conserva sus reglas independientes."}</p>
    {policy && <p>{policy.consumption.verificationToday} códigos y {policy.consumption.notificationToday} avisos consumidos hoy. Cambiar cupos o países no reinicia ese consumo.</p>}
    <form className={styles.MessagingUsage__form} aria-busy={props.busy} onSubmit={(event) => { event.preventDefault(); if (canSubmit && policy) props.onSave(); }}>
      <fieldset className={styles.MessagingUsage__fields} disabled={disabled}>
        <legend className={styles.MessagingUsage__legend}>Borrador de uso</legend>
        <div className={styles.MessagingUsage__field}><label htmlFor={countryId}>Agregar país al borrador</label><Select value="" disabled={disabled} onValueChange={(value) => { if (!props.draft.allowedCountries.includes(value) && props.countryChoices.some((choice) => choice.value === value)) props.onChange({ ...props.draft, allowedCountries: [...props.draft.allowedCountries, value] }); }}><SelectTrigger id={countryId}><SelectValue placeholder="Elegí un país" /></SelectTrigger><SelectContent>{props.countryChoices.filter((choice) => !props.draft.allowedCountries.includes(choice.value)).map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}</SelectContent></Select><p className={styles.MessagingUsage__help}>Los países elegidos se habilitan al guardar. El canal vuelve a comprobar su disponibilidad antes de cada envío.</p></div>
        {props.draft.allowedCountries.length > 0 && <ul className={styles.MessagingUsage__countries} aria-label="Países del borrador">{props.draft.allowedCountries.map((country) => <li className={styles.MessagingUsage__country} key={country}><span>{countryName(country)}</span><Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Quitar ${countryName(country)} del borrador`} onClick={() => props.onChange({ ...props.draft, allowedCountries: props.draft.allowedCountries.filter((selected) => selected !== country) })}>Quitar</Button></li>)}</ul>}
        <div className={styles.MessagingUsage__field}><label htmlFor={verificationId}>Códigos por día</label><Input id={verificationId} type="number" inputMode="numeric" min={0} max={policy?.platformMaximums.verificationDailyLimit ?? MESSAGING_USAGE_LIMIT.verificationDailyMaximum} step={1} value={props.draft.verificationDailyLimit} disabled={disabled} aria-describedby={props.validationMessage ? validationId : undefined} aria-invalid={Boolean(props.validationMessage)} onChange={(event) => props.onChange({ ...props.draft, verificationDailyLimit: event.target.value })} /></div>
        <div className={styles.MessagingUsage__field}><label htmlFor={notificationId}>Avisos por día</label><Input id={notificationId} type="number" inputMode="numeric" min={0} max={policy?.platformMaximums.notificationDailyLimit ?? MESSAGING_USAGE_LIMIT.notificationDailyMaximum} step={1} value={props.draft.notificationDailyLimit} disabled={disabled} onChange={(event) => props.onChange({ ...props.draft, notificationDailyLimit: event.target.value })} /><p className={styles.MessagingUsage__help}>Podés reducir un cupo a cero. Los códigos ya emitidos conservan su validación y los envíos iniciados mantienen su consumo.</p></div>
      </fieldset>
      {props.validationMessage && <p id={validationId} role="alert" className={styles.MessagingUsage__error}>{props.validationMessage}</p>}
      {props.errorMessage && <div role="alert" className={styles.MessagingUsage__error}><p>{props.errorMessage}</p><Button type="button" variant="outline" disabled={props.busy} onClick={props.onReloadCurrent}>Consultar uso actual</Button><p>El borrador se conserva para compararlo antes de confirmar otra vez.</p></div>}
      {!props.canEdit && <p className={styles.MessagingUsage__help}>La edición requiere al líder activo y un estado actual confirmado.</p>}
      <div className={styles.MessagingUsage__confirmation}><Checkbox id={confirmationId} checked={props.confirmed} disabled={disabled} onCheckedChange={(checked) => props.onConfirm(checked === true)} /><label htmlFor={confirmationId}>Revisé los países y cupos y quiero confirmar esta acción.</label></div>
      <div className={styles.MessagingUsage__actions}>{policy ? <Button type="submit" disabled={!canSubmit}>{props.busy ? "Procesando…" : "Guardar países y cupos"}</Button> : <Button type="button" disabled={!canInitialize} onClick={props.onInitialize}>{props.busy ? "Procesando…" : "Iniciar configuración de uso"}</Button>}</div>
      {props.statusMessage && <p role="status">{props.statusMessage}</p>}
      {props.reauthenticationRequired && <section className={styles.MessagingUsage__field} aria-label="Confirmación de Google"><p>Confirmá tu cuenta de Google para esta acción. El borrador y la operación original se conservan; al volver revisá el estado y confirmá nuevamente.</p>{props.reauthenticationHref ? <Link href={props.reauthenticationHref}>Continuar con la confirmación de Google</Link> : <Button type="button" variant="outline" disabled={props.busy} onClick={props.onPrepareReauthentication}>Preparar confirmación con Google</Button>}</section>}
      {props.uncertain && <section className={styles.MessagingUsage__field} aria-label="Recuperar operación original"><p role="status">Todavía no podemos confirmar el guardado. Consultá la operación original antes de repetir.</p><Button type="button" variant="outline" disabled={props.busy} onClick={props.onReloadCurrent}>Consultar operación original</Button>{props.canRetry && <><div className={styles.MessagingUsage__confirmation}><Checkbox id={`${instanceId}-retry`} checked={props.confirmed} disabled={props.busy} onCheckedChange={(checked) => props.onConfirm(checked === true)} /><label htmlFor={`${instanceId}-retry`}>Confirmo reintentar el guardado con sus datos originales.</label></div><Button type="button" disabled={props.busy || !props.confirmed} onClick={props.onRetryOriginal}>Reintentar operación original</Button></>}</section>}
    </form>
  </section>;
}
