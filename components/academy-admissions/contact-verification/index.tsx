"use client";
/** Presents controlled applicant verification without owning identity, HTTP, deadlines or operation recovery. @module contact-verification */
import { useId, type ReactNode } from "react";
import { Button, Checkbox, Input, Label, Select } from "@golfo/ui";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_PUBLIC_CODE_PATTERN } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGING_CHANNEL_LABEL } from "@/src/modules/messaging/constants/messaging-connection-presentation";
import { MESSAGING_DELIVERY_STATE_LABEL } from "@/src/modules/messaging/constants/messaging-diagnostic-browser";
import { SECONDS_PER_MINUTE } from "@/src/constants/time";
import styles from "./styles.module.scss";

/**
 * @param seconds - Whole seconds left in a countdown.
 * @returns The wait as people read it ("9 min 47 s", "2 minutos", "45 segundos") instead of a raw count of seconds.
 */
function formatContactCountdown(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${seconds} ${seconds === 1 ? "segundo" : "segundos"}`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE), rest = seconds % SECONDS_PER_MINUTE;
  if (rest === 0) return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  return `${minutes} min ${rest} s`;
}

/** Only safe controlled facts enter the presenter; permissions, validation and mutations remain in its container. */
export type ContactVerificationProps = {
  channel: "email" | "sms" | "whatsapp"; phone: string; country: string; verificationCode: string;
  confirmed: boolean; busy: boolean; ready?: boolean; canIssue: boolean; canVerify: boolean; canResend: boolean;
  canUseSmsAlternative: boolean; contactLocked: boolean; allowedCountries: readonly string[];
  challenge: AdmissionChallengeSnapshot | null; challengeUnavailable?: boolean; requiresReplacement?: boolean; proofReady: boolean; proofExpired?: boolean; expiresInSeconds: number | null; resendInSeconds: number | null;
  errorMessage: string | null; feedback: string | null; fieldErrors: Partial<Record<"phone" | "country" | "verificationCode", string>>;
  /**
   * `all` renders the standalone verification with its own buttons. Inside a guided flow, `send` renders the contact
   * and its send confirmation and `verify` renders the code entry; the flow owns their write buttons.
   */
  part?: "all" | "send" | "verify";
  onPhoneChange: (value: string) => void; onCountryChange: (value: string) => void; onCodeChange: (value: string) => void;
  onConfirm: (confirmed: boolean) => void; onIssue: () => void; onResend: () => void; onVerify: () => void; onUseSmsAlternative: () => void;
};

/** Which verification writes the current facts allow, shared by the standalone view and the guided steps. */
export type ContactVerificationAvailability = { phone: boolean; noCountries: boolean; expired: boolean; waiting: boolean; resendInView: boolean; issueBlocked: boolean; verifyBlocked: boolean; resendBlocked: boolean; smsBlocked: boolean; offersSms: boolean };

/** @param props - Current controlled verification facts. @returns Whether each write may run now; the server still checks every rule. */
export function contactVerificationAvailability(props: ContactVerificationProps): ContactVerificationAvailability {
  const phone = props.channel !== MESSAGING_PUBLIC_CHANNEL.email, noCountries = phone && props.allowedCountries.length === 0;
  const controlsBlocked = props.busy || props.ready === false;
  const expired = props.expiresInSeconds !== null && props.expiresInSeconds <= 0;
  const waiting = props.resendInSeconds !== null && props.resendInSeconds > 0;
  return {
    phone, noCountries, expired, waiting,
    // An expired, exhausted or replaced code only moves forward with another send, so that send leaves its disclosure.
    resendInView: Boolean(props.challenge) && !props.proofReady && (expired || Boolean(props.challengeUnavailable) || Boolean(props.requiresReplacement)),
    issueBlocked: controlsBlocked || !props.confirmed || !props.canIssue || noCountries,
    verifyBlocked: controlsBlocked || !props.canVerify || !props.challenge || Boolean(props.challengeUnavailable) || Boolean(props.requiresReplacement) || props.proofReady || Boolean(props.proofExpired) || expired || !ADMISSION_PUBLIC_CODE_PATTERN.test(props.verificationCode),
    resendBlocked: controlsBlocked || !props.confirmed || !props.canResend || noCountries || props.proofReady || waiting,
    smsBlocked: controlsBlocked || !props.confirmed || !props.canUseSmsAlternative || noCountries || props.proofReady || waiting,
    offersSms: props.canUseSmsAlternative && props.challenge?.channel === MESSAGING_PUBLIC_CHANNEL.whatsapp,
  };
}

/** Field ids prefix and derived facts both verification field groups read beside the props. */
type VerificationFieldsProps = { props: ContactVerificationProps; fieldId: string; controlsBlocked: boolean };

/** @param props - Replacement state of the verification. @param expired - Whether the current code expired. @returns The hint under the code field when it has no error. */
function codeHint(props: ContactVerificationProps, expired: boolean): string {
  if (props.requiresReplacement) return "Para esta nueva presentación, confirmá Reenviar código. La prueba anterior no se reutiliza.";
  return expired ? "El campo se habilita cuando llegue el código nuevo." : `Ingresá los ${ADMISSION_LIMIT.verificationCodeDigits} números del código recibido.`;
}

/** @param props - Controlled contact facts, field ids prefix and the phone facts. @returns The contact fields and the send confirmation. */
function SendFields({ props, fieldId, controlsBlocked, phone, noCountries }: VerificationFieldsProps & { phone: boolean; noCountries: boolean }) {
  return <>
  <p className={styles.ContactVerification__description}>Canal configurado: <strong>{MESSAGING_CHANNEL_LABEL[props.channel]}</strong></p>
  {phone ? <div className={styles.ContactVerification__fields}>
    <div className={styles.ContactVerification__field}>
      <Label htmlFor={`${fieldId}-phone`}>Teléfono para este ingreso</Label>
      <Input id={`${fieldId}-phone`} type="tel" autoComplete="tel" value={props.phone} disabled={controlsBlocked || props.contactLocked} aria-invalid={Boolean(props.fieldErrors.phone)} aria-describedby={`${fieldId}-phone-feedback`} onChange={(event) => props.onPhoneChange(event.target.value)} />
      <p id={`${fieldId}-phone-feedback`} className={props.fieldErrors.phone ? styles.ContactVerification__error : styles.ContactVerification__description}>{props.fieldErrors.phone ?? (props.contactLocked ? "El contacto de esta solicitud ya está fijado." : "Usá el prefijo internacional o elegí el país del teléfono.")}</p>
    </div>
    <div className={styles.ContactVerification__field}>
      <Select value={props.country} disabled={controlsBlocked || props.contactLocked || noCountries} onValueChange={props.onCountryChange} id={`${fieldId}-country`} aria-invalid={Boolean(props.fieldErrors.country)} aria-describedby={`${fieldId}-country-feedback`} label="País del teléfono" options={props.allowedCountries.map((country) => ({ value: country, label: country }))} placeholder="Elegí un país habilitado" />
      <p id={`${fieldId}-country-feedback`} className={props.fieldErrors.country || noCountries ? styles.ContactVerification__error : styles.ContactVerification__description}>{props.fieldErrors.country ?? (noCountries ? "La academia todavía no tiene países habilitados para este teléfono. Consultá a sus responsables." : "Se muestran los países configurados por la academia.")}</p>
    </div>
  </div> : <p className={styles.ContactVerification__description}>El código se envía al correo actual de tu cuenta.</p>}
  <div className={styles.ContactVerification__confirmation}>
    <Checkbox id={`${fieldId}-confirm`} checked={props.confirmed} disabled={controlsBlocked} onCheckedChange={(checked) => props.onConfirm(checked === true)} />
    <Label htmlFor={`${fieldId}-confirm`}>Confirmo el contacto y el envío del código para este ingreso.</Label>
  </div>
  <p className={styles.ContactVerification__description}>El envío y el reenvío usan los límites de la academia y de tu cuenta. Una respuesta incierta se consulta antes de repetir la operación.</p>
</>;
}

/** @param props - Controlled code facts, field ids prefix and the code timing facts. @returns The code field with its expiry and proof notices. */
function CodeFields({ props, fieldId, controlsBlocked, expired, waiting }: VerificationFieldsProps & { expired: boolean; waiting: boolean }) {
  return <>
  <div className={styles.ContactVerification__field}>
    <Label htmlFor={`${fieldId}-code`}>Código de ingreso</Label>
    <Input id={`${fieldId}-code`} className={styles.ContactVerification__code} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={ADMISSION_LIMIT.verificationCodeDigits} value={props.verificationCode} disabled={controlsBlocked || expired || props.proofExpired || props.challengeUnavailable || props.requiresReplacement} aria-invalid={Boolean(props.fieldErrors.verificationCode)} aria-describedby={`${fieldId}-code-feedback`} onChange={(event) => props.onCodeChange(event.target.value)} />
    <p id={`${fieldId}-code-feedback`} className={props.fieldErrors.verificationCode ? styles.ContactVerification__error : styles.ContactVerification__description}>{props.fieldErrors.verificationCode ?? codeHint(props, expired)}</p>
  </div>
  {/* The expiry is a state of the code, not an input error: a quiet status next to the resend that ends it. */}
  {expired && !props.requiresReplacement && <p role="status" className={styles.ContactVerification__notice}>{waiting ? "El código venció. Cuando termine la espera, reenviá uno nuevo para seguir." : "El código venció. Reenviá uno nuevo para seguir."}</p>}
  {props.proofExpired && <p role="status" className={styles.ContactVerification__error}>La prueba venció. Reenviá un código para el mismo contacto antes de continuar.</p>}
  {props.expiresInSeconds !== null && !expired && <p className={styles.ContactVerification__description}>Vence en {formatContactCountdown(props.expiresInSeconds)}.</p>}
</>;
}

/** @param props - Seconds left before a resend is allowed. @returns When the code can be resent, or nothing when it can already. */
function ResendCountdown({ resendInSeconds }: { resendInSeconds: number | null }) {
  return resendInSeconds !== null && resendInSeconds > 0 && <p className={styles.ContactVerification__description}>Podés reenviar en {formatContactCountdown(resendInSeconds)}.</p>;
}

/** @param props - Controlled proof state, whether a guided flow owns the buttons, the code fields and resend actions. @returns The proven notice, the guided code entry, or the standalone code form with its own buttons. */
function CodeEntry({ props, guided, codeFields, resendActions, verifyBlocked }: { props: ContactVerificationProps; guided: boolean; codeFields: ReactNode; resendActions: ReactNode; verifyBlocked: boolean }) {
  if (props.proofReady) return <p role="status" className={styles.ContactVerification__success}>Código comprobado para este ingreso.</p>;
  if (guided) return <div className={styles.ContactVerification__form}>{codeFields}<ResendCountdown resendInSeconds={props.resendInSeconds} /></div>;
  return <form className={styles.ContactVerification__form} onSubmit={(event) => { event.preventDefault(); if (!verifyBlocked) props.onVerify(); }}>
    {codeFields}
    <div className={styles.ContactVerification__actions}>
      <Button type="submit" disabled={verifyBlocked}>{props.busy ? "Comprobando código…" : "Comprobar código"}</Button>
      {resendActions}
    </div>
    <ResendCountdown resendInSeconds={props.resendInSeconds} />
  </form>;
}

/** @param props - Current controlled proposal, original challenge and derived blocking state. @returns Explicit accessible actions with private controls excluded from feedback screenshots; rendering and changing fields never send a message. */
export function ContactVerification(props: ContactVerificationProps) {
  const fieldId = useId(), part = props.part ?? "all", guided = part !== "all";
  const { phone, noCountries, expired, waiting, issueBlocked, verifyBlocked, resendBlocked, smsBlocked, offersSms } = contactVerificationAvailability(props);
  const controlsBlocked = props.busy || props.ready === false;
  const showSend = part !== "verify", showVerify = part !== "send" && Boolean(props.challenge);
  const sendFields = <SendFields props={props} fieldId={fieldId} controlsBlocked={controlsBlocked} phone={phone} noCountries={noCountries} />;
  const codeFields = <CodeFields props={props} fieldId={fieldId} controlsBlocked={controlsBlocked} expired={expired} waiting={waiting} />;
  const resendActions = <>
    <Button type="button" variant="secondary" disabled={resendBlocked} onClick={() => { if (!resendBlocked) props.onResend(); }}>Reenviar código</Button>
    {offersSms && <Button type="button" variant="secondary" disabled={smsBlocked} onClick={() => { if (!smsBlocked) props.onUseSmsAlternative(); }}>Usar SMS para el mismo teléfono</Button>}
  </>;

  return <section className={styles.ContactVerification} aria-labelledby={`${fieldId}-title`} aria-busy={controlsBlocked} data-beezping-ignore="true">
    <header className={guided ? styles.ContactVerification__hiddenHeader : styles.ContactVerification__header}>
      <h3 id={`${fieldId}-title`} className={styles.ContactVerification__title}>Comprobar contacto para el ingreso</h3>
      {!guided && <>
        <p className={styles.ContactVerification__description}>El código comprueba el contacto para esta academia. El ingreso se confirma después de presentar la solicitud o aplicar la prueba a tu pendiente.</p>
        <p className={styles.ContactVerification__description}>Los códigos se envían con el servicio de mensajería conectado por el líder de esta academia.</p>
        <p className={styles.ContactVerification__description}>Comprobar el contacto no acredita tu identidad civil ni tu pertenencia a un grupo de WhatsApp. El envío depende de la cuenta de mensajería de la academia.</p>
      </>}
    </header>
    {guided && part === "send" && <div className={styles.ContactVerification__header}>
      <p className={styles.ContactVerification__description}>Los códigos se envían con el servicio de mensajería conectado por el líder de esta academia.</p>
      <p className={styles.ContactVerification__description}>Comprobar el contacto no acredita tu identidad civil ni tu pertenencia a un grupo de WhatsApp. El envío depende de la cuenta de mensajería de la academia.</p>
    </div>}
    {props.ready === false && <p role="status" className={styles.ContactVerification__description}>Comprobando la cuenta y recuperando las referencias del contacto…</p>}
    {showSend && (guided
      ? <div className={styles.ContactVerification__form}>{sendFields}</div>
      : <form className={styles.ContactVerification__form} onSubmit={(event) => { event.preventDefault(); if (!issueBlocked) props.onIssue(); }}>
        {sendFields}
        {!props.challenge && !props.proofReady && <Button type="submit" disabled={issueBlocked}>{props.busy ? "Enviando código…" : "Enviar código de ingreso"}</Button>}
      </form>)}
    {guided && part === "send" && props.challenge && <p role="status" className={styles.ContactVerification__description}>Ya hay un código enviado para este ingreso. Continuá para comprobarlo.</p>}
    {showVerify && props.challenge && <>
      <dl className={styles.ContactVerification__facts}>
        <div className={styles.ContactVerification__fact}><dt>Canal del código</dt><dd>{MESSAGING_CHANNEL_LABEL[props.challenge.channel]}</dd></div>
        <div className={styles.ContactVerification__fact}><dt>Destino del código</dt><dd>{props.challenge.maskedDestination}</dd></div>
        <div className={styles.ContactVerification__fact}><dt>Estado del envío</dt><dd>{MESSAGING_DELIVERY_STATE_LABEL[props.challenge.deliveryState]}</dd></div>
      </dl>
      <p className={styles.ContactVerification__description}>El estado del envío y la comprobación del código son resultados separados.</p>
      <CodeEntry props={props} guided={guided} codeFields={codeFields} resendActions={resendActions} verifyBlocked={verifyBlocked} />
    </>}
    {props.feedback && <p role="status" className={styles.ContactVerification__description}>{props.feedback}</p>}
    {props.errorMessage && <p role="alert" className={styles.ContactVerification__error}>{props.errorMessage}</p>}
  </section>;
}

/**
 * @param props - The same controlled facts as the verification.
 * @returns The send confirmation, resend and the SMS alternative, for a guided code step: a new send needs its own confirmation.
 */
export function ContactVerificationResendActions(props: ContactVerificationProps) {
  const fieldId = useId(), { resendBlocked, smsBlocked, offersSms } = contactVerificationAvailability(props);
  return <>
    <div className={styles.ContactVerification__confirmation}>
      <Checkbox id={`${fieldId}-resend-confirm`} checked={props.confirmed} disabled={props.busy || props.ready === false} onCheckedChange={(checked) => props.onConfirm(checked === true)} />
      <Label htmlFor={`${fieldId}-resend-confirm`}>Confirmo el contacto y el envío del código para este ingreso.</Label>
    </div>
    <Button type="button" variant="secondary" size="sm" disabled={resendBlocked} onClick={() => { if (!resendBlocked) props.onResend(); }}>Reenviar código</Button>
    {offersSms && <Button type="button" variant="secondary" size="sm" disabled={smsBlocked} onClick={() => { if (!smsBlocked) props.onUseSmsAlternative(); }}>Usar SMS para el mismo teléfono</Button>}
  </>;
}
