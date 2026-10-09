/** Composes the public entry and own state from props without auth, requests or storage. @module admission-screen */
import { Button } from "beez-ui";
import { Link } from "@/components/navigation/link";
import { AdmissionForm } from "@/components/academy-admissions/admission-form";
import { RequestStatus } from "@/components/academy-admissions/request-status";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionDraft } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_UI_COPY, ADMISSION_UI_PHASE } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_OVERVIEW_STATE, ADMISSION_NEXT_ACTION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ROUTES } from "@/src/constants/routes";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import type { ReactNode } from "react";
import styles from "./styles.module.scss";

export type AdmissionScreenProps = {
  state: AdmissionPageState | { kind: "loading" }; draft?: AdmissionDraft; confirmed?: boolean; cancelConfirmed?: boolean; phase?: typeof ADMISSION_UI_PHASE[keyof typeof ADMISSION_UI_PHASE]; now?: string;
  errorMessage?: string | null; feedback?: string | null; accountChanged?: boolean; formReady?: boolean; retryOriginal?: boolean; signInHref?: string; retryHref?: string;
  requestPage?: boolean;
  verification?: ReactNode; canSubmitWithProof?: boolean; contactLocked?: boolean;
  onChange?: (draft: AdmissionDraft) => void; onConfirm?: (confirmed: boolean) => void; onCancelConfirm?: (confirmed: boolean) => void; onSubmit?: () => void; onCancel?: () => void; onRead?: () => void; onRetryOriginal?: () => void; onReloadAccount?: () => void;
};

/** @param props - Validated owned state and container actions. @returns A restrained responsive page with persistent accessible feedback. */
export function AdmissionScreen({ state, draft = { phone: "", country: "", message: "" }, confirmed = false, cancelConfirmed = false, phase = ADMISSION_UI_PHASE.idle, now, errorMessage, feedback, accountChanged = false, formReady = false, retryOriginal = false, signInHref = ROUTES.auth.signIn, retryHref, requestPage = false, verification, canSubmitWithProof = false, contactLocked = false, onChange, onConfirm, onCancelConfirm, onSubmit, onCancel, onRead, onRetryOriginal, onReloadAccount }: AdmissionScreenProps) {
  const ready = state.kind === "ready", loading = state.kind === "loading";
  const busy = phase === ADMISSION_UI_PHASE.writing || phase === ADMISSION_UI_PHASE.checking;
  const blocked = busy || phase === ADMISSION_UI_PHASE.uncertain || accountChanged || !formReady;
  const canSubmit = ready && !requestPage && (state.overview.state === ADMISSION_OVERVIEW_STATE.available || canSubmitWithProof) && (!state.request || state.request.status !== "pending");
  const readyToRetry = ready && state.request && state.overview.nextAction === ADMISSION_NEXT_ACTION.requestAdmission && state.request.status !== "pending";
  return <main className={styles.AdmissionScreen} aria-busy={busy || loading}>
    <header className={styles.AdmissionScreen__header}><p className={styles.AdmissionScreen__eyebrow}>TuTribu{ready ? ` · ${state.overview.tribe.name}` : " · Admisión"}</p><h1 className={styles.AdmissionScreen__title}>{state.kind === "unavailable" ? ADMISSION_UI_COPY.unavailableTitle : ready && state.request ? ADMISSION_UI_COPY.statusTitle : ADMISSION_UI_COPY.title}</h1><p className={styles.AdmissionScreen__description}>{ADMISSION_UI_COPY.description}</p></header>
    <section className={styles.AdmissionScreen__content} aria-label="Admisión a la academia">
      {loading ? <p role="status" className={styles.AdmissionScreen__loading}>{ADMISSION_UI_COPY.reading}</p> : state.kind === "unavailable" ? <p role="alert">{state.message}</p> : accountChanged ? null : <>
        <p role="status">{state.overview.safeMessage}</p>
        {state.request && <RequestStatus request={state.request} now={now ?? state.renderedAt} confirmed={cancelConfirmed} disabled={blocked} busy={phase === ADMISSION_UI_PHASE.writing} errorMessage={null} retryHref={readyToRetry ? retryHref : undefined} onConfirm={(value) => onCancelConfirm?.(value)} onCancel={() => onCancel?.()} />}
        {!requestPage && state.request && <Link href={buildOwnAdmissionRequestRoute(state.overview.tribe.slug, state.request.id)}>Ver solicitud</Link>}
        {verification}
        {canSubmit && <AdmissionForm draft={draft} contactLocked={contactLocked} contactType={state.overview.policy?.contactType ?? "email"} confirmed={confirmed} disabled={blocked} busy={phase === ADMISSION_UI_PHASE.writing} errorMessage={null} onChange={(value) => onChange?.(value)} onConfirm={(value) => onConfirm?.(value)} onSubmit={() => onSubmit?.()} />}
        {state.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired && !verification && <p className={styles.AdmissionScreen__help}>{ADMISSION_UI_COPY.verifying}</p>}
      </>}
      {feedback && <p role="status">{feedback}</p>}
      {phase === ADMISSION_UI_PHASE.uncertain && <p role="status">{ADMISSION_UI_COPY.uncertain}</p>}
      {errorMessage && <p role="alert" className={styles.AdmissionScreen__error}>{errorMessage}</p>}
      <div className={styles.AdmissionScreen__actions}>
        {ready && !state.viewerId && <Link href={signInHref}>{ADMISSION_UI_COPY.signIn}</Link>}
        {state.kind === "unavailable" && state.code === "authentication_required" && <Link href={signInHref}>{ADMISSION_UI_COPY.signIn}</Link>}
        {ready && state.overview.state === ADMISSION_OVERVIEW_STATE.alreadyMember && !accountChanged && <Link href={ROUTES.tribes.academy(state.overview.tribe.slug)}>{ADMISSION_UI_COPY.openAcademy}</Link>}
        {ready && <Button type="button" variant="outline" disabled={busy || accountChanged} onClick={onRead}>{phase === ADMISSION_UI_PHASE.checking ? ADMISSION_UI_COPY.reading : ADMISSION_UI_COPY.read}</Button>}
        {retryOriginal && <Button type="button" variant="outline" disabled={busy || accountChanged} onClick={onRetryOriginal}>{ADMISSION_UI_COPY.retryOriginal}</Button>}
        {accountChanged && <Button type="button" variant="outline" onClick={onReloadAccount}>{ADMISSION_UI_COPY.reloadAccount}</Button>}
        <Link href={ROUTES.home}>{ADMISSION_UI_COPY.home}</Link>
      </div>
    </section>
  </main>;
}

/** Deterministic leaf fallback with no runtime account or params access. */
export function AdmissionLoading() { return <AdmissionScreen state={{ kind: "loading" }} />; }
