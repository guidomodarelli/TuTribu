/** Replaces an admission form that would be rejected with what is missing, why and the tab that resolves it. @module admission-setup-prerequisite */
import { EmptyState } from "@golfo/ui";
import { ButtonLink } from "@/components/navigation/link";
import { ADMISSION_SETUP_PREREQUISITE_COPY, type AdmissionSetupPrerequisiteId } from "@/src/modules/academy-admissions/constants/admission-setup-prerequisite";

export type AdmissionSetupPrerequisiteProps = {
  /** The configuration another tab must save first. */
  prerequisite: AdmissionSetupPrerequisiteId;
  /** Page of the tab that resolves it (see `admissionSetupPrerequisiteHref`). */
  href: string;
};

/**
 * A quiet, action-oriented state in place of the form: the title names what is missing, one line says why this tab needs it and a
 * single link opens the tab that resolves it. It guides only; the server still checks every write.
 *
 * @param props - The missing prerequisite and the page that resolves it.
 * @returns A named region with the prerequisite and its link.
 */
export function AdmissionSetupPrerequisite({ prerequisite, href }: AdmissionSetupPrerequisiteProps) {
  const copy = ADMISSION_SETUP_PREREQUISITE_COPY[prerequisite];
  return <EmptyState label={copy.title} title={copy.title} description={copy.reason}
    action={<ButtonLink href={href} variant="primary" size="sm">{copy.action}</ButtonLink>} />;
}
