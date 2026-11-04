"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
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
  AcademyCancelRenewalDto,
  AcademyOfferDto,
  AcademyReconcileDto,
} from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import styles from "./styles.module.scss";

const ACADEMY_HOME_COPY = {
  accessHeading: "Tu acceso",
  accessUnbounded: "Tenés acceso a la academia sin vencimiento.",
  admissionClosed: "Las admisiones de esta tribu no están abiertas en este momento.",
  admissionRequestLink: "Solicitar ingreso",
  awaitingPayment:
    "Tu suscripción espera el pago en Mercado Pago. Si ya pagaste, no hace falta que vuelvas a pagar; si no terminaste, podés continuar el pago.",
  basicCourses: "Ver cursos básicos",
  basicLevel: "Podés ver los cursos básicos. Seguí estos pasos para sumar la academia.",
  configureOffer: "Configurar la oferta",
  continuePayment: "Continuar el pago",
  emptyOfferGuardian: "Quien lidera la tribu todavía no cargó la oferta.",
  emptyOfferLeader:
    "Todavía no cargaste la oferta. Agregá un título, una explicación y los beneficios para que tus integrantes sepan qué incluye la academia.",
  emptyOfferMember: "Pronto vas a ver acá qué incluye la academia.",
  eyebrow: "Academia de la tribu",
  leaderPreviewMessage: "Como líder ves todo el contenido de la academia.",
  membershipRecoverable: "Tu membresía en la tribu está inactiva. Podés volver a ingresar a la academia.",
  paymentRejected:
    "Mercado Pago rechazó el último cobro. Revisá tu medio de pago en Mercado Pago y después tocá «Actualizar estado».",
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
  cancelDialogNoPaidAccessDescription:
    "Se detienen los próximos cobros. Tu cuenta y tu progreso siguen guardados.",
  cancelDialogTitle: "¿Cancelar la renovación de la academia?",
  cancelKeep: "Mantener renovación",
  cancelPending: "Cancelando…",
  cancelPendingSubscriptionDialogDescription:
    "Se cancela la suscripción que está esperando la confirmación del pago y no se generan cobros nuevos. Tu cuenta y tu progreso siguen guardados.",
  cancelPendingSubscriptionDialogTitle: "¿Cancelar la suscripción a la academia?",
  cancelRetryButton: "Reintentar cancelación",
  canceledPendingSubscription:
    "Cancelaste la suscripción que estaba esperando la confirmación del pago. No se generan cobros nuevos.",
  canceledRenewal: "Cancelaste la renovación. No se generan cobros nuevos.",
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
  renewalPaused: "Tu renovación está pausada en Mercado Pago.",
  salesPaused: "La venta de la academia está pausada.",
  supportNeeded: "Tu membresía no permite usar la academia. Contactá a quien administra la tribu.",
  verificationLink: "Solicitar verificación",
  whatsappNote: "La conversación de la comunidad sigue en WhatsApp.",
} as const;

/** The member has no academy subscription yet: nothing to reconcile. */
const HTTP_STATUS_NOT_FOUND = 404;

/** The action's precondition changed on the server (offer, admission mode, subscription). */
const HTTP_STATUS_CONFLICT = 409;

/** Admissions closed, or the person cannot enter: the offer the page shows is stale. */
const HTTP_STATUS_FORBIDDEN = 403;

/** Statuses after which the page re-renders with the server's current offer and access. */
const STALE_PAGE_HTTP_STATUSES: ReadonlySet<number> = new Set([HTTP_STATUS_CONFLICT, HTTP_STATUS_FORBIDDEN]);

/** The provider was checked moments ago: the reconciliation did not ask it again. */
const RECONCILE_THROTTLED_STATUS: AcademyReconcileDto["status"] = "throttled";

/** The cancellation is recorded but the provider has not confirmed it yet. */
const CANCEL_UNCONFIRMED_STATUS: AcademyCancelRenewalDto["status"] = "cancel_unconfirmed";

/** Fired when the browser restores the page from its back-forward cache. */
const PAGE_SHOW_EVENT = "pageshow";

type AcademyHomeProps = {
  access: AcademyAccessStatusDto | null;
  /** Active leader or guardian: sees the management link. */
  canManage: boolean;
  /** Active leader: the only role that edits the offer. */
  canConfigureOffer: boolean;
  isCheckoutReturn: boolean;
  offer: AcademyOfferDto | null;
  tribeSlug: string;
};

type AcademyHomeAction = "cancel" | "checkout" | "join" | "refresh";

type PendingAction = AcademyHomeAction | null;

/** Each action keeps its own error, shown next to the control that failed. */
type ActionErrors = Record<AcademyHomeAction, string | null>;

const NO_ACTION_ERRORS: ActionErrors = { cancel: null, checkout: null, join: null, refresh: null };

/** A confirmed outcome, or an informative one the member still has to follow up. */
type HomeNotice = { message: string; tone: "info" | "success" };

/**
 * Renewals the member can cancel: a confirmed or paused one, one whose
 * subscription still waits for its payment, or one whose earlier cancellation
 * was recorded but not confirmed (the server accepts the retry).
 */
type CancelableRenewalStatus = "active" | "canceling" | "paused" | "pending";

/**
 * Whether the member can cancel this renewal from the academy home.
 *
 * @param renewalStatus - Renewal status confirmed by the server.
 * @returns True for a live renewal or a cancellation still to confirm.
 */
function isCancelableRenewal(
  renewalStatus: AcademyAccessStatusDto["renewalStatus"]
): renewalStatus is CancelableRenewalStatus {
  return (
    renewalStatus === "active" ||
    renewalStatus === "canceling" ||
    renewalStatus === "paused" ||
    renewalStatus === "pending"
  );
}

/**
 * What the cancellation stops: a subscription still waiting for its payment,
 * a renewal with paid access to keep, or one without paid access.
 */
type CancelKind = "noPaidAccess" | "paidAccess" | "pendingPayment";

/** Only paid access in force is promised to be kept; a pending payment has none. */
const CANCEL_DIALOG_COPY: Record<CancelKind, { description: string; title: string }> = {
  noPaidAccess: {
    description: ACADEMY_HOME_COPY.cancelDialogNoPaidAccessDescription,
    title: ACADEMY_HOME_COPY.cancelDialogTitle,
  },
  paidAccess: {
    description: ACADEMY_HOME_COPY.cancelDialogDescription,
    title: ACADEMY_HOME_COPY.cancelDialogTitle,
  },
  pendingPayment: {
    description: ACADEMY_HOME_COPY.cancelPendingSubscriptionDialogDescription,
    title: ACADEMY_HOME_COPY.cancelPendingSubscriptionDialogTitle,
  },
};

/**
 * Whether a subscription payment may still be confirmed: a renewal that is
 * pending, or one already active whose first period is not covered yet (the
 * provider authorized the subscription before approving its invoice). A
 * rejected last payment is not in progress: the member must act on it.
 *
 * @param access - Confirmed access status.
 * @returns True while the member should keep waiting instead of contracting again.
 */
function isPaymentInProgress(access: AcademyAccessStatusDto): boolean {
  if (access.lastPaymentRejected) {
    return false;
  }

  return access.renewalStatus === "pending" || (access.renewalStatus === "active" && access.level === "basic");
}

/**
 * Picks what the cancellation of the current renewal stops.
 *
 * @param access - Confirmed access status.
 * @returns The cancellation kind that selects the dialog copy and its outcome.
 */
function resolveCancelKind(access: AcademyAccessStatusDto): CancelKind {
  if (isPaymentInProgress(access)) {
    return "pendingPayment";
  }

  return access.hasPaidCoverage ? "paidAccess" : "noPaidAccess";
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

  if (access.lastPaymentRejected) {
    return ACADEMY_HOME_COPY.paymentRejected;
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
  paused: ACADEMY_HOME_COPY.renewalPaused,
  pending: ACADEMY_HOME_COPY.confirmingPayment,
};

type AccessStatusTone = "muted" | "neutral" | "success" | "warning";

type AccessStatusView = {
  /** The courses page is reachable: a blocked or removed membership has none. */
  canOpenCourses: boolean;
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
      canOpenCourses: false,
      detail: renewal,
      isLearning: false,
      label: ACADEMY_HOME_COPY.statusNoAccess,
      message: access.membershipRecovery
        ? ACADEMY_HOME_COPY.membershipRecoverable
        : ACADEMY_HOME_COPY.supportNeeded,
      showSteps: false,
      tone: "warning",
    };
  }

  if (access.level === "academy") {
    return {
      canOpenCourses: true,
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
      canOpenCourses: true,
      detail: ACADEMY_HOME_COPY.leaderPreview,
      isLearning: true,
      label: ACADEMY_HOME_COPY.statusLeader,
      message: ACADEMY_HOME_COPY.leaderPreviewMessage,
      showSteps: false,
      tone: "neutral",
    };
  }

  return {
    canOpenCourses: true,
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

/** Renewals of a subscription that already exists: the step describes it, not paused sales. */
const EXISTING_SUBSCRIPTION_RENEWAL_STATUSES: ReadonlySet<AcademyAccessStatusDto["renewalStatus"]> = new Set([
  "active",
  "canceling",
  "paused",
  "pending",
]);

/**
 * Description of the access step: locked until verified, then the monthly
 * subscription (to contract or already contracted), or paused sales.
 */
function describeAccessStep(access: AcademyAccessStatusDto): string {
  if (access.eligibility !== "verified") {
    return ACADEMY_HOME_COPY.stepAccessLocked;
  }

  if (access.canStartCheckout || EXISTING_SUBSCRIPTION_RENEWAL_STATUSES.has(access.renewalStatus)) {
    return ACADEMY_HOME_COPY.stepAccessCheckout;
  }

  return ACADEMY_HOME_COPY.stepAccessPaused;
}

/**
 * Outcome of a confirmed cancellation: a pending subscription and a renewal
 * without paid access have nothing to keep; paid access is kept until its end.
 */
function describeCancelOutcome(cancelKind: CancelKind, endsAt: string | null): string {
  if (cancelKind === "pendingPayment") {
    return ACADEMY_HOME_COPY.canceledPendingSubscription;
  }

  return cancelKind === "paidAccess" && endsAt
    ? ACADEMY_HOME_COPY.canceledUntil(formatAcademyDate(endsAt))
    : ACADEMY_HOME_COPY.canceledRenewal;
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
  // `router.refresh()` keeps client state: a new server render of the status
  // (after joining, for example) replaces the copy held here.
  const [renderedAccess, setRenderedAccess] = useState(initialAccess);

  if (initialAccess !== renderedAccess) {
    setRenderedAccess(initialAccess);
    setAccess(initialAccess);
  }

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [notice, setNotice] = useState<HomeNotice | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<ActionErrors>(NO_ACTION_ERRORS);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  // Frozen when the dialog opens: its copy and the outcome describe what the member chose to cancel.
  const [cancelKind, setCancelKind] = useState<CancelKind>("paidAccess");
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
    cancelKind,
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
    setCancelKind,
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
  const { reloadAccess, runAction, setActionError } = runner;

  const handleJoin = () =>
    runAction("join", async () => {
      const result = await joinAcademy(tribeSlug);

      if (!result.isSuccess) {
        setActionError("join", result.message);

        // The tribe now asks for a request or closed admissions: show its current offer.
        if (STALE_PAGE_HTTP_STATUSES.has(result.status)) {
          state.router.refresh();
        }

        return;
      }

      state.setNotice({ message: result.data.message, tone: "success" });
      // The new access shows at once; the refresh re-renders the membership-dependent
      // parts of the page (management link, navigation) on the server.
      await reloadAccess();
      state.router.refresh();
    });

  const handleCheckout = () =>
    runAction("checkout", async () => {
      if (!offer) {
        return;
      }

      const result = await startAcademyCheckout(tribeSlug, {
        acceptedOfferVersion: offer.offerVersion,
        acceptedPrice: offer.price
          ? { amountCents: offer.price.amountCents, currency: offer.price.currency }
          : null,
      });

      if (!result.isSuccess) {
        setActionError("checkout", result.message);

        // The offer, its price or the subscription changed: show the current ones.
        if (result.status === HTTP_STATUS_CONFLICT) {
          state.router.refresh();
        }

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

        // Nothing left to cancel (another tab or the provider did it): show the current renewal.
        if (result.status === HTTP_STATUS_NOT_FOUND) {
          state.setIsCancelDialogOpen(false);
          await reloadAccess();
        }

        return;
      }

      state.setIsCancelDialogOpen(false);
      // The canceled subscription leaves no payment to wait for, and an earlier refresh outcome is stale.
      state.setIsAwaitingCheckoutReturn(false);
      state.setRefreshNotice(null);
      const updated = await reloadAccess();

      if (result.data.status === CANCEL_UNCONFIRMED_STATUS) {
        // Recorded but not confirmed: the reread shows it as pending confirmation.
        state.setNotice({ message: result.data.message, tone: "info" });

        return;
      }

      if (!updated) {
        // The server confirmed the cancellation: without a fresh read the old renewal must not stay cancelable.
        state.setAccess((current) => (current ? { ...current, renewalStatus: "canceled" } : current));
        setActionError("refresh", ACADEMY_HOME_COPY.refreshReadFailed);
      }

      const endsAt = updated?.accessEndsAt ?? state.access?.accessEndsAt ?? null;

      state.setNotice({ message: describeCancelOutcome(state.cancelKind, endsAt), tone: "success" });
    });

  const openCancelDialog = (access: AcademyAccessStatusDto) => {
    // The dialog never inherits an error from an earlier attempt or another action.
    setActionError("cancel", null);
    state.setCancelKind(resolveCancelKind(access));
    state.setIsCancelDialogOpen(true);
  };

  // The request in flight decides the outcome: the dialog stays open until it answers.
  // Closing it afterwards dismisses the error the member already read inside it.
  const setCancelDialogOpen = (isOpen: boolean) => {
    if (!isOpen && state.pendingAction === "cancel") {
      return;
    }

    if (!isOpen) {
      setActionError("cancel", null);
    }

    state.setIsCancelDialogOpen(isOpen);
  };

  return { handleCancel, openCancelDialog, setCancelDialogOpen };
}

/** How the page offers entry: a free join, or the admission request form. */
type EntryMode = "admission_request" | "free_join";

/**
 * Entry offered by the page: to a visitor (by the offer), or to a member whose
 * inactive membership can be recovered (by the server's recovery decision).
 */
function resolveEntryMode(access: AcademyAccessStatusDto | null, offer: AcademyOfferDto): EntryMode | null {
  if (access === null) {
    return offer.admissionRequiresRequest ? "admission_request" : "free_join";
  }

  return access.membershipRecovery;
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
  const showConfirming =
    access !== null &&
    (isPaymentInProgress(access) ||
      (state.isAwaitingCheckoutReturn && access.level === "basic" && !access.lastPaymentRejected));

  return {
    ...state,
    ...createEntryActions(context),
    ...createCancelActions(context),
    cancelableRenewalStatus:
      access && isCancelableRenewal(access.renewalStatus) ? access.renewalStatus : null,
    entryMode: offer ? resolveEntryMode(access, offer) : null,
    handleRefresh: createRefreshAction(context),
    showConfirming,
    // A checkout that reached the provider and still waits for its payment can be resumed.
    showContinuePayment: access?.renewalStatus === "pending" && offer !== null,
    // A failed reread keeps the refresh: it is the way to read the status again without reloading the page.
    showRefresh:
      showConfirming ||
      access?.renewalStatus === "canceling" ||
      access?.lastPaymentRejected === true ||
      Boolean(state.actionErrors.refresh),
    status,
    steps: access && isAcademyMode && status?.showSteps ? buildAccessSteps(access) : [],
  };
}

type AcademyHomeController = ReturnType<typeof useAcademyHome>;

type AcademyHomeSectionProps = {
  canConfigureOffer: boolean;
  canManage: boolean;
  home: AcademyHomeController;
  offer: AcademyOfferDto | null;
  tribeSlug: string;
};

/** Title, offer description and the manage link for leaders. */
function AcademyHomeHeader({ canManage, offer, tribeSlug }: Pick<AcademyHomeSectionProps, "canManage" | "offer" | "tribeSlug">) {
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

/** Payment confirmation or rejection, last outcome and legacy mode notices. */
function AcademyHomeNotices({ home, tribeSlug }: Pick<AcademyHomeSectionProps, "home" | "tribeSlug">) {
  const NoticeIcon = home.notice?.tone === "info" ? InfoIcon : CheckIcon;

  return (
    <>
      {home.access?.lastPaymentRejected ? (
        <p className={cn(styles.AcademyHome__notice, styles["AcademyHome__notice--warning"])} role="status">
          <AlertTriangleIcon aria-hidden className={styles.AcademyHome__icon} />
          {ACADEMY_HOME_COPY.paymentRejected}
        </p>
      ) : null}

      {home.showConfirming ? (
        <p className={styles.AcademyHome__notice} role="status">
          <ClockIcon aria-hidden className={styles.AcademyHome__icon} />
          {home.access?.renewalStatus === "pending"
            ? ACADEMY_HOME_COPY.awaitingPayment
            : ACADEMY_HOME_COPY.confirmingPayment}
        </p>
      ) : null}

      {home.notice ? (
        <p className={styles.AcademyHome__notice} role="status">
          <NoticeIcon aria-hidden className={styles.AcademyHome__icon} />
          {home.notice.message}
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

/** Contract button of the access step, or the resume button of a pending checkout. */
function AcademyCheckoutButton({ home, label }: { home: AcademyHomeController; label: string }) {
  const { pendingAction } = home;

  return (
    <Button
      aria-busy={pendingAction === "checkout" || undefined}
      className={styles.AcademyHome__actionButton}
      disabled={pendingAction !== null}
      onClick={home.handleCheckout}
      type="button"
    >
      {pendingAction === "checkout" ? ACADEMY_HOME_COPY.checkoutPending : label}
    </Button>
  );
}

/** One step toward the academy, with its verification link or checkout button. */
function AcademyAccessStepItem({ access, home, step, stepIndex, tribeSlug }: AcademyAccessStepItemProps) {
  const { actionErrors } = home;
  const isAccessStep = step.key === "access";

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
        {isAccessStep && access.canStartCheckout && !home.showConfirming ? (
          <AcademyCheckoutButton home={home} label={ACADEMY_HOME_COPY.checkoutButton} />
        ) : null}
        {isAccessStep && home.showContinuePayment ? (
          <AcademyCheckoutButton home={home} label={ACADEMY_HOME_COPY.continuePayment} />
        ) : null}
        {isAccessStep && actionErrors.checkout ? (
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
  const { actionErrors, cancelableRenewalStatus, pendingAction } = home;

  return (
    <div className={styles.AcademyHome__actions}>
      {status.canOpenCourses ? (
        <Link
          className={
            status.isLearning ? styles.AcademyHome__primaryLink : styles.AcademyHome__secondaryLink
          }
          href={ROUTES.tribes.courses(tribeSlug)}
        >
          {status.isLearning ? ACADEMY_HOME_COPY.continueLearning : ACADEMY_HOME_COPY.basicCourses}
          <ArrowRightIcon aria-hidden className={styles.AcademyHome__icon} />
        </Link>
      ) : null}
      {home.showRefresh ? (
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
          onClick={() => home.openCancelDialog(access)}
          type="button"
          variant="secondary"
        >
          {cancelableRenewalStatus === "canceling"
            ? ACADEMY_HOME_COPY.cancelRetryButton
            : ACADEMY_HOME_COPY.cancelButton}
        </Button>
      ) : null}
      {actionErrors.cancel && !home.isCancelDialogOpen ? (
        <p className={cn(styles.AcademyHome__error, styles.AcademyHome__actionError)} role="alert">
          {actionErrors.cancel}
        </p>
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

type AcademyOfferPartProps = Pick<AcademyHomeSectionProps, "canConfigureOffer" | "canManage" | "home" | "tribeSlug"> & {
  offer: AcademyOfferDto;
};

/** Free join or admission request, or the closed admissions notice. */
function AcademyAdmissionAction({
  entryMode,
  home,
  offer,
  tribeSlug,
}: Pick<AcademyOfferPartProps, "home" | "offer" | "tribeSlug"> & { entryMode: EntryMode }) {
  const { actionErrors, pendingAction } = home;

  if (!offer.admissionEnabled) {
    return <p className={styles.AcademyHome__text}>{ACADEMY_HOME_COPY.admissionClosed}</p>;
  }

  return (
    <div className={styles.AcademyHome__actions}>
      {entryMode === "admission_request" ? (
        <Link className={styles.AcademyHome__secondaryLink} href={buildAdmissionEntryRoute(tribeSlug)}>
          {ACADEMY_HOME_COPY.admissionRequestLink}
        </Link>
      ) : (
        <Button
          aria-busy={pendingAction === "join" || undefined}
          disabled={pendingAction !== null}
          onClick={home.handleJoin}
          type="button"
        >
          {pendingAction === "join" ? ACADEMY_HOME_COPY.joinPending : ACADEMY_HOME_COPY.joinButton}
        </Button>
      )}
      {actionErrors.join ? (
        <p className={cn(styles.AcademyHome__error, styles.AcademyHome__actionError)} role="alert">
          {actionErrors.join}
        </p>
      ) : null}
    </div>
  );
}

/** Placeholder of an empty offer: the leader configures it; a guardian or member waits. */
function describeEmptyOffer(canConfigureOffer: boolean, canManage: boolean): string {
  if (canConfigureOffer) {
    return ACADEMY_HOME_COPY.emptyOfferLeader;
  }

  return canManage ? ACADEMY_HOME_COPY.emptyOfferGuardian : ACADEMY_HOME_COPY.emptyOfferMember;
}

/** Benefits and price of the offer, or a placeholder while it is empty. */
function AcademyOfferContent({ canConfigureOffer, canManage, offer, tribeSlug }: Omit<AcademyOfferPartProps, "home">) {
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
          <p className={styles.AcademyHome__text}>{describeEmptyOffer(canConfigureOffer, canManage)}</p>
          {canConfigureOffer ? (
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

/** "La academia": offer, entry action for visitors and recoverable members, and community notes. */
function AcademyOfferSection({ canConfigureOffer, canManage, home, offer, tribeSlug }: AcademyOfferPartProps) {
  return (
    <section aria-labelledby="academy-offer-heading" className={styles.AcademyHome__section}>
      <h2 className={styles.AcademyHome__sectionTitle} id="academy-offer-heading">
        {ACADEMY_HOME_COPY.offerHeading}
      </h2>

      <AcademyOfferContent
        canConfigureOffer={canConfigureOffer}
        canManage={canManage}
        offer={offer}
        tribeSlug={tribeSlug}
      />

      {home.entryMode ? (
        <AcademyAdmissionAction entryMode={home.entryMode} home={home} offer={offer} tribeSlug={tribeSlug} />
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
  const cancelDialogCopy = CANCEL_DIALOG_COPY[home.cancelKind];
  const isCanceling = pendingAction === "cancel";

  return (
    <Dialog onOpenChange={home.setCancelDialogOpen} open={home.isCancelDialogOpen}>
      <DialogContent
        title={cancelDialogCopy.title}
        description={cancelDialogCopy.description}
        showCloseButton={!isCanceling}
        footer={
          <>
            <Button
              disabled={pendingAction !== null}
              onClick={() => home.setCancelDialogOpen(false)}
              type="button"
              variant="secondary"
            >
              {ACADEMY_HOME_COPY.cancelKeep}
            </Button>
            <Button
              aria-busy={isCanceling || undefined}
              disabled={pendingAction !== null}
              onClick={home.handleCancel}
              type="button"
              variant="danger"
            >
              {isCanceling ? ACADEMY_HOME_COPY.cancelPending : ACADEMY_HOME_COPY.cancelConfirm}
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
 * @param props - Offer, own status, management roles and tribe slug.
 * @returns Academy page content.
 */
export function AcademyHome(props: AcademyHomeProps) {
  const { canConfigureOffer, canManage, offer, tribeSlug } = props;
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
        <AcademyOfferSection
          canConfigureOffer={canConfigureOffer}
          canManage={canManage}
          home={home}
          offer={offer}
          tribeSlug={tribeSlug}
        />
      ) : null}

      <AcademyCancelDialog home={home} />
    </div>
  );
}
