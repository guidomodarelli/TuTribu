"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Button, Input, toast } from "beez-ui";

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
    <main className={styles.AcademyVerification}>
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
    </main>
  );
}

function ProviderRequest({
  onVerificationChange,
  provider,
  tribeSlug,
  verification,
}: {
  onVerificationChange: (verification: MemberVerificationDto) => void;
  provider: VerificationProviderDto;
  tribeSlug: string;
  verification: MemberVerificationDto | undefined;
}) {
  const emailInputId = useId();
  const emailHelpId = useId();
  const [declaredEmail, setDeclaredEmail] = useState(verification?.declaredEmail ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ isError: boolean; message: string } | null>(null);
  const isSubmittingRef = useRef(false);
  const buttonLabel = !verification
    ? VERIFICATION_COPY.requestButton
    : verification.status === "pending" || verification.status === "verified"
      ? VERIFICATION_COPY.updateDataButton
      : VERIFICATION_COPY.requestAgainButton;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await requestMemberVerification(tribeSlug, {
        declaredEmail,
        providerId: provider.id,
      });

      if (!result.isSuccess) {
        setFeedback({ isError: true, message: result.message });
        toast.error(result.message);

        return;
      }

      onVerificationChange(result.data);
      setFeedback({ isError: false, message: VERIFICATION_COPY.requestSuccess });
      toast.success(VERIFICATION_COPY.requestSuccess);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <li className={styles.AcademyVerification__provider}>
      <h2 className={styles.AcademyVerification__providerName}>{provider.displayName}</h2>
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
      <form className={styles.AcademyVerification__form} noValidate onSubmit={handleSubmit}>
        <label className={styles.AcademyVerification__field} htmlFor={emailInputId}>
          <span>{VERIFICATION_COPY.declaredEmailLabel}</span>
          <Input
            aria-describedby={emailHelpId}
            autoComplete="email"
            id={emailInputId}
            onChange={(event) => setDeclaredEmail(event.currentTarget.value)}
            type="email"
            value={declaredEmail}
          />
        </label>
        <p className={styles.AcademyVerification__help} id={emailHelpId}>
          {VERIFICATION_COPY.declaredEmailHelp}
        </p>
        <Button aria-busy={isSubmitting || undefined} disabled={isSubmitting} type="submit">
          {isSubmitting ? VERIFICATION_COPY.requestPending : buttonLabel}
        </Button>
        {feedback ? (
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
        ) : null}
      </form>
    </li>
  );
}
