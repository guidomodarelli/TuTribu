"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "beez-ui";

import { Link } from "@/components/navigation/link";
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
  basicLevel: "Tu nivel actual es básico: podés ver los cursos básicos y tus pasos personales.",
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
  leaderPreview: "Ves la academia con la vista administrativa de líder; no es un acceso comercial.",
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

  return (
    <main className={styles.AcademyHome}>
      <header className={styles.AcademyHome__header}>
        <h1 className={styles.AcademyHome__title}>{title}</h1>
        {offer?.description ? (
          <p className={styles.AcademyHome__description}>{offer.description}</p>
        ) : null}
        {canManage ? (
          <Link className={styles.AcademyHome__secondaryLink} href={ROUTES.tribes.academyManage(tribeSlug)}>
            {ACADEMY_HOME_COPY.manageLink}
          </Link>
        ) : null}
      </header>

      {showConfirming ? (
        <p className={styles.AcademyHome__notice} role="status">
          {ACADEMY_HOME_COPY.confirmingPayment}
        </p>
      ) : null}

      {notice ? (
        <p className={styles.AcademyHome__notice} role="status">
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
          {ACADEMY_HOME_COPY.legacyMode}{" "}
          <Link href={ROUTES.tribes.settings(tribeSlug)}>{ACADEMY_HOME_COPY.legacySettingsLink}</Link>
        </p>
      ) : null}

      {access && access.accessModel === "academy" ? (
        <section aria-labelledby="academy-access-heading" className={styles.AcademyHome__section}>
          <h2 className={styles.AcademyHome__sectionTitle} id="academy-access-heading">
            {ACADEMY_HOME_COPY.accessHeading}
          </h2>
          {access.nextAction === "contact_support" ? (
            <p className={styles.AcademyHome__text}>{ACADEMY_HOME_COPY.supportNeeded}</p>
          ) : (
            <p className={styles.AcademyHome__text}>{describeCoverage(access)}</p>
          )}
          {access.isLeaderPreview ? (
            <p className={styles.AcademyHome__muted}>{ACADEMY_HOME_COPY.leaderPreview}</p>
          ) : null}
          {RENEWAL_MESSAGE[access.renewalStatus] && access.renewalStatus !== "pending" ? (
            <p className={styles.AcademyHome__muted}>{RENEWAL_MESSAGE[access.renewalStatus]}</p>
          ) : null}
          {access.level === "basic" && access.eligibility === "pending" ? (
            <p className={styles.AcademyHome__text}>{ACADEMY_HOME_COPY.eligibilityPending}</p>
          ) : null}
          {access.level === "basic" &&
          (access.eligibility === "not_requested" || access.eligibility === "not_verified") ? (
            <p className={styles.AcademyHome__text}>{ACADEMY_HOME_COPY.eligibilityRequired}</p>
          ) : null}

          <div className={styles.AcademyHome__actions}>
            {access.level === "academy" || access.isLeaderPreview ? (
              <Link className={styles.AcademyHome__primaryLink} href={ROUTES.tribes.courses(tribeSlug)}>
                {ACADEMY_HOME_COPY.continueLearning}
              </Link>
            ) : (
              <Link className={styles.AcademyHome__secondaryLink} href={ROUTES.tribes.courses(tribeSlug)}>
                {ACADEMY_HOME_COPY.continueLearning}
              </Link>
            )}
            {access.eligibility !== "verified" && access.nextAction !== "contact_support" ? (
              <Link
                className={styles.AcademyHome__secondaryLink}
                href={ROUTES.tribes.academyVerification(tribeSlug)}
              >
                {ACADEMY_HOME_COPY.verificationLink}
              </Link>
            ) : null}
            {access.canStartCheckout ? (
              <Button
                aria-busy={pendingAction === "checkout" || undefined}
                disabled={pendingAction !== null}
                onClick={handleCheckout}
                type="button"
              >
                {pendingAction === "checkout"
                  ? ACADEMY_HOME_COPY.checkoutPending
                  : ACADEMY_HOME_COPY.checkoutButton}
              </Button>
            ) : null}
            {showConfirming || access.renewalStatus === "canceling" ? (
              <Button
                aria-busy={pendingAction === "refresh" || undefined}
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
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          ) : null}
          {offer.price ? (
            <dl className={styles.AcademyHome__price}>
              <dt>{ACADEMY_HOME_COPY.priceLabel}</dt>
              <dd className={styles.AcademyHome__priceValue}>{formatAcademyPrice(offer.price)}</dd>
            </dl>
          ) : null}
          {!offer.salesEnabled ? (
            <p className={styles.AcademyHome__muted}>{ACADEMY_HOME_COPY.salesPaused}</p>
          ) : null}
          <p className={styles.AcademyHome__muted}>{ACADEMY_HOME_COPY.whatsappNote}</p>
          {access === null ? (
            offer.admissionEnabled ? (
              <div className={styles.AcademyHome__actions}>
                <Button
                  aria-busy={pendingAction === "join" || undefined}
                  disabled={pendingAction !== null}
                  onClick={handleJoin}
                  type="button"
                >
                  {pendingAction === "join" ? ACADEMY_HOME_COPY.joinPending : ACADEMY_HOME_COPY.joinButton}
                </Button>
              </div>
            ) : (
              <p className={styles.AcademyHome__text}>{ACADEMY_HOME_COPY.admissionClosed}</p>
            )
          ) : null}
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
