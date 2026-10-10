"use client";
/** Presents controlled applicant verification without owning identity, HTTP, deadlines or operation recovery. @module contact-verification */
import { useId } from "react";
import { Button, Checkbox, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "beez-ui";
import type { AdmissionChallengeSnapshot } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { ADMISSION_PUBLIC_CODE_PATTERN } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGING_CHANNEL_LABEL } from "@/src/modules/messaging/constants/messaging-connection-presentation";
import { MESSAGING_DELIVERY_STATE_LABEL } from "@/src/modules/messaging/constants/messaging-diagnostic-browser";
import styles from "./styles.module.scss";

/** Only safe controlled facts enter the presenter; permissions, validation and mutations remain in its container. */
export type ContactVerificationProps = {
  channel: "email" | "sms" | "whatsapp"; phone: string; country: string; verificationCode: string;
  confirmed: boolean; busy: boolean; ready?: boolean; canIssue: boolean; canVerify: boolean; canResend: boolean;
  canUseSmsAlternative: boolean; contactLocked: boolean; allowedCountries: readonly string[];
  challenge: AdmissionChallengeSnapshot | null; proofReady: boolean; proofExpired?: boolean; expiresInSeconds: number | null; resendInSeconds: number | null;
  errorMessage: string | null; feedback: string | null; fieldErrors: Partial<Record<"phone" | "country" | "verificationCode", string>>;
  onPhoneChange: (value: string) => void; onCountryChange: (value: string) => void; onCodeChange: (value: string) => void;
  onConfirm: (confirmed: boolean) => void; onIssue: () => void; onResend: () => void; onVerify: () => void; onUseSmsAlternative: () => void;
};

/** @param props - Current controlled proposal, original challenge and derived blocking state. @returns Explicit accessible actions; rendering and changing fields never send a message. */
export function ContactVerification(props: ContactVerificationProps) {
  const fieldId = useId(), phone = props.channel !== MESSAGING_PUBLIC_CHANNEL.email, noCountries = phone && props.allowedCountries.length === 0;
  const controlsBlocked = props.busy || props.ready === false;
  const expired = props.expiresInSeconds !== null && props.expiresInSeconds <= 0;
  const issueBlocked = controlsBlocked || !props.confirmed || !props.canIssue || noCountries;
  const verifyBlocked = controlsBlocked || !props.canVerify || !props.challenge || props.proofReady || props.proofExpired || expired || !ADMISSION_PUBLIC_CODE_PATTERN.test(props.verificationCode);
  const resendBlocked = controlsBlocked || !props.confirmed || !props.canResend || noCountries || props.proofReady || props.resendInSeconds !== null && props.resendInSeconds > 0;
  const smsBlocked = controlsBlocked || !props.confirmed || !props.canUseSmsAlternative || noCountries || props.proofReady || props.resendInSeconds !== null && props.resendInSeconds > 0;
  return <section className={styles.ContactVerification} aria-labelledby={`${fieldId}-title`} aria-busy={controlsBlocked}>
    <header className={styles.ContactVerification__header}>
      <h3 id={`${fieldId}-title`} className={styles.ContactVerification__title}>Comprobar contacto para el ingreso</h3>
      <p className={styles.ContactVerification__description}>El código comprueba el contacto para esta academia. El ingreso se confirma después de presentar la solicitud o aplicar la prueba a tu pendiente.</p>
      <p className={styles.ContactVerification__description}>Los códigos se envían con el servicio de mensajería conectado por el líder de esta academia.</p>
      <p className={styles.ContactVerification__description}>Comprobar el contacto no acredita tu identidad civil ni tu pertenencia a un grupo de WhatsApp. El envío depende de la cuenta de mensajería de la academia.</p>
    </header>
    {props.ready === false && <p role="status" className={styles.ContactVerification__description}>Comprobando la cuenta y recuperando las referencias del contacto…</p>}
    <form className={styles.ContactVerification__form} onSubmit={(event) => { event.preventDefault(); if (!issueBlocked) props.onIssue(); }}>
      <p className={styles.ContactVerification__description}>Canal configurado: <strong>{MESSAGING_CHANNEL_LABEL[props.channel]}</strong></p>
      {phone ? <div className={styles.ContactVerification__fields}>
        <div className={styles.ContactVerification__field}>
          <Label htmlFor={`${fieldId}-phone`}>Teléfono para este ingreso</Label>
          <Input id={`${fieldId}-phone`} type="tel" autoComplete="tel" value={props.phone} disabled={controlsBlocked || props.contactLocked} aria-invalid={Boolean(props.fieldErrors.phone)} aria-describedby={`${fieldId}-phone-feedback`} onChange={(event) => props.onPhoneChange(event.target.value)} />
          <p id={`${fieldId}-phone-feedback`} className={props.fieldErrors.phone ? styles.ContactVerification__error : styles.ContactVerification__description}>{props.fieldErrors.phone ?? (props.contactLocked ? "El contacto de esta solicitud ya está fijado." : "Usá el prefijo internacional o elegí el país del teléfono.")}</p>
        </div>
        <div className={styles.ContactVerification__field}>
          <Label htmlFor={`${fieldId}-country`}>País del teléfono</Label>
          <Select value={props.country || undefined} disabled={controlsBlocked || props.contactLocked || noCountries} onValueChange={props.onCountryChange}>
            <SelectTrigger id={`${fieldId}-country`} aria-invalid={Boolean(props.fieldErrors.country)} aria-describedby={`${fieldId}-country-feedback`}><SelectValue placeholder="Elegí un país habilitado" /></SelectTrigger>
            <SelectContent>{props.allowedCountries.map((country) => <SelectItem key={country} value={country}>{country}</SelectItem>)}</SelectContent>
          </Select>
          <p id={`${fieldId}-country-feedback`} className={props.fieldErrors.country || noCountries ? styles.ContactVerification__error : styles.ContactVerification__description}>{props.fieldErrors.country ?? (noCountries ? "La academia todavía no tiene países habilitados para este teléfono. Consultá a sus responsables." : "Se muestran los países configurados por la academia.")}</p>
        </div>
      </div> : <p className={styles.ContactVerification__description}>El código se envía al correo actual de tu cuenta.</p>}
      <div className={styles.ContactVerification__confirmation}>
        <Checkbox id={`${fieldId}-confirm`} checked={props.confirmed} disabled={controlsBlocked} onCheckedChange={(checked) => props.onConfirm(checked === true)} />
        <Label htmlFor={`${fieldId}-confirm`}>Confirmo el contacto y el envío del código para este ingreso.</Label>
      </div>
      <p className={styles.ContactVerification__description}>El envío y el reenvío usan los límites de la academia y de tu cuenta. Una respuesta incierta se consulta antes de repetir la operación.</p>
      {!props.challenge && !props.proofReady && <Button type="submit" disabled={issueBlocked}>{props.busy ? "Enviando código…" : "Enviar código de ingreso"}</Button>}
    </form>
    {props.challenge && <>
      <dl className={styles.ContactVerification__facts}>
        <div className={styles.ContactVerification__fact}><dt>Destino del código</dt><dd>{props.challenge.maskedDestination}</dd></div>
        <div className={styles.ContactVerification__fact}><dt>Estado del envío</dt><dd>{MESSAGING_DELIVERY_STATE_LABEL[props.challenge.deliveryState]}</dd></div>
      </dl>
      <p className={styles.ContactVerification__description}>El estado del envío y la comprobación del código son resultados separados.</p>
      {props.proofReady ? <p role="status" className={styles.ContactVerification__success}>Código comprobado para este ingreso.</p> : <form className={styles.ContactVerification__form} onSubmit={(event) => { event.preventDefault(); if (!verifyBlocked) props.onVerify(); }}>
        <div className={styles.ContactVerification__field}>
          <Label htmlFor={`${fieldId}-code`}>Código de ingreso</Label>
          <Input id={`${fieldId}-code`} className={styles.ContactVerification__code} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={ADMISSION_LIMIT.verificationCodeDigits} value={props.verificationCode} disabled={controlsBlocked || expired || props.proofExpired} aria-invalid={Boolean(props.fieldErrors.verificationCode)} aria-describedby={`${fieldId}-code-feedback`} onChange={(event) => props.onCodeChange(event.target.value)} />
          <p id={`${fieldId}-code-feedback`} className={props.fieldErrors.verificationCode || expired ? styles.ContactVerification__error : styles.ContactVerification__description}>{props.fieldErrors.verificationCode ?? (expired ? "El código venció. Podés solicitar otro cuando termine la espera." : `Ingresá los ${ADMISSION_LIMIT.verificationCodeDigits} números del código recibido.`)}</p>
        </div>
        {props.proofExpired && <p role="status" className={styles.ContactVerification__error}>La prueba venció. Reenviá un código para el mismo contacto antes de continuar.</p>}
        {props.expiresInSeconds !== null && !expired && <p className={styles.ContactVerification__description}>Vence en {props.expiresInSeconds} segundos.</p>}
        <div className={styles.ContactVerification__actions}>
          <Button type="submit" disabled={verifyBlocked}>{props.busy ? "Comprobando código…" : "Comprobar código"}</Button>
          <Button type="button" variant="outline" disabled={resendBlocked} onClick={() => { if (!resendBlocked) props.onResend(); }}>Reenviar código</Button>
          {props.canUseSmsAlternative && props.challenge.channel === MESSAGING_PUBLIC_CHANNEL.whatsapp && <Button type="button" variant="outline" disabled={smsBlocked} onClick={() => { if (!smsBlocked) props.onUseSmsAlternative(); }}>Usar SMS para el mismo teléfono</Button>}
        </div>
        {props.resendInSeconds !== null && props.resendInSeconds > 0 && <p className={styles.ContactVerification__description}>Podés reenviar en {props.resendInSeconds} segundos.</p>}
      </form>}
    </>}
    {props.feedback && <p role="status" className={styles.ContactVerification__description}>{props.feedback}</p>}
    {props.errorMessage && <p role="alert" className={styles.ContactVerification__error}>{props.errorMessage}</p>}
  </section>;
}
