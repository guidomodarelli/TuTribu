"use client";

import { useId, useRef, useState, type RefObject, type SubmitEvent } from "react";
import { Button, Dialog, DialogClose, DialogContent, Input } from "@golfo/ui";

import { Link } from "@/components/navigation/link";
import { requestMemberVerification } from "@/lib/academy/academy-api-client";
import { ROUTES } from "@/src/constants/routes";
import type {
  MemberVerificationDto,
  VerificationProviderDto,
} from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
import styles from "./styles.module.scss";

const VERIFICATION_COPY = {
  backLink: "Volver a la academia",
  cancelEmailChange: "Cancelar",
  confirmEmailChange: "Cambiar correo",
  emailChangeDescriptionPrefix: "Tu verificación con ",
  emailChangeDescriptionSuffix:
    " vuelve a revisión y, hasta que la aprueben de nuevo, puede afectar tu acceso a la academia.",
  emailChangeTitle: "¿Cambiar el correo de tu verificación?",
  declaredEmailHelp:
    "Solo si abriste la cuenta con otro email. Nunca pedimos claves, documentos ni saldos.",
  declaredEmailLabel: "Email de la cuenta (opcional)",
  description:
    "Elegí dónde tenés tu cuenta y pedí la verificación. Una persona de la tribu la revisa manualmente; abrir el enlace del proveedor no verifica nada.",
  emptyProviders: "Esta tribu todavía no configuró proveedores de verificación.",
  openProviderLink: "Abrir instrucciones del proveedor",
  requestButton: "Solicitar verificación",
  requestAgainButton: "Volver a solicitar",
  requestPending: "Enviando…",
  requestSuccess: "Tu solicitud está en revisión.",
  statusLabel: "Estado",
  title: "Verificación de vinculación",
  updateDataButton: "Actualizar datos",
} as const;

const STATUS_LABEL: Record<MemberVerificationDto["status"], string> = {
  pending: "En revisión",
  rejected: "Rechazada",
  revoked: "Revocada",
  verified: "Verificada",
};

const NOT_REQUESTED_LABEL = "Sin solicitar";
const VERIFIED_STATUS: MemberVerificationDto["status"] = "verified";
const REASON_SEPARATOR = ": ";

type AcademyVerificationProps = {
  providers: VerificationProviderDto[];
  tribeSlug: string;
  verifications: MemberVerificationDto[];
};

/**
 * Describes the own status of one provider relation.
 *
 * @param verification - Own relation or undefined.
 * @returns Spanish status, including the safe reason when rejected or revoked.
 */
function describeStatus(verification: MemberVerificationDto | undefined): string {
  if (!verification) {
    return NOT_REQUESTED_LABEL;
  }

  const label = STATUS_LABEL[verification.status];

  return verification.decisionReason
    ? label + REASON_SEPARATOR + verification.decisionReason
    : label;
}

/**
 * Normalizes the declared email the same way the server compares it, so a
 * change in spaces or letter case is not treated as a new identity.
 *
 * @param value - Email typed by the member.
 * @returns The normalized email, or null when the field is empty.
 */
function normalizeDeclaredEmail(value: string): string | null {
  const normalizedEmail = value.trim().toLowerCase();

  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

/**
 * Whether sending the typed email reopens an approved verification, which
 * the member must confirm first.
 *
 * @param verification - Own relation or undefined.
 * @param declaredEmail - Email currently typed in the form.
 * @returns True only for a verified relation whose declared email changes.
 */
function reopensApprovedVerification(
  verification: MemberVerificationDto | undefined,
  declaredEmail: string
): boolean {
  return (
    verification?.status === VERIFIED_STATUS &&
    normalizeDeclaredEmail(declaredEmail) !== (verification.declaredEmail ?? null)
  );
}

/**
 * Member verification onboarding: providers, instructions, own status and
 * the request form. Selecting a provider or opening its link never changes
 * the status; only a reviewer decision does.
 *
 * @param props - Active providers, own relations and tribe slug.
 * @returns Verification page content.
 */
export function AcademyVerification({
  providers,
  tribeSlug,
  verifications: initialVerifications,
}: AcademyVerificationProps) {
  const [verifications, setVerifications] = useState(initialVerifications);

  return (
    <div className={styles.AcademyVerification}>
      <header className={styles.AcademyVerification__header}>
        <h1 className={styles.AcademyVerification__title}>{VERIFICATION_COPY.title}</h1>
        <p className={styles.AcademyVerification__description}>{VERIFICATION_COPY.description}</p>
        <Link className={styles.AcademyVerification__link} href={ROUTES.tribes.academy(tribeSlug)}>
          {VERIFICATION_COPY.backLink}
        </Link>
      </header>

      {providers.length === 0 ? (
        <p className={styles.AcademyVerification__description}>{VERIFICATION_COPY.emptyProviders}</p>
      ) : (
        <ul className={styles.AcademyVerification__providers}>
          {providers.map((provider) => (
            <ProviderRequest
              key={provider.id}
              onVerificationChange={(verification) =>
                setVerifications((current) => [
                  ...current.filter((item) => item.providerId !== verification.providerId),
                  verification,
                ])
              }
              provider={provider}
              tribeSlug={tribeSlug}
              verification={verifications.find((item) => item.providerId === provider.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Label of the request button for the current verification state. */
function resolveRequestButtonLabel(verification: MemberVerificationDto | undefined): string {
  if (!verification) {
    return VERIFICATION_COPY.requestButton;
  }

  return verification.status === "pending" || verification.status === "verified"
    ? VERIFICATION_COPY.updateDataButton
    : VERIFICATION_COPY.requestAgainButton;
}

type RequestFeedbackState = { isError: boolean; message: string };

/** Outcome of the last request: an alert on failure, a status otherwise. */
function RequestFeedback({ feedback }: { feedback: RequestFeedbackState | null }) {
  if (!feedback) {
    return null;
  }

  return (
    <p
      className={
        feedback.isError
          ? styles.AcademyVerification__error
          : styles.AcademyVerification__help
      }
      role={feedback.isError ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  );
}

type EmailChangeConfirmationDialogProps = {
  isOpen: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  providerName: string;
};

/** Asks before replacing the email of an approved verification, which sends it back to review. */
function EmailChangeConfirmationDialog({
  isOpen,
  onConfirm,
  onOpenChange,
  providerName,
}: EmailChangeConfirmationDialogProps) {
  return (
    <Dialog alert onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent
        title={VERIFICATION_COPY.emailChangeTitle}
        description={
          VERIFICATION_COPY.emailChangeDescriptionPrefix +
          providerName +
          VERIFICATION_COPY.emailChangeDescriptionSuffix
        }
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {VERIFICATION_COPY.cancelEmailChange}
              </Button>
            </DialogClose>
            <Button onClick={onConfirm} type="button" variant="danger">
              {VERIFICATION_COPY.confirmEmailChange}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}

type VerificationRequestInput = {
  declaredEmail: string;
  /** Guards a second submit landing before the disabled state renders. */
  isSubmittingRef: RefObject<boolean>;
  onVerificationChange: (verification: MemberVerificationDto) => void;
  providerId: string;
  setFeedback: (feedback: RequestFeedbackState | null) => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
  tribeSlug: string;
};

/** Sends the verification request once and reports its outcome. */
async function runVerificationRequest({
  declaredEmail,
  isSubmittingRef,
  onVerificationChange,
  providerId,
  setFeedback,
  setIsSubmitting,
  tribeSlug,
}: VerificationRequestInput) {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await requestMemberVerification(tribeSlug, {
        declaredEmail,
        providerId,
      });

      if (!result.isSuccess) {
        setFeedback({ isError: true, message: result.message });

        return;
      }

      onVerificationChange(result.data);
      setFeedback({ isError: false, message: VERIFICATION_COPY.requestSuccess });
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
}

type ProviderRequestSummaryProps = {
  provider: VerificationProviderDto;
  verification: MemberVerificationDto | undefined;
};

/** Provider instructions, its link and the current verification status. */
function ProviderRequestSummary({ provider, verification }: ProviderRequestSummaryProps) {
  return (
    <>
      {provider.instructions ? (
        <p className={styles.AcademyVerification__instructions}>{provider.instructions}</p>
      ) : null}
      {provider.linkUrl ? (
        <a
          className={styles.AcademyVerification__link}
          href={provider.linkUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {VERIFICATION_COPY.openProviderLink}
        </a>
      ) : null}
      <p className={styles.AcademyVerification__status}>
        <span className={styles.AcademyVerification__statusLabel}>{VERIFICATION_COPY.statusLabel}: </span>
        {describeStatus(verification)}
      </p>
    </>
  );
}

type ProviderRequestProps = {
  onVerificationChange: (verification: MemberVerificationDto) => void;
  provider: VerificationProviderDto;
  tribeSlug: string;
  verification: MemberVerificationDto | undefined;
};

/** Verification request of one provider: status, declared email and confirmation. */
function ProviderRequest({ onVerificationChange, provider, tribeSlug, verification }: ProviderRequestProps) {
  const emailInputId = useId();
  const [declaredEmail, setDeclaredEmail] = useState(verification?.declaredEmail ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<RequestFeedbackState | null>(null);
  const [isEmailChangeConfirmationOpen, setIsEmailChangeConfirmationOpen] = useState(false);
  const isSubmittingRef = useRef(false);
  const buttonLabel = resolveRequestButtonLabel(verification);

  const sendRequest = () =>
    runVerificationRequest({
      declaredEmail,
      isSubmittingRef,
      onVerificationChange,
      providerId: provider.id,
      setFeedback,
      setIsSubmitting,
      tribeSlug,
    });

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    // Replacing the email of an approved verification sends it back to review: ask first.
    if (reopensApprovedVerification(verification, declaredEmail)) {
      setIsEmailChangeConfirmationOpen(true);

      return;
    }

    void sendRequest();
  };

  const confirmEmailChange = () => {
    setIsEmailChangeConfirmationOpen(false);
    void sendRequest();
  };

  return (
    <li className={styles.AcademyVerification__provider}>
      <h2 className={styles.AcademyVerification__providerName}>{provider.displayName}</h2>
      <ProviderRequestSummary provider={provider} verification={verification} />
      <form className={styles.AcademyVerification__form} noValidate onSubmit={handleSubmit}>
        <div className={styles.AcademyVerification__field}>
          <Input
            autoComplete="email"
            description={VERIFICATION_COPY.declaredEmailHelp}
            id={emailInputId}
            label={VERIFICATION_COPY.declaredEmailLabel}
            onChange={(event) => setDeclaredEmail(event.currentTarget.value)}
            type="email"
            value={declaredEmail}
          />
        </div>
        <Button aria-busy={isSubmitting || undefined} disabled={isSubmitting} type="submit">
          {isSubmitting ? VERIFICATION_COPY.requestPending : buttonLabel}
        </Button>
        <RequestFeedback feedback={feedback} />
      </form>
      <EmailChangeConfirmationDialog
        isOpen={isEmailChangeConfirmationOpen}
        providerName={provider.displayName}
        onConfirm={confirmEmailChange}
        onOpenChange={setIsEmailChangeConfirmationOpen}
      />
    </li>
  );
}
