"use client";

/** Owns safe render-error recovery; the runtime exception is never displayed. @module admission-route-error */
import { Button } from "beez-ui";
import { Link } from "@/components/navigation/link";
import { ADMISSION_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ROUTES } from "@/src/constants/routes";
import styles from "./styles.module.scss";

/** @param props - Recovery callback and optional application-owned safe Spanish feedback. @returns Local recovery and navigation, without private cause text. */
export function AdmissionRouteError({ reset, message = ADMISSION_UI_COPY.readFailed, embedded = false }: { reset: () => void; message?: string; embedded?: boolean }) {
  const Container = embedded ? "section" : "main", Heading = embedded ? "h2" : "h1";
  return <Container className={styles.AdmissionRouteError}><Heading className={styles.AdmissionRouteError__title}>{ADMISSION_UI_COPY.unavailableTitle}</Heading><p className={styles.AdmissionRouteError__message} role="alert">{message}</p><div className={styles.AdmissionRouteError__actions}><Button type="button" onClick={reset}>Reintentar</Button><Link href={ROUTES.home}>{ADMISSION_UI_COPY.home}</Link></div></Container>;
}
