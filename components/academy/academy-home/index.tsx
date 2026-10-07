"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "beez-ui";

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
  refreshButton: "Actualizar estado",
  refreshPending: "Actualizando…",
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

type AcademyHomeProps = {
  access: AcademyAccessStatusDto | null;
  canManage: boolean;
  isCheckoutReturn: boolean;
  offer: AcademyOfferDto | null;
  tribeSlug: string;
};

type PendingAction = "cancel" | "checkout" | "join" | "refresh" | null;

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
  const verifyState: AccessStepState = isVerified
    ? "done"
    : access.eligibility === "pending"
      ? "waiting"
      : "current";

  return [
    {
      description: isVerified
        ? ACADEMY_HOME_COPY.stepVerifyDone
        : access.eligibility === "pending"
          ? ACADEMY_HOME_COPY.eligibilityPending
          : ACADEMY_HOME_COPY.eligibilityRequired,
      key: "verify",
      state: verifyState,
      title: ACADEMY_HOME_COPY.stepVerifyTitle,
    },
    {
      description: !isVerified
        ? ACADEMY_HOME_COPY.stepAccessLocked
        : access.canStartCheckout
          ? ACADEMY_HOME_COPY.stepAccessCheckout
          : ACADEMY_HOME_COPY.stepAccessPaused,
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

/**
 * Academy home: own status, differential offer, requirements, price and the
 * next action. Every decision shown comes from the server status; the page
 * never claims a cancellation, approval or coverage before it is confirmed.
 *
 * @param props - Offer, own status and tribe slug.
 * @returns Academy page content.
 */
export function AcademyHome({
  access: initialAccess,
  canManage,
  isCheckoutReturn,
  offer,
  tribeSlug,
}: AcademyHomeProps) {
  const router = useRouter();
  const [access, setAccess] = useState(initialAccess);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  // Blocks a second submit before the disabled state renders (double click).
  const isBusyRef = useRef(false);
  // Once the provider checkout opens the page is leaving: keep actions locked.
  const isLeavingRef = useRef(false);

  const runAction = async (action: Exclude<PendingAction, null>, work: () => Promise<void>) => {
    if (isBusyRef.current || isLeavingRef.current) {
      return;
    }

    isBusyRef.current = true;
    setPendingAction(action);
    setErrorMessage(null);

    try {
      await work();
    } finally {
      isBusyRef.current = false;
      setPendingAction(null);
    }
  };

  const reloadAccess = async (): Promise<AcademyAccessStatusDto | null> => {
    const result = await fetchOwnAcademyAccess(tribeSlug);

    if (result.isSuccess) {
      setAccess(result.data);

      return result.data;
    }

    return null;
  };

  const handleJoin = () =>
    runAction("join", async () => {
      const result = await joinAcademy(tribeSlug);

      if (!result.isSuccess) {
        setErrorMessage(result.message);
        toast.error(result.message);

        return;
      }

      // Joining changes the membership (an authorization state): a full
      // refresh re-renders the page with the new server-side access.
      router.refresh();
    });

  const handleCheckout = () =>
    runAction("checkout", async () => {
      if (!offer) {
        return;
      }

      const result = await startAcademyCheckout(tribeSlug, offer.offerVersion);

      if (!result.isSuccess) {
        setErrorMessage(result.message);
        toast.error(result.message);

        return;
      }

      isLeavingRef.current = true;
      navigateToUrl(result.data.checkoutUrl);
    });

  const handleRefresh = () =>
    runAction("refresh", async () => {
      const reconciliation = await reconcileAcademyCoverage(tribeSlug);

      if (!reconciliation.isSuccess && reconciliation.status !== HTTP_STATUS_NOT_FOUND) {
        setErrorMessage(reconciliation.message);
      }

      await reloadAccess();
    });

  const handleCancel = () =>
    runAction("cancel", async () => {
      const result = await cancelAcademyRenewal(tribeSlug);

      if (!result.isSuccess) {
        setErrorMessage(result.message);
        toast.error(result.message);

        return;
      }

      setIsCancelDialogOpen(false);
      const updated = await reloadAccess();
      const endsAt = updated?.accessEndsAt ?? access?.accessEndsAt ?? null;
      const message = endsAt
        ? ACADEMY_HOME_COPY.canceledUntil(formatAcademyDate(endsAt))
        : ACADEMY_HOME_COPY.renewalCanceled;

      setNotice(message);
      toast.success(message);
    });

  const title = offer?.title || ACADEMY_HOME_COPY.defaultTitle;
  const showConfirming =
    access !== null && (access.renewalStatus === "pending" || (isCheckoutReturn && access.level === "basic"));
  const isAcademyMode = access?.accessModel === "academy";
  const status = access && isAcademyMode ? resolveAccessStatus(access) : null;
  const steps = access && isAcademyMode && status?.showSteps ? buildAccessSteps(access) : [];
  const hasOfferContent = Boolean(
    offer && (offer.description || offer.benefits.length > 0 || offer.price)
  );

  return (
    <main className={styles.AcademyHome}>
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

      {showConfirming ? (
        <p className={styles.AcademyHome__notice} role="status">
          <ClockIcon aria-hidden className={styles.AcademyHome__icon} />
          {ACADEMY_HOME_COPY.confirmingPayment}
        </p>
      ) : null}

      {notice ? (
        <p className={styles.AcademyHome__notice} role="status">
          <CheckIcon aria-hidden className={styles.AcademyHome__icon} />
          {notice}
        </p>
      ) : null}

      {errorMessage && !isCancelDialogOpen ? (
        <p className={styles.AcademyHome__error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      {access?.accessModel === "legacy" ? (
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

      {access && status ? (
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

          {steps.length > 0 ? (
            <ol aria-label={ACADEMY_HOME_COPY.stepsLabel} className={styles.AcademyHome__steps}>
              {steps.map((step, stepIndex) => (
                <li
                  aria-current={step.state === "current" ? "step" : undefined}
                  className={cn(
                    styles.AcademyHome__step,
                    styles[`AcademyHome__step--${step.state}`]
                  )}
                  key={step.key}
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
                    {step.key === "access" && access.canStartCheckout ? (
                      <Button
                        aria-busy={pendingAction === "checkout" || undefined}
                        className={styles.AcademyHome__actionButton}
                        disabled={pendingAction !== null}
                        onClick={handleCheckout}
                        type="button"
                      >
                        {pendingAction === "checkout"
                          ? ACADEMY_HOME_COPY.checkoutPending
                          : ACADEMY_HOME_COPY.checkoutButton}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

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
            {showConfirming || access.renewalStatus === "canceling" ? (
              <Button
                aria-busy={pendingAction === "refresh" || undefined}
                className={styles.AcademyHome__actionButton}
                disabled={pendingAction !== null}
                onClick={handleRefresh}
                type="button"
                variant="outline"
              >
                {pendingAction === "refresh"
                  ? ACADEMY_HOME_COPY.refreshPending
                  : ACADEMY_HOME_COPY.refreshButton}
              </Button>
            ) : null}
            {access.renewalStatus === "active" ? (
              <Button
                className={styles.AcademyHome__actionButton}
                disabled={pendingAction !== null}
                onClick={() => setIsCancelDialogOpen(true)}
                type="button"
                variant="outline"
              >
                {ACADEMY_HOME_COPY.cancelButton}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {offer ? (
        <section aria-labelledby="academy-offer-heading" className={styles.AcademyHome__section}>
          <h2 className={styles.AcademyHome__sectionTitle} id="academy-offer-heading">
            {ACADEMY_HOME_COPY.offerHeading}
          </h2>

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

          {access === null ? (
            offer.admissionEnabled ? (
              <div className={styles.AcademyHome__actions}>
                {offer.admissionRequiresRequest ? <Link className={styles.AcademyHome__secondaryLink} href={buildAdmissionEntryRoute(tribeSlug)}>Solicitar ingreso</Link> :
                <Button
                  aria-busy={pendingAction === "join" || undefined}
                  disabled={pendingAction !== null}
                  onClick={handleJoin}
                  type="button"
                >
                  {pendingAction === "join" ? ACADEMY_HOME_COPY.joinPending : ACADEMY_HOME_COPY.joinButton}
                </Button>
                }
              </div>
            ) : (
              <p className={styles.AcademyHome__text}>{ACADEMY_HOME_COPY.admissionClosed}</p>
            )
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
      ) : null}

      <Dialog onOpenChange={setIsCancelDialogOpen} open={isCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ACADEMY_HOME_COPY.cancelDialogTitle}</DialogTitle>
            <DialogDescription>{ACADEMY_HOME_COPY.cancelDialogDescription}</DialogDescription>
          </DialogHeader>
          {errorMessage ? (
            <p className={styles.AcademyHome__error} role="alert">
              {errorMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={pendingAction !== null}
              onClick={() => setIsCancelDialogOpen(false)}
              type="button"
              variant="outline"
            >
              {ACADEMY_HOME_COPY.cancelKeep}
            </Button>
            <Button
              aria-busy={pendingAction === "cancel" || undefined}
              disabled={pendingAction !== null}
              onClick={handleCancel}
              type="button"
              variant="destructive"
            >
              {pendingAction === "cancel" ? ACADEMY_HOME_COPY.cancelPending : ACADEMY_HOME_COPY.cancelConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
