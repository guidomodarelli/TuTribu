/** Renders only owned state and callbacks; it never resolves a session or calls an adapter. */
import { Button } from "beez-ui";
import { Link } from "@/components/navigation/link";
import { ROUTES } from "@/src/constants/routes";
import type { ReauthenticationPageState } from "@/src/modules/auth/application/results/reauthentication-page-result";
import { GLOBAL_REAUTHENTICATION_INTENT_STATE } from "@/src/modules/auth/constants/recent-authentication";
import { REAUTHENTICATION_ERROR_CODE, REAUTHENTICATION_INTENT_OUTCOME } from "@/src/modules/auth/constants/reauthentication-intents";
import { REAUTHENTICATION_UI_COPY, REAUTHENTICATION_UI_PHASE } from "@/src/modules/auth/constants/reauthentication-ui";
import styles from "./styles.module.scss";

export type ReauthenticationStatusProps = { state: ReauthenticationPageState | { kind: "loading" }; phase?: typeof REAUTHENTICATION_UI_PHASE[keyof typeof REAUTHENTICATION_UI_PHASE]; errorMessage?: string | null; startBlocked?: boolean; onStart?: () => void; onRead?: () => void };

/**
 * Shows actual server confirmation and prevents repeated starts while any request is active.
 * @param props - Safe snapshot, request phase and owned action callbacks.
 * @returns Semantic Spanish feedback and same-origin navigation without a permission flag.
 */
export function ReauthenticationStatus({ state, phase = REAUTHENTICATION_UI_PHASE.idle, errorMessage, startBlocked = false, onStart, onRead }: ReauthenticationStatusProps) {
  const ready = state.kind === "ready";
  const busy = phase !== REAUTHENTICATION_UI_PHASE.idle;
  const verified = ready && state.intent.outcome === REAUTHENTICATION_INTENT_OUTCOME.verified && !errorMessage && !busy;
  const canStart = ready && state.intent.state === GLOBAL_REAUTHENTICATION_INTENT_STATE.created && state.intent.outcome === REAUTHENTICATION_INTENT_OUTCOME.pending;
  return (
    <main className={styles.ReauthenticationStatus} aria-busy={busy || state.kind === "loading"}>
      <header className={styles.ReauthenticationStatus__header}>
        <p className={styles.ReauthenticationStatus__eyebrow}>TuTribu · Confirmación de cuenta</p>
        <h1 className={styles.ReauthenticationStatus__title}>{verified ? REAUTHENTICATION_UI_COPY.verifiedTitle : state.kind === "unavailable" ? REAUTHENTICATION_UI_COPY.unavailableTitle : REAUTHENTICATION_UI_COPY.title}</h1>
        <p className={styles.ReauthenticationStatus__description}>{REAUTHENTICATION_UI_COPY.description}</p>
      </header>
      <section className={styles.ReauthenticationStatus__content} aria-label="Estado de la autenticación">
        <p role="status">{state.kind === "loading" || phase === REAUTHENTICATION_UI_PHASE.checking ? REAUTHENTICATION_UI_COPY.loading : state.kind === "unavailable" ? state.message : errorMessage && state.intent.outcome === REAUTHENTICATION_INTENT_OUTCOME.verified ? REAUTHENTICATION_UI_COPY.readFailed : state.intent.safeMessage}</p>
        {errorMessage && <p role="alert" className={styles.ReauthenticationStatus__error}>{errorMessage}</p>}
        {ready && state.intent.state === GLOBAL_REAUTHENTICATION_INTENT_STATE.authorizing && <p className={styles.ReauthenticationStatus__help}>{REAUTHENTICATION_UI_COPY.authorizing}</p>}
        {ready && state.intent.outcome === REAUTHENTICATION_INTENT_OUTCOME.required && <p className={styles.ReauthenticationStatus__help}>{REAUTHENTICATION_UI_COPY.required}</p>}
        {verified && <p className={styles.ReauthenticationStatus__help}>{REAUTHENTICATION_UI_COPY.verified}</p>}
        <div className={styles.ReauthenticationStatus__actions}>
          {canStart && <Button type="button" disabled={busy || startBlocked} onClick={onStart}>{phase === REAUTHENTICATION_UI_PHASE.redirecting ? REAUTHENTICATION_UI_COPY.redirecting : REAUTHENTICATION_UI_COPY.start}</Button>}
          {ready && state.intent.outcome !== REAUTHENTICATION_INTENT_OUTCOME.expired && <Button type="button" variant="outline" disabled={busy} onClick={onRead}>{phase === REAUTHENTICATION_UI_PHASE.checking ? REAUTHENTICATION_UI_COPY.checking : REAUTHENTICATION_UI_COPY.read}</Button>}
          {verified && <Link href={state.intent.returnPath}>{REAUTHENTICATION_UI_COPY.continue}</Link>}
          {ready && <Link href={state.intent.returnPath}>{REAUTHENTICATION_UI_COPY.return}</Link>}
          {state.kind === "unavailable" && state.code === REAUTHENTICATION_ERROR_CODE.notAuthenticated && <Link href={ROUTES.auth.signIn}>{REAUTHENTICATION_UI_COPY.signIn}</Link>}
          {state.kind === "unavailable" && <Link href={ROUTES.home}>{REAUTHENTICATION_UI_COPY.home}</Link>}
        </div>
      </section>
    </main>
  );
}
