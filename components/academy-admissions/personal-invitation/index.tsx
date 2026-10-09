"use client";
/** Presents controlled personal admission states without identity, transport or token access. @module personal-invitation */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, Checkbox, Label } from "beez-ui";
import { Link } from "@/components/navigation/link";
import type { PersonalInvitationPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-page-state";
import { PERSONAL_INVITATION_UI_COPY, PERSONAL_INVITATION_UI_PHASE } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";
import { PERSONAL_INVITATION_OVERVIEW_STATE } from "@/src/modules/academy-admissions/constants/personal-invitation-overview";
import { ADMISSION_OVERVIEW_STATE } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ROUTES } from "@/src/constants/routes";
import styles from "./styles.module.scss";

/** Only safe presentation facts and callbacks enter the screen; the token is never a prop. */
export type PersonalInvitationProps = {
  state: PersonalInvitationPageState; ready: boolean; confirmed: boolean; canSubmit: boolean; phase: "idle" | "reading" | "submitting" | "changing_account" | "uncertain";
  accountChanged: boolean; hasPending: boolean; errorMessage: string | null; feedback: string | null; signInHref: string;
  commonHref?: string; ownRequestHref?: string; academyHref?: string; verification?: ReactNode;
  onConfirm: (value: boolean) => void; onSubmit: () => void; onRead: () => void; onChangeAccount: () => void; onReloadAccount: () => void;
};

/** @param props - Controlled safe state and explicit actions. @returns An accessible Spanish confirmation, with focus feedback and no hidden writes. */
export function PersonalInvitation(props: PersonalInvitationProps) {
  const fieldId = useId(), feedback = useRef<HTMLParagraphElement>(null);
  const preview = props.state.kind === "ready" ? props.state.preview : null;
  const available = preview?.state === PERSONAL_INVITATION_OVERVIEW_STATE.available ? preview : null;
  const busy = props.phase !== PERSONAL_INVITATION_UI_PHASE.idle && props.phase !== PERSONAL_INVITATION_UI_PHASE.uncertain;
  const pending = available?.overview.state === ADMISSION_OVERVIEW_STATE.pending, member = available?.overview.state === ADMISSION_OVERVIEW_STATE.alreadyMember;
  useEffect(() => { if (props.errorMessage) feedback.current?.focus(); }, [props.errorMessage]);
  return <main className={styles.PersonalInvitation}>
    <header className={styles.PersonalInvitation__header}>
      <p className={styles.PersonalInvitation__eyebrow}>Ingreso a una academia</p>
      <h1 className={styles.PersonalInvitation__title}>{PERSONAL_INVITATION_UI_COPY.title}</h1>
      {available && !props.accountChanged && <h2 className={styles.PersonalInvitation__academy}>{available.overview.tribe.name}</h2>}
      <p className={styles.PersonalInvitation__description}>{PERSONAL_INVITATION_UI_COPY.description}</p>
    </header>
    <section className={styles.PersonalInvitation__content} aria-busy={busy}>
      {props.accountChanged ? <p role="status" className={styles.PersonalInvitation__description}>{PERSONAL_INVITATION_UI_COPY.accountChanged}</p> : <>
        {props.state.kind === "unavailable" && <p role="alert" className={styles.PersonalInvitation__error}>{props.state.message}</p>}
        {preview && <p className={styles.PersonalInvitation__description}>{preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.available ? preview.overview.safeMessage : preview.safeMessage}</p>}
        {available && !pending && !member && <>
          <p className={styles.PersonalInvitation__description}>{available.requiresAllowlist ? PERSONAL_INVITATION_UI_COPY.restriction : PERSONAL_INVITATION_UI_COPY.exemption}</p>
          {props.verification}
          <form className={styles.PersonalInvitation__form} onSubmit={(event) => { event.preventDefault(); if (props.canSubmit && !busy) props.onSubmit(); }}>
            <div className={styles.PersonalInvitation__confirmation}>
              <Checkbox id={`${fieldId}-confirm`} checked={props.confirmed} disabled={!props.ready || busy || props.hasPending} onCheckedChange={(checked) => props.onConfirm(checked === true)} />
              <Label htmlFor={`${fieldId}-confirm`}>{PERSONAL_INVITATION_UI_COPY.confirm}</Label>
            </div>
            <Button type="submit" disabled={!props.canSubmit || !props.confirmed || busy || props.hasPending}>{props.phase === PERSONAL_INVITATION_UI_PHASE.submitting ? PERSONAL_INVITATION_UI_COPY.submitting : PERSONAL_INVITATION_UI_COPY.submit}</Button>
          </form>
        </>}
        {pending && props.ownRequestHref && <Link href={props.ownRequestHref}>{PERSONAL_INVITATION_UI_COPY.ownRequest}</Link>}
        {member && props.academyHref && <Link href={props.academyHref}>{PERSONAL_INVITATION_UI_COPY.openAcademy}</Link>}
      </>}
      {props.phase === PERSONAL_INVITATION_UI_PHASE.reading && <p role="status" className={styles.PersonalInvitation__description}>{PERSONAL_INVITATION_UI_COPY.reading}</p>}
      {props.feedback && <p role="status" className={styles.PersonalInvitation__feedback}>{props.feedback}</p>}
      {props.errorMessage && <p ref={feedback} tabIndex={-1} role="alert" className={styles.PersonalInvitation__error}>{props.errorMessage}</p>}
      <div className={styles.PersonalInvitation__actions}>
        {!props.accountChanged && preview?.state === PERSONAL_INVITATION_OVERVIEW_STATE.signInRequired && <Link href={props.signInHref}>Iniciar sesión</Link>}
        {props.accountChanged && <Button type="button" variant="outline" onClick={props.onReloadAccount}>{PERSONAL_INVITATION_UI_COPY.reloadAccount}</Button>}
        {!props.accountChanged && props.state.kind === "ready" && props.state.viewerId && <Button type="button" variant="outline" disabled={busy || !props.ready} onClick={props.onChangeAccount}>{props.phase === PERSONAL_INVITATION_UI_PHASE.changingAccount ? PERSONAL_INVITATION_UI_COPY.changingAccount : PERSONAL_INVITATION_UI_COPY.changeAccount}</Button>}
        <Button type="button" variant="outline" disabled={busy || props.accountChanged} onClick={props.onRead}>{props.hasPending ? PERSONAL_INVITATION_UI_COPY.original : PERSONAL_INVITATION_UI_COPY.read}</Button>
        <Link href={ROUTES.home}>Ir al inicio</Link>
      </div>
      {!props.accountChanged && props.commonHref && <section className={styles.PersonalInvitation__alternative} aria-labelledby={`${fieldId}-alternative`}>
        <h2 id={`${fieldId}-alternative`} className={styles.PersonalInvitation__subtitle}>Otra forma de ingreso</h2>
        <p className={styles.PersonalInvitation__description}>{PERSONAL_INVITATION_UI_COPY.commonHelp}</p>
        <Link href={props.commonHref}>{PERSONAL_INVITATION_UI_COPY.common}</Link>
      </section>}
    </section>
  </main>;
}
