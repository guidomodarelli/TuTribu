"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  InfoIcon,
  MessageCircleIcon,
  PauseCircleIcon,
  SettingsIcon,
} from "lucide-react";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
} from "@golfo/ui";

import { Link } from "@/components/navigation/link";
import { buildAdmissionEntryRoute } from "@/lib/academy-admissions/admission-routes";
import {
  cancelAcademyRenewal,
  fetchOwnAcademyAccess,
  joinAcademy,
  reconcileAcademyCoverage,
  startAcademyCheckout,
} from "@/lib/academy/academy-api-client";
import { formatAcademyDate, formatAcademyPrice } from "@/lib/academy/academy-format";
import { navigateToUrl } from "@/lib/browser-navigation";
import { ROUTES } from "@/src/constants/routes";
import type {
  AcademyAccessStatusDto,
  AcademyOfferDto,
  AcademyReconcileDto,
} from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import styles from "./styles.module.scss";

const ACADEMY_HOME_COPY = {
  accessHeading: "Tu acceso",
  accessUnbounded: "Tenés acceso a la academia sin vencimiento.",
  admissionClosed: "Las admisiones de esta tribu no están abiertas en este momento.",
  basicCourses: "Ver cursos básicos",
  basicLevel: "Podés ver los cursos básicos. Seguí estos pasos para sumar la academia.",
  configureOffer: "Configurar la oferta",
  emptyOfferLeader:
    "Todavía no cargaste la oferta. Agregá un título, una explicación y los beneficios para que tus integrantes sepan qué incluye la academia.",
  emptyOfferMember: "Pronto vas a ver acá qué incluye la academia.",
  eyebrow: "Academia de la tribu",
  leaderPreviewMessage: "Como líder ves todo el contenido de la academia.",
  stepAccessCheckout: "Pagás mes a mes y podés cancelar la renovación cuando quieras.",
  stepAccessLocked: "Disponible cuando tu vinculación esté verificada.",
  stepAccessPaused: "La venta está pausada. Quien administra la tribu también puede bonificarte el acceso.",
  stepAccessTitle: "Contratá la academia o recibí una bonificación",
  stepLearnDescription: "Tu progreso queda guardado aunque el acceso venza.",
  stepLearnTitle: "Accedé a los cursos de academia",
  stepVerifyDone: "Tu vinculación está verificada.",
  stepVerifyTitle: "Verificá tu vinculación",
  stepsLabel: "Pasos para acceder a la academia",
  statusActive: "Academia activa",
  statusBasic: "Acceso básico",
  statusEnded: "Acceso finalizado",
  statusLeader: "Vista de líder",
  statusNoAccess: "Sin acceso",
  cancelButton: "Cancelar renovación",
  cancelConfirm: "Sí, cancelar renovación",
  cancelDialogDescription:
    "Se detienen los próximos cobros. Conservás el acceso ya pagado hasta su vencimiento, tu cuenta y tu progreso.",
  cancelDialogTitle: "¿Cancelar la renovación de la academia?",
  cancelKeep: "Mantener renovación",
  cancelPending: "Cancelando…",
  cancelPendingSubscriptionDialogDescription:
    "Se cancela la suscripción que está esperando la confirmación del pago y no se generan cobros nuevos. Tu cuenta y tu progreso siguen guardados.",
  cancelPendingSubscriptionDialogTitle: "¿Cancelar la suscripción a la academia?",
  canceledPendingSubscription:
    "Cancelaste la suscripción que estaba esperando la confirmación del pago. No se generan cobros nuevos.",
  canceledUntil: (date: string) => `Cancelaste la renovación. Conservás el acceso hasta el ${date}.`,
  checkoutButton: "Contratar academia",
  checkoutPending: "Abriendo el pago…",
  confirmingPayment: "Estamos confirmando tu suscripción. No hace falta que vuelvas a pagar.",
  continueLearning: "Ir a los cursos",
  defaultTitle: "Academia",
  eligibilityPending: "Tu solicitud está en revisión.",
  eligibilityRequired: "Confirmá tu vinculación para acceder a la academia.",
  expired: "Tu acceso a la academia finalizó. Tu cuenta y tu progreso siguen guardados.",
  joinButton: "Ingresar gratis",
  joinPending: "Ingresando…",
  legacyMode: "Esta tribu todavía no usa el modo academia. Podés activarla desde Ajustes.",
  legacySettingsLink: "Ir a Ajustes",
  leaderPreview: "Esta vista no es un acceso comercial ni cuenta como suscripción.",
  manageLink: "Gestionar academia",
  offerHeading: "La academia",
  paidAndBonusUntil: (date: string) => `Tenés acceso pago y bonificado hasta el ${date}.`,
  paidUntil: (date: string) => `Tenés acceso a la academia hasta el ${date}.`,
  bonusUntil: (date: string) => `Tenés acceso bonificado hasta el ${date}.`,
  priceLabel: "Precio",
  paymentNotFound:
    "No encontramos un pago confirmado. Si no terminaste de pagar, podés contratar la academia de nuevo.",
  paymentStillPending:
    "Todavía no recibimos la confirmación del pago. Volvé a comprobar en unos minutos; no hace falta que pagues de nuevo.",
  refreshButton: "Actualizar estado",
  refreshDone: "Actualizamos tu estado.",
  refreshPending: "Actualizando…",
  refreshReadFailed: "No pudimos leer tu estado actualizado. Intentá de nuevo en unos segundos.",
  refreshThrottled: "Ya revisamos tu estado hace instantes. Probá de nuevo en un minuto.",
  renewalActive: "Tu renovación mensual está activa.",
  renewalCanceled: "La renovación está cancelada.",
  renewalCanceling: "La cancelación de tu renovación está pendiente de confirmación.",
  salesPaused: "La venta de la academia está pausada.",
  supportNeeded: "Tu membresía no permite usar la academia. Contactá a quien administra la tribu.",
  verificationLink: "Solicitar verificación",
  whatsappNote: "La conversación de la comunidad sigue en WhatsApp.",
} as const;

/** The member has no academy subscription yet: nothing to reconcile. */
const HTTP_STATUS_NOT_FOUND = 404;

/** The provider was checked moments ago: the reconciliation did not ask it again. */
const RECONCILE_THROTTLED_STATUS: AcademyReconcileDto["status"] = "throttled";

/** Fired when the browser restores the page from its back-forward cache. */
const PAGE_SHOW_EVENT = "pageshow";

type AcademyHomeProps = {
  access: AcademyAccessStatusDto | null;
  canManage: boolean;
  isCheckoutReturn: boolean;
  offer: AcademyOfferDto | null;
  tribeSlug: string;
};

type AcademyHomeAction = "cancel" | "checkout" | "join" | "refresh";

type PendingAction = AcademyHomeAction | null;

/** Each action keeps its own error, shown next to the control that failed. */
type ActionErrors = Record<AcademyHomeAction, string | null>;

const NO_ACTION_ERRORS: ActionErrors = { cancel: null, checkout: null, join: null, refresh: null };

/**
 * Renewals the member can cancel: a confirmed one, or one whose subscription
 * still waits for the provider to confirm its payment.
 */
type CancelableRenewalStatus = "active" | "pending";

/**
 * Whether the member can cancel this renewal from the academy home.
 *
 * @param renewalStatus - Renewal status confirmed by the server.
 * @returns True for an active renewal or a subscription waiting for its payment.
 */
function isCancelableRenewal(
  renewalStatus: AcademyAccessStatusDto["renewalStatus"]
): renewalStatus is CancelableRenewalStatus {
  return renewalStatus === "active" || renewalStatus === "pending";
}

/** A pending subscription has no paid access to keep: its dialog never promises an end date. */
const CANCEL_DIALOG_COPY: Record<CancelableRenewalStatus, { description: string; title: string }> = {
  active: {
    description: ACADEMY_HOME_COPY.cancelDialogDescription,
    title: ACADEMY_HOME_COPY.cancelDialogTitle,
  },
  pending: {
    description: ACADEMY_HOME_COPY.cancelPendingSubscriptionDialogDescription,
    title: ACADEMY_HOME_COPY.cancelPendingSubscriptionDialogTitle,
  },
};

/**
 * Whether a subscription payment may still be confirmed: a renewal that is
 * pending, or one already active whose first period is not covered yet (the
 * provider authorized the subscription before approving its invoice).
 *
 * @param access - Confirmed access status.
 * @returns True while the member should keep waiting instead of contracting again.
 */
function isPaymentInProgress(access: AcademyAccessStatusDto): boolean {
  return access.renewalStatus === "pending" || (access.renewalStatus === "active" && access.level === "basic");
}

/**
 * Picks the outcome of a confirmed status refresh. A payment is only shown as
 * confirmed by the status itself; this message never anticipates it.
 *
 * @param input - Reconciliation status, reread access and whether a checkout return was waiting.
 * @returns Spanish status message.
 */
function describeRefreshOutcome({
  access,
  reconcileStatus,
  wasAwaitingCheckoutReturn,
}: {
  access: AcademyAccessStatusDto;
  reconcileStatus: AcademyReconcileDto["status"] | null;
  wasAwaitingCheckoutReturn: boolean;
}): string {
  if (reconcileStatus === RECONCILE_THROTTLED_STATUS) {
    return ACADEMY_HOME_COPY.refreshThrottled;
  }

  if (isPaymentInProgress(access)) {
    return ACADEMY_HOME_COPY.paymentStillPending;
  }

  if (wasAwaitingCheckoutReturn && access.level === "basic") {
    return ACADEMY_HOME_COPY.paymentNotFound;
  }

  return ACADEMY_HOME_COPY.refreshDone;
}

/**
 * Builds the persistent coverage message of the member.
 *
 * @param access - Own academy status.
 * @returns Spanish message or null.
 */
function describeCoverage(access: AcademyAccessStatusDto): string | null {
  if (access.level === "academy") {
    if (!access.accessEndsAt) {
      return ACADEMY_HOME_COPY.accessUnbounded;
    }

    const date = formatAcademyDate(access.accessEndsAt);

    if (access.hasPaidCoverage && access.hasBonusCoverage) {
      return ACADEMY_HOME_COPY.paidAndBonusUntil(date);
    }

    return access.hasBonusCoverage
      ? ACADEMY_HOME_COPY.bonusUntil(date)
      : ACADEMY_HOME_COPY.paidUntil(date);
  }

  return access.firstActivatedAt ? ACADEMY_HOME_COPY.expired : ACADEMY_HOME_COPY.basicLevel;
}

const RENEWAL_MESSAGE: Partial<Record<AcademyAccessStatusDto["renewalStatus"], string>> = {
  active: ACADEMY_HOME_COPY.renewalActive,
  canceled: ACADEMY_HOME_COPY.renewalCanceled,
  canceling: ACADEMY_HOME_COPY.renewalCanceling,
  pending: ACADEMY_HOME_COPY.confirmingPayment,
};

type AccessStatusTone = "muted" | "neutral" | "success" | "warning";

type AccessStatusView = {
  detail: string | null;
  isLearning: boolean;
  label: string;
  message: string;
  showSteps: boolean;
  tone: AccessStatusTone;
};

type AccessStepState = "current" | "done" | "upcoming" | "waiting";

type AccessStep = {
  description: string;
  key: "access" | "learn" | "verify";
  state: AccessStepState;
  title: string;
};

/**
 * Summarizes the own status as a labeled headline. The leader preview is an
 * administrative view, so it never asks the leader to verify or buy.
 *
 * @param access - Own academy status in an academy-mode tribe.
 * @returns Status view.
 */
function resolveAccessStatus(access: AcademyAccessStatusDto): AccessStatusView {
  const renewal =
    access.renewalStatus !== "pending" ? RENEWAL_MESSAGE[access.renewalStatus] ?? null : null;

  if (access.nextAction === "contact_support") {
    return {
      detail: renewal,
      isLearning: false,
      label: ACADEMY_HOME_COPY.statusNoAccess,
      message: ACADEMY_HOME_COPY.supportNeeded,
      showSteps: false,
      tone: "warning",
    };
  }

  if (access.level === "academy") {
    return {
      detail: renewal,
      isLearning: true,
      label: ACADEMY_HOME_COPY.statusActive,
      message: describeCoverage(access) ?? ACADEMY_HOME_COPY.accessUnbounded,
      showSteps: false,
      tone: "success",
    };
  }

  if (access.isLeaderPreview) {
    return {
      detail: ACADEMY_HOME_COPY.leaderPreview,
      isLearning: true,
      label: ACADEMY_HOME_COPY.statusLeader,
      message: ACADEMY_HOME_COPY.leaderPreviewMessage,
      showSteps: false,
      tone: "neutral",
    };
  }

  return {
    detail: renewal,
    isLearning: false,
    label: access.firstActivatedAt ? ACADEMY_HOME_COPY.statusEnded : ACADEMY_HOME_COPY.statusBasic,
    message: describeCoverage(access) ?? ACADEMY_HOME_COPY.basicLevel,
    showSteps: true,
    tone: "muted",
  };
}

/**
 * Builds the three steps a basic member follows to reach the academy.
 *
 * @param access - Own academy status of a basic member.
 * @returns Ordered steps with their state.
 */
function buildAccessSteps(access: AcademyAccessStatusDto): AccessStep[] {
  const isVerified = access.eligibility === "verified";

  return [
    {
      description: describeVerifyStep(access),
      key: "verify",
      state: resolveVerifyStepState(access),
      title: ACADEMY_HOME_COPY.stepVerifyTitle,
    },
    {
      description: describeAccessStep(access),
      key: "access",
      state: isVerified ? "current" : "upcoming",
      title: ACADEMY_HOME_COPY.stepAccessTitle,
    },
    {
      description: ACADEMY_HOME_COPY.stepLearnDescription,
      key: "learn",
      state: "upcoming",
      title: ACADEMY_HOME_COPY.stepLearnTitle,
    },
  ];
}

/** State of the verification step: done, waiting for review, or the current one. */
function resolveVerifyStepState(access: AcademyAccessStatusDto): AccessStepState {
  if (access.eligibility === "verified") {
    return "done";
  }

  return access.eligibility === "pending" ? "waiting" : "current";
}

/** Description of the verification step for the current eligibility. */
function describeVerifyStep(access: AcademyAccessStatusDto): string {
  if (access.eligibility === "verified") {
    return ACADEMY_HOME_COPY.stepVerifyDone;
  }

  return access.eligibility === "pending"
    ? ACADEMY_HOME_COPY.eligibilityPending
    : ACADEMY_HOME_COPY.eligibilityRequired;
}

/** Description of the access step: locked until verified, then checkout or paused sales. */
function describeAccessStep(access: AcademyAccessStatusDto): string {
  if (access.eligibility !== "verified") {
    return ACADEMY_HOME_COPY.stepAccessLocked;
  }

  return access.canStartCheckout
    ? ACADEMY_HOME_COPY.stepAccessCheckout
    : ACADEMY_HOME_COPY.stepAccessPaused;
}

/**
 * Outcome of a confirmed cancellation: a pending subscription has no paid
 * access to keep; an active renewal keeps it until its end date.
 */
function describeCancelOutcome(
  cancelingRenewalStatus: CancelableRenewalStatus,
  endsAt: string | null
): string {
  if (cancelingRenewalStatus === "pending") {
    return ACADEMY_HOME_COPY.canceledPendingSubscription;
  }

  return endsAt
    ? ACADEMY_HOME_COPY.canceledUntil(formatAcademyDate(endsAt))
    : ACADEMY_HOME_COPY.renewalCanceled;
}

/**
 * State of the academy home: confirmed access, the pending action, notices
 * and per-action errors, the cancel dialog and the guards that block a
 * second submit or any action while the provider checkout opens.
 *
 * @param initialAccess - Server-rendered own status.
 * @param isCheckoutReturn - Whether the page opened on the way back from the checkout.
 * @returns State values, setters and guards.
 */
function useAcademyHomeState(initialAccess: AcademyAccessStatusDto | null, isCheckoutReturn: boolean) {
  const router = useRouter();
  const [access, setAccess] = useState(initialAccess);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<ActionErrors>(NO_ACTION_ERRORS);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  // Frozen when the dialog opens: its copy and the outcome describe what the member chose to cancel.
  const [cancelingRenewalStatus, setCancelingRenewalStatus] =
    useState<CancelableRenewalStatus>("active");
  // A checkout return waits for the payment only until a server read says otherwise.
  const [isAwaitingCheckoutReturn, setIsAwaitingCheckoutReturn] = useState(isCheckoutReturn);
  // Blocks a second submit before the disabled state renders (double click).
  const isBusyRef = useRef(false);
  // Once the provider checkout opens the page is leaving: keep actions locked.
  const isLeavingRef = useRef(false);

  useEffect(() => {
    // Coming back from the provider with the browser's Back restores this page as it was left:
    // release the checkout so the member is not stuck on «Abriendo el pago…».
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !isLeavingRef.current) {
        return;
      }

      isLeavingRef.current = false;
      setPendingAction(null);
    };

    window.addEventListener(PAGE_SHOW_EVENT, handlePageShow);

    return () => window.removeEventListener(PAGE_SHOW_EVENT, handlePageShow);
  }, []);

  return {
    access,
    actionErrors,
    cancelingRenewalStatus,
    isAwaitingCheckoutReturn,
    isBusyRef,
    isCancelDialogOpen,
    isLeavingRef,
    notice,
    pendingAction,
    refreshNotice,
    router,
    setAccess,
    setActionErrors,
    setCancelingRenewalStatus,
    setIsAwaitingCheckoutReturn,
    setIsCancelDialogOpen,
    setNotice,
    setPendingAction,
    setRefreshNotice,
  };
}

type AcademyHomeState = ReturnType<typeof useAcademyHomeState>;

/**
 * Runs one action at a time and rereads the own status.
 *
 * @param state - Academy home state.
 * @param tribeSlug - Tribe slug.
 * @returns The runner, the per-action error setter and the status reread.
 */
function createActionRunner(state: AcademyHomeState, tribeSlug: string) {
  const { isBusyRef, isLeavingRef } = state;
  const setActionError = (action: AcademyHomeAction, message: string | null) =>
    state.setActionErrors((currentErrors) => ({ ...currentErrors, [action]: message }));

  const runAction = async (action: AcademyHomeAction, work: () => Promise<void>) => {
    if (isBusyRef.current || isLeavingRef.current) {
      return;
    }

    isBusyRef.current = true;
    state.setPendingAction(action);
    // A retry starts clean: only this action's previous error is cleared.
    setActionError(action, null);

    try {
      await work();
    } finally {
      isBusyRef.current = false;

      // The provider checkout is opening: the button stays pending until the page leaves.
      if (!isLeavingRef.current) {
        state.setPendingAction(null);
      }
    }
  };

  const reloadAccess = async (): Promise<AcademyAccessStatusDto | null> => {
    const result = await fetchOwnAcademyAccess(tribeSlug);

    if (result.isSuccess) {
      state.setAccess(result.data);

      return result.data;
    }

    return null;
  };

  return { reloadAccess, runAction, setActionError };
}

type ActionRunner = ReturnType<typeof createActionRunner>;

type AcademyHomeActionContext = {
  offer: AcademyOfferDto | null;
  runner: ActionRunner;
  state: AcademyHomeState;
  tribeSlug: string;
};

/** Free join and provider checkout actions. */
function createEntryActions({ offer, runner, state, tribeSlug }: AcademyHomeActionContext) {
  const { runAction, setActionError } = runner;

  const handleJoin = () =>
    runAction("join", async () => {
      const result = await joinAcademy(tribeSlug);

      if (!result.isSuccess) {
        setActionError("join", result.message);

        return;
      }

      // Joining changes the membership (an authorization state): a full
      // refresh re-renders the page with the new server-side access.
      state.router.refresh();
    });

  const handleCheckout = () =>
    runAction("checkout", async () => {
      if (!offer) {
        return;
      }

      const result = await startAcademyCheckout(tribeSlug, offer.offerVersion);

      if (!result.isSuccess) {
        setActionError("checkout", result.message);

        return;
      }

      state.isLeavingRef.current = true;
      navigateToUrl(result.data.checkoutUrl);
    });

  return { handleCheckout, handleJoin };
}

/** Status refresh: reconciles the subscription and rereads the own status. */
function createRefreshAction({ runner, state, tribeSlug }: AcademyHomeActionContext) {
  const { reloadAccess, runAction, setActionError } = runner;

  return () =>
    runAction("refresh", async () => {
      state.setRefreshNotice(null);
      const reconciliation = await reconcileAcademyCoverage(tribeSlug);
      // Without a subscription there is nothing to reconcile: the reread alone answers.
      const reconcileError =
        !reconciliation.isSuccess && reconciliation.status !== HTTP_STATUS_NOT_FOUND
          ? reconciliation.message
          : null;
      const updated = await reloadAccess();

      if (reconcileError || !updated) {
        setActionError("refresh", reconcileError ?? ACADEMY_HOME_COPY.refreshReadFailed);

        return;
      }

      const reconcileStatus = reconciliation.isSuccess ? reconciliation.data.status : null;

      state.setRefreshNotice(
        describeRefreshOutcome({
          access: updated,
          reconcileStatus,
          wasAwaitingCheckoutReturn: state.isAwaitingCheckoutReturn,
        })
      );

      // A throttled check did not ask the provider, and a payment still in progress may yet be confirmed: both keep waiting.
      if (reconcileStatus !== RECONCILE_THROTTLED_STATUS && !isPaymentInProgress(updated)) {
        state.setIsAwaitingCheckoutReturn(false);
      }
    });
}

/** Renewal cancellation and its confirmation dialog. */
function createCancelActions({ runner, state, tribeSlug }: AcademyHomeActionContext) {
  const { reloadAccess, runAction, setActionError } = runner;

  const handleCancel = () =>
    runAction("cancel", async () => {
      const result = await cancelAcademyRenewal(tribeSlug);

      if (!result.isSuccess) {
        setActionError("cancel", result.message);

        return;
      }

      state.setIsCancelDialogOpen(false);
      // The canceled subscription leaves no payment to wait for, and an earlier refresh outcome is stale.
      state.setIsAwaitingCheckoutReturn(false);
      state.setRefreshNotice(null);
      const updated = await reloadAccess();
      const endsAt = updated?.accessEndsAt ?? state.access?.accessEndsAt ?? null;

      state.setNotice(describeCancelOutcome(state.cancelingRenewalStatus, endsAt));
    });

  const openCancelDialog = (renewalStatus: CancelableRenewalStatus) => {
    // The dialog never inherits an error from an earlier attempt or another action.
    setActionError("cancel", null);
    state.setCancelingRenewalStatus(renewalStatus);
    state.setIsCancelDialogOpen(true);
  };

  return { handleCancel, openCancelDialog };
}

/**
 * Academy home state plus its actions and the values derived from the
 * confirmed status.
 */
function useAcademyHome({ access: initialAccess, isCheckoutReturn, offer, tribeSlug }: AcademyHomeProps) {
  const state = useAcademyHomeState(initialAccess, isCheckoutReturn);
  const runner = createActionRunner(state, tribeSlug);
  const context = { offer, runner, state, tribeSlug };
  const { access } = state;
  const isAcademyMode = access?.accessModel === "academy";
  const status = access && isAcademyMode ? resolveAccessStatus(access) : null;

  return {
    ...state,
    ...createEntryActions(context),
    ...createCancelActions(context),
    cancelableRenewalStatus:
      access && isCancelableRenewal(access.renewalStatus) ? access.renewalStatus : null,
    handleRefresh: createRefreshAction(context),
    showConfirming:
      access !== null &&
      (isPaymentInProgress(access) || (state.isAwaitingCheckoutReturn && access.level === "basic")),
    status,
    steps: access && isAcademyMode && status?.showSteps ? buildAccessSteps(access) : [],
  };
}

type AcademyHomeController = ReturnType<typeof useAcademyHome>;

type AcademyHomeSectionProps = {
  canManage: boolean;
  home: AcademyHomeController;
  offer: AcademyOfferDto | null;
  tribeSlug: string;
};

/** Title, offer description and the manage link for leaders. */
function AcademyHomeHeader({ canManage, offer, tribeSlug }: Omit<AcademyHomeSectionProps, "home">) {
  const title = offer?.title || ACADEMY_HOME_COPY.defaultTitle;

  return (
    <header className={styles.AcademyHome__header}>
      <div className={styles.AcademyHome__heading}>
        <p className={styles.AcademyHome__eyebrow}>{ACADEMY_HOME_COPY.eyebrow}</p>
        <h1 className={styles.AcademyHome__title}>{title}</h1>
        {offer?.description ? (
          <p className={styles.AcademyHome__description}>{offer.description}</p>
        ) : null}
      </div>
      {canManage ? (
        <Link className={styles.AcademyHome__manageLink} href={ROUTES.tribes.academyManage(tribeSlug)}>
          <SettingsIcon aria-hidden className={styles.AcademyHome__icon} />
          {ACADEMY_HOME_COPY.manageLink}
        </Link>
      ) : null}
    </header>
  );
}

/** Payment confirmation, last outcome and legacy mode notices. */
function AcademyHomeNotices({ home, tribeSlug }: Pick<AcademyHomeSectionProps, "home" | "tribeSlug">) {
  return (
    <>
      {home.showConfirming ? (
        <p className={styles.AcademyHome__notice} role="status">
          <ClockIcon aria-hidden className={styles.AcademyHome__icon} />
          {ACADEMY_HOME_COPY.confirmingPayment}
        </p>
      ) : null}

      {home.notice ? (
        <p className={styles.AcademyHome__notice} role="status">
          <CheckIcon aria-hidden className={styles.AcademyHome__icon} />
          {home.notice}
        </p>
      ) : null}

      {home.access?.accessModel === "legacy" ? (
        <p className={styles.AcademyHome__notice} role="status">
          <InfoIcon aria-hidden className={styles.AcademyHome__icon} />
          <span>
            {ACADEMY_HOME_COPY.legacyMode}{" "}
            <Link className={styles.AcademyHome__inlineLink} href={ROUTES.tribes.settings(tribeSlug)}>
              {ACADEMY_HOME_COPY.legacySettingsLink}
            </Link>
          </span>
        </p>
      ) : null}
    </>
  );
}

type AcademyAccessStepItemProps = Pick<AcademyHomeSectionProps, "home" | "tribeSlug"> & {
  access: AcademyAccessStatusDto;
  step: AccessStep;
  stepIndex: number;
};

/** One step toward the academy, with its verification link or checkout button. */
function AcademyAccessStepItem({ access, home, step, stepIndex, tribeSlug }: AcademyAccessStepItemProps) {
  const { actionErrors, pendingAction } = home;

  return (
    <li
      aria-current={step.state === "current" ? "step" : undefined}
      className={cn(
        styles.AcademyHome__step,
        styles[`AcademyHome__step--${step.state}`]
      )}
    >
      <span aria-hidden className={styles.AcademyHome__stepMarker}>
        {step.state === "done" ? (
          <CheckIcon className={styles.AcademyHome__icon} />
        ) : (
          stepIndex + 1
        )}
      </span>
      <div className={styles.AcademyHome__stepBody}>
        <p className={styles.AcademyHome__stepTitle}>{step.title}</p>
        <p className={styles.AcademyHome__muted}>{step.description}</p>
        {step.key === "verify" && step.state === "current" ? (
          <Link
            className={styles.AcademyHome__primaryLink}
            href={ROUTES.tribes.academyVerification(tribeSlug)}
          >
            {ACADEMY_HOME_COPY.verificationLink}
            <ArrowRightIcon aria-hidden className={styles.AcademyHome__icon} />
          </Link>
        ) : null}
        {step.key === "access" && access.canStartCheckout && !home.showConfirming ? (
          <Button
            aria-busy={pendingAction === "checkout" || undefined}
            className={styles.AcademyHome__actionButton}
            disabled={pendingAction !== null}
            onClick={home.handleCheckout}
            type="button"
          >
            {pendingAction === "checkout"
              ? ACADEMY_HOME_COPY.checkoutPending
              : ACADEMY_HOME_COPY.checkoutButton}
          </Button>
        ) : null}
        {step.key === "access" && actionErrors.checkout ? (
          <p className={styles.AcademyHome__error} role="alert">
            {actionErrors.checkout}
          </p>
        ) : null}
      </div>
    </li>
  );
}

type AcademyAccessDetailsProps = Pick<AcademyHomeSectionProps, "home" | "tribeSlug"> & {
  access: AcademyAccessStatusDto;
  status: AccessStatusView;
};

/** Courses link, status refresh and renewal cancellation of the own access. */
function AcademyAccessActions({ access, home, status, tribeSlug }: AcademyAccessDetailsProps) {
  const { cancelableRenewalStatus, pendingAction } = home;

  return (
    <div className={styles.AcademyHome__actions}>
      <Link
        className={
          status.isLearning ? styles.AcademyHome__primaryLink : styles.AcademyHome__secondaryLink
        }
        href={ROUTES.tribes.courses(tribeSlug)}
      >
        {status.isLearning ? ACADEMY_HOME_COPY.continueLearning : ACADEMY_HOME_COPY.basicCourses}
        <ArrowRightIcon aria-hidden className={styles.AcademyHome__icon} />
      </Link>
      {home.showConfirming || access.renewalStatus === "canceling" ? (
        <Button
          aria-busy={pendingAction === "refresh" || undefined}
          className={styles.AcademyHome__actionButton}
          disabled={pendingAction !== null}
          onClick={home.handleRefresh}
          type="button"
          variant="secondary"
        >
          {pendingAction === "refresh"
            ? ACADEMY_HOME_COPY.refreshPending
            : ACADEMY_HOME_COPY.refreshButton}
        </Button>
      ) : null}
      {cancelableRenewalStatus ? (
        <Button
          className={styles.AcademyHome__actionButton}
          disabled={pendingAction !== null}
          onClick={() => home.openCancelDialog(cancelableRenewalStatus)}
          type="button"
          variant="secondary"
        >
          {ACADEMY_HOME_COPY.cancelButton}
        </Button>
      ) : null}
    </div>
  );
}

/** Refresh error, or the outcome of the last confirmed refresh. */
function AcademyRefreshFeedback({ home }: Pick<AcademyHomeSectionProps, "home">) {
  if (home.actionErrors.refresh) {
    return (
      <p className={styles.AcademyHome__error} role="alert">
        {home.actionErrors.refresh}
      </p>
    );
  }

  return home.refreshNotice ? (
    <p className={styles.AcademyHome__muted} role="status">
      {home.refreshNotice}
    </p>
  ) : null;
}

/** "Tu acceso": status headline, steps toward the academy and access actions. */
function AcademyAccessSection({ access, home, status, tribeSlug }: AcademyAccessDetailsProps) {
  return (
    <section aria-labelledby="academy-access-heading" className={styles.AcademyHome__section}>
      <h2 className={styles.AcademyHome__sectionTitle} id="academy-access-heading">
        {ACADEMY_HOME_COPY.accessHeading}
      </h2>

      <div className={styles.AcademyHome__status}>
        <span
          className={cn(
            styles.AcademyHome__statusBadge,
            styles[`AcademyHome__statusBadge--${status.tone}`]
          )}
        >
          {status.label}
        </span>
        <p className={styles.AcademyHome__statusText}>{status.message}</p>
        {status.detail ? <p className={styles.AcademyHome__muted}>{status.detail}</p> : null}
      </div>

      {home.steps.length > 0 ? (
        <ol aria-label={ACADEMY_HOME_COPY.stepsLabel} className={styles.AcademyHome__steps}>
          {home.steps.map((step, stepIndex) => (
            <AcademyAccessStepItem
              access={access}
              home={home}
              key={step.key}
              step={step}
              stepIndex={stepIndex}
              tribeSlug={tribeSlug}
            />
          ))}
        </ol>
      ) : null}

      <AcademyAccessActions access={access} home={home} status={status} tribeSlug={tribeSlug} />
      <AcademyRefreshFeedback home={home} />
    </section>
  );
}

type AcademyOfferPartProps = Pick<AcademyHomeSectionProps, "canManage" | "home" | "tribeSlug"> & {
  offer: AcademyOfferDto;
};

/** Free join or admission request for a visitor, or the closed admissions notice. */
function AcademyAdmissionAction({ home, offer, tribeSlug }: Omit<AcademyOfferPartProps, "canManage">) {
  const { actionErrors, pendingAction } = home;

  if (!offer.admissionEnabled) {
    return <p className={styles.AcademyHome__text}>{ACADEMY_HOME_COPY.admissionClosed}</p>;
  }

  return (
    <div className={styles.AcademyHome__actions}>
      {offer.admissionRequiresRequest ? <Link className={styles.AcademyHome__secondaryLink} href={buildAdmissionEntryRoute(tribeSlug)}>Solicitar ingreso</Link> :
      <Button
        aria-busy={pendingAction === "join" || undefined}
        disabled={pendingAction !== null}
        onClick={home.handleJoin}
        type="button"
      >
        {pendingAction === "join" ? ACADEMY_HOME_COPY.joinPending : ACADEMY_HOME_COPY.joinButton}
      </Button>
      }
      {actionErrors.join ? (
        <p className={cn(styles.AcademyHome__error, styles.AcademyHome__actionError)} role="alert">
          {actionErrors.join}
        </p>
      ) : null}
    </div>
  );
}

/** Benefits and price of the offer, or a placeholder while it is empty. */
function AcademyOfferContent({ canManage, offer, tribeSlug }: Omit<AcademyOfferPartProps, "home">) {
  const hasOfferContent = Boolean(offer.description || offer.benefits.length > 0 || offer.price);

  return (
    <>
      {offer.benefits.length > 0 ? (
        <ul className={styles.AcademyHome__benefits}>
          {offer.benefits.map((benefit) => (
            <li className={styles.AcademyHome__benefit} key={benefit}>
              <CheckIcon aria-hidden className={styles.AcademyHome__benefitIcon} />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {offer.price ? (
        <dl className={styles.AcademyHome__price}>
          <dt className={styles.AcademyHome__priceLabel}>{ACADEMY_HOME_COPY.priceLabel}</dt>
          <dd className={styles.AcademyHome__priceValue}>{formatAcademyPrice(offer.price)}</dd>
        </dl>
      ) : null}

      {!hasOfferContent ? (
        <div className={styles.AcademyHome__empty}>
          <p className={styles.AcademyHome__text}>
            {canManage ? ACADEMY_HOME_COPY.emptyOfferLeader : ACADEMY_HOME_COPY.emptyOfferMember}
          </p>
          {canManage ? (
            <Link
              className={styles.AcademyHome__secondaryLink}
              href={ROUTES.tribes.academyManage(tribeSlug)}
            >
              {ACADEMY_HOME_COPY.configureOffer}
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** "La academia": offer, entry action for visitors and community notes. */
function AcademyOfferSection({ canManage, home, offer, tribeSlug }: AcademyOfferPartProps) {
  return (
    <section aria-labelledby="academy-offer-heading" className={styles.AcademyHome__section}>
      <h2 className={styles.AcademyHome__sectionTitle} id="academy-offer-heading">
        {ACADEMY_HOME_COPY.offerHeading}
      </h2>

      <AcademyOfferContent canManage={canManage} offer={offer} tribeSlug={tribeSlug} />

      {home.access === null ? (
        <AcademyAdmissionAction home={home} offer={offer} tribeSlug={tribeSlug} />
      ) : null}

      <ul className={styles.AcademyHome__notes}>
        {!offer.salesEnabled ? (
          <li className={styles.AcademyHome__note}>
            <PauseCircleIcon aria-hidden className={styles.AcademyHome__icon} />
            <span>{ACADEMY_HOME_COPY.salesPaused}</span>
          </li>
        ) : null}
        <li className={styles.AcademyHome__note}>
          <MessageCircleIcon aria-hidden className={styles.AcademyHome__icon} />
          <span>{ACADEMY_HOME_COPY.whatsappNote}</span>
        </li>
      </ul>
    </section>
  );
}

/** Confirmation before cancelling the renewal or the pending subscription. */
function AcademyCancelDialog({ home }: Pick<AcademyHomeSectionProps, "home">) {
  const { actionErrors, pendingAction } = home;
  const cancelDialogCopy = CANCEL_DIALOG_COPY[home.cancelingRenewalStatus];

  return (
    <Dialog onOpenChange={home.setIsCancelDialogOpen} open={home.isCancelDialogOpen}>
      <DialogContent
        title={cancelDialogCopy.title}
        description={cancelDialogCopy.description}
        footer={
          <>
            <Button
              disabled={pendingAction !== null}
              onClick={() => home.setIsCancelDialogOpen(false)}
              type="button"
              variant="secondary"
            >
              {ACADEMY_HOME_COPY.cancelKeep}
            </Button>
            <Button
              aria-busy={pendingAction === "cancel" || undefined}
              disabled={pendingAction !== null}
              onClick={home.handleCancel}
              type="button"
              variant="danger"
            >
              {pendingAction === "cancel" ? ACADEMY_HOME_COPY.cancelPending : ACADEMY_HOME_COPY.cancelConfirm}
            </Button>
          </>
        }
      >
        {actionErrors.cancel ? (
          <p className={styles.AcademyHome__error} role="alert">
            {actionErrors.cancel}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Academy home: own status, differential offer, requirements, price and the
 * next action. Every decision shown comes from the server status; the page
 * never claims a cancellation, approval or coverage before it is confirmed.
 *
 * @param props - Offer, own status and tribe slug.
 * @returns Academy page content.
 */
export function AcademyHome(props: AcademyHomeProps) {
  const { canManage, offer, tribeSlug } = props;
  const home = useAcademyHome(props);
  const { access, status } = home;

  return (
    <div className={styles.AcademyHome}>
      <AcademyHomeHeader canManage={canManage} offer={offer} tribeSlug={tribeSlug} />
      <AcademyHomeNotices home={home} tribeSlug={tribeSlug} />

      {access && status ? (
        <AcademyAccessSection access={access} home={home} status={status} tribeSlug={tribeSlug} />
      ) : null}

      {offer ? (
        <AcademyOfferSection canManage={canManage} home={home} offer={offer} tribeSlug={tribeSlug} />
      ) : null}

      <AcademyCancelDialog home={home} />
    </div>
  );
}
