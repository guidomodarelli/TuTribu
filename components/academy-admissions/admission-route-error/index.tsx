"use client";

/** Owns safe render-error recovery; the runtime exception is never displayed. @module admission-route-error */
import { Button } from "@golfo/ui";
import { ButtonLink, Link } from "@/components/navigation/link";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ROUTES } from "@/src/constants/routes";
import styles from "./styles.module.scss";

/**
 * @param props.retry - Recovery for a failure that can pass; omit it when retrying cannot help, such as a permission denial.
 * @param props.signInHref - Sign-in page that returns here, for a failure caused by a missing session; it replaces the retry.
 * @param props.message - Application-owned safe Spanish feedback.
 * @param props.embedded - Whether the page already owns the `main` landmark and its `h1`.
 * @returns Local recovery and navigation, without private cause text.
 */
export function AdmissionRouteError({ retry, signInHref, message = ADMISSION_UI_COPY.readFailed, embedded = false }: { retry?: () => void; signInHref?: string; message?: string; embedded?: boolean }) {
  const Container = embedded ? "section" : "main", Heading = embedded ? "h2" : "h1";
  return <Container className={embedded ? `${styles.AdmissionRouteError} ${styles["AdmissionRouteError--embedded"]}` : styles.AdmissionRouteError}><Heading className={styles.AdmissionRouteError__title}>{ADMISSION_UI_COPY.unavailableTitle}</Heading><p className={styles.AdmissionRouteError__message} role="alert">{message}</p><div className={styles.AdmissionRouteError__actions}>
    {signInHref ? <ButtonLink href={signInHref} variant="primary">{ADMISSION_UI_COPY.signIn}</ButtonLink> : retry && <Button type="button" onClick={retry}>Reintentar</Button>}
    <Link href={ROUTES.home}>{ADMISSION_UI_COPY.home}</Link>
  </div></Container>;
}
