/** Composes the public entry and own state from props without auth, requests or storage. @module admission-screen */
import { Button } from "@golfo/ui";
import { Link } from "@/components/navigation/link";
import { AdmissionForm } from "@/components/academy-admissions/admission-form";
import { RequestStatus } from "@/components/academy-admissions/request-status";
import { SkeletonFacts, SkeletonLines, SkeletonStepsPanel } from "@/components/loaders/route-skeleton";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import type { AdmissionDraft } from "@/lib/academy-admissions/admission-draft";
import { ADMISSION_UI_COPY, ADMISSION_UI_PHASE } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_OVERVIEW_STATE, ADMISSION_NEXT_ACTION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ROUTES } from "@/src/constants/routes";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";

/** Placeholder counts that mirror the entry form's steps and the own request's facts. */
const ADMISSION_LOADING_SHAPE = { entryStepCount: 4, requestFactCount: 3 } as const;
import type { ReactNode, Ref } from "react";
import styles from "./styles.module.scss";

export type AdmissionScreenProps = {
  state: AdmissionPageState | { kind: "loading" }; draft?: AdmissionDraft; confirmed?: boolean; cancelConfirmed?: boolean; phase?: typeof ADMISSION_UI_PHASE[keyof typeof ADMISSION_UI_PHASE]; now?: string;
  errorMessage?: string | null; feedback?: string | null; accountChanged?: boolean; changingAccount?: boolean; formReady?: boolean; retryOriginal?: boolean; signInHref?: string; retryHref?: string;
  requestPage?: boolean;
  requestStatusRef?: Ref<HTMLParagraphElement>;
  whatsappErrorMessage?: string | null;
  whatsappEditor?: ReactNode;
  verification?: ReactNode; canSubmitWithProof?: boolean; contactLocked?: boolean;
  /** The guided request flow; when present it replaces the standalone verification and form. */
  requestFlow?: ReactNode;
  /** The read that recovers an unconfirmed code operation; while it blocks, it is the page's one next action. */
  contactRecovery?: ReactNode;
  onChange?: (draft: AdmissionDraft) => void; onConfirm?: (confirmed: boolean) => void; onCancelConfirm?: (confirmed: boolean) => void; onSubmit?: () => void; onCancel?: () => void; onRead?: () => void; onRetryOriginal?: () => void; onReloadAccount?: () => void;
  /** Closes the current session when the overview asks for another account; absent, the action is not offered. */
  onChangeAccount?: () => void;
};

/** @param props - Validated owned state and container actions. @returns A restrained responsive page with persistent accessible feedback. */
export function AdmissionScreen({ state, draft = { phone: "", country: "", message: "" }, confirmed = false, cancelConfirmed = false, phase = ADMISSION_UI_PHASE.idle, now, errorMessage, feedback, accountChanged = false, changingAccount = false, formReady = false, retryOriginal = false, signInHref = ROUTES.auth.signIn, retryHref, requestPage = false, requestStatusRef, verification, requestFlow, contactRecovery, canSubmitWithProof = false, contactLocked = false, whatsappErrorMessage, whatsappEditor, onChange, onConfirm, onCancelConfirm, onSubmit, onCancel, onRead, onRetryOriginal, onReloadAccount, onChangeAccount }: AdmissionScreenProps) {
  const ready = state.kind === "ready", loading = state.kind === "loading";
  const busy = phase === ADMISSION_UI_PHASE.writing || phase === ADMISSION_UI_PHASE.checking || changingAccount;
  // Like every account action it waits for the current account check, so a tap before hydration is never silently lost.
  const offersAccountChange = ready && Boolean(state.viewerId) && state.overview.nextAction === ADMISSION_NEXT_ACTION.changeAccount && !accountChanged && Boolean(onChangeAccount);
  const blocked = busy || phase === ADMISSION_UI_PHASE.uncertain || accountChanged || !formReady;
  const canSubmit = ready && !requestPage && (state.overview.state === ADMISSION_OVERVIEW_STATE.available || canSubmitWithProof) && (!state.request || state.request.status !== "pending");
  const readyToRetry = ready && state.request && state.request.status !== ADMISSION_REQUEST_STATUS.pending
    && (state.overview.nextAction === ADMISSION_NEXT_ACTION.requestAdmission || state.overview.nextAction === ADMISSION_NEXT_ACTION.verifyContact);
  // Parallel own reads can observe a resolution just after the overview read.
  // Keep the newer terminal request visible without repeating an older pending hint.
  const stalePendingOverview = ready && state.request && state.request.status !== ADMISSION_REQUEST_STATUS.pending && state.overview.state === ADMISSION_OVERVIEW_STATE.pending;
  return <main className={styles.AdmissionScreen} aria-busy={busy || loading}>
    <header className={styles.AdmissionScreen__header}><p className={styles.AdmissionScreen__eyebrow}>TuTribu{ready ? ` · ${state.overview.tribe.name}` : " · Admisión"}</p><h1 className={styles.AdmissionScreen__title}>{state.kind === "unavailable" ? ADMISSION_UI_COPY.unavailableTitle : (ready && state.request) || (loading && requestPage) ? ADMISSION_UI_COPY.statusTitle : ADMISSION_UI_COPY.title}</h1><p className={styles.AdmissionScreen__description}>{ADMISSION_UI_COPY.description}</p></header>
    <section className={styles.AdmissionScreen__content} aria-label="Admisión a la academia">
      {loading ? <>
        <p role="status" className={styles.AdmissionScreen__loading}>{ADMISSION_UI_COPY.reading}</p>
        {requestPage ? <><SkeletonFacts count={ADMISSION_LOADING_SHAPE.requestFactCount} /><SkeletonLines /></> : <SkeletonStepsPanel stepCount={ADMISSION_LOADING_SHAPE.entryStepCount} />}
      </> : state.kind === "unavailable" ? <p role="alert">{state.message}</p> : accountChanged ? null : <>
        {!stalePendingOverview && <p role="status">{state.overview.safeMessage}</p>}
        {state.request && <RequestStatus request={state.request} statusRef={requestStatusRef} now={now ?? state.renderedAt} confirmed={cancelConfirmed} disabled={blocked} busy={phase === ADMISSION_UI_PHASE.writing} errorMessage={null} retryHref={readyToRetry ? retryHref : undefined} onConfirm={(value) => onCancelConfirm?.(value)} onCancel={() => onCancel?.()} />}
        {whatsappEditor}
        {!requestPage && state.request && <Link href={buildOwnAdmissionRequestRoute(state.overview.tribe.slug, state.request.id)}>Ver solicitud</Link>}
        {contactRecovery && <div className={styles.AdmissionScreen__callout}><p role="status">{ADMISSION_UI_COPY.contactRecovery}</p>{contactRecovery}</div>}
        {requestFlow}
        {!requestFlow && verification}
        {!requestFlow && canSubmit && <AdmissionForm draft={draft} contactLocked={contactLocked} contactType={state.overview.policy?.contactType ?? "email"} showWhatsappNumber={formReady && !accountChanged} requiresWhatsappNumber={state.overview.policy?.requiresWhatsappNumber ?? false} whatsappErrorMessage={whatsappErrorMessage} confirmed={confirmed} disabled={blocked} busy={phase === ADMISSION_UI_PHASE.writing} errorMessage={null} onChange={(value) => onChange?.(value)} onConfirm={(value) => onConfirm?.(value)} onSubmit={() => onSubmit?.()} />}
        {state.overview.state === ADMISSION_OVERVIEW_STATE.verificationRequired && !verification && !requestFlow && <p className={styles.AdmissionScreen__help}>{ADMISSION_UI_COPY.verifying}</p>}
      </>}
      {feedback && <p role="status">{feedback}</p>}
      {phase === ADMISSION_UI_PHASE.uncertain && <p role="status">{ADMISSION_UI_COPY.uncertain}</p>}
      {errorMessage && <p role="alert" className={styles.AdmissionScreen__error}>{errorMessage}</p>}
      <div className={styles.AdmissionScreen__actions}>
        {ready && !state.viewerId && <Link href={signInHref}>{ADMISSION_UI_COPY.signIn}</Link>}
        {state.kind === "unavailable" && state.code === "authentication_required" && <Link href={signInHref}>{ADMISSION_UI_COPY.signIn}</Link>}
        {ready && state.overview.state === ADMISSION_OVERVIEW_STATE.alreadyMember && !accountChanged && <Link href={ROUTES.tribes.academy(state.overview.tribe.slug)}>{ADMISSION_UI_COPY.openAcademy}</Link>}
        {offersAccountChange && <Button type="button" variant="primary" loading={changingAccount} disabled={busy || !formReady} onClick={onChangeAccount}>{changingAccount ? ADMISSION_UI_COPY.changingAccount : ADMISSION_UI_COPY.changeAccount}</Button>}
        {ready && <Button type="button" variant="secondary" disabled={busy || accountChanged} onClick={onRead}>{phase === ADMISSION_UI_PHASE.checking ? ADMISSION_UI_COPY.reading : ADMISSION_UI_COPY.read}</Button>}
        {retryOriginal && <Button type="button" variant="secondary" disabled={busy || accountChanged} onClick={onRetryOriginal}>{ADMISSION_UI_COPY.retryOriginal}</Button>}
        {accountChanged && <Button type="button" variant="secondary" onClick={onReloadAccount}>{ADMISSION_UI_COPY.reloadAccount}</Button>}
        <Link href={ROUTES.home}>{ADMISSION_UI_COPY.home}</Link>
      </div>
    </section>
  </main>;
}

/** Deterministic leaf fallback with no runtime account or params access. */
/** @param props.requestPage - Whether the own request page is loading. @returns The admission shell with placeholders shaped like the entry form or the request status, without actions that could submit stale state. */
export function AdmissionLoading({ requestPage = false }: { requestPage?: boolean }) { return <AdmissionScreen state={{ kind: "loading" }} requestPage={requestPage} />; }

/** @returns The own request page placeholder, under its own title. */
export function AdmissionRequestLoading() { return <AdmissionLoading requestPage />; }
