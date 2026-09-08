"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "beez-ui";
import { navigateToUrl } from "@/lib/browser-navigation";
import styles from "./styles.module.scss";

const COUNTDOWN_INITIAL_SECONDS = 5;
const COUNTDOWN_INTERVAL_MS = 1000;
const VISIBILITY_FALLBACK_DELAY_MS = 2000;
const VISIBILITY_VISIBLE_STATE = "visible";

const OPEN_IN_EXTERNAL_BROWSER_COPY = {
  countdownDescription:
    "Cuando el contador llegue a 0, te vamos a redirigir al flujo para continuar con tu suscripción y quedar dentro de la tribu.",
  description:
    "Para entrar a tu tribu después del pago, abrí TuTribu en tu navegador habitual y completá el inicio de sesión.",
  eyebrow: "Suscripción pendiente",
  fallbackLink: "O continuá con inicio de sesión acá",
  primaryAction: "Continuar en tu navegador",
  title: "Abrí TuTribu en tu navegador",
} as const;

const OPEN_IN_EXTERNAL_BROWSER_BUTTON = {
  size: "lg",
} as const;

type OpenInExternalBrowserProps = {
  externalBrowserUrl: string;
  fallbackSignInUrl: string;
};

/**
 * Full-page handoff shown when a Mercado Pago in-app browser hits the tribe
 * page right after a subscription. Renders a primary action that opens the
 * tribe in the OS default browser and automatically falls back to the
 * in-app sign-in flow when the deep link does not take.
 *
 * @param props - External browser deep link and sign-in fallback URL.
 * @returns Centered handoff with primary deep link button and fallback link.
 */
export function OpenInExternalBrowser({
  externalBrowserUrl,
  fallbackSignInUrl,
}: OpenInExternalBrowserProps) {
  const automaticFallbackTimeoutIdRef = useRef<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(
    COUNTDOWN_INITIAL_SECONDS
  );

  useEffect(() => {
    const countdownIntervalId = window.setInterval(() => {
      setRemainingSeconds((currentRemainingSeconds) =>
        Math.max(currentRemainingSeconds - 1, 0)
      );
    }, COUNTDOWN_INTERVAL_MS);
    const fallbackRedirectTimeoutId = window.setTimeout(() => {
      setRemainingSeconds(0);

      if (document.visibilityState === VISIBILITY_VISIBLE_STATE) {
        navigateToUrl(fallbackSignInUrl);
      }
    }, COUNTDOWN_INITIAL_SECONDS * COUNTDOWN_INTERVAL_MS);
    automaticFallbackTimeoutIdRef.current = fallbackRedirectTimeoutId;

    return () => {
      window.clearInterval(countdownIntervalId);
      window.clearTimeout(automaticFallbackTimeoutIdRef.current ?? undefined);
      automaticFallbackTimeoutIdRef.current = null;
    };
  }, [fallbackSignInUrl]);

  const handlePrimaryAction = () => {
    window.clearTimeout(automaticFallbackTimeoutIdRef.current ?? undefined);
    automaticFallbackTimeoutIdRef.current = null;

    window.setTimeout(() => {
      if (document.visibilityState === VISIBILITY_VISIBLE_STATE) {
        navigateToUrl(fallbackSignInUrl);
      }
    }, VISIBILITY_FALLBACK_DELAY_MS);
  };

  return (
    <section className={styles.OpenInExternalBrowser}>
      <div className={styles.OpenInExternalBrowser__primary}>
        <p className={styles.OpenInExternalBrowser__eyebrow}>
          {OPEN_IN_EXTERNAL_BROWSER_COPY.eyebrow}
        </p>
        <h1 className={styles.OpenInExternalBrowser__title}>
          {OPEN_IN_EXTERNAL_BROWSER_COPY.title}
        </h1>
        <p className={styles.OpenInExternalBrowser__description}>
          {OPEN_IN_EXTERNAL_BROWSER_COPY.description}
        </p>
        <div
          aria-live="polite"
          className={styles.OpenInExternalBrowser__countdown}
        >
          <span className={styles.OpenInExternalBrowser__countdownValue}>
            {remainingSeconds}
          </span>
          <p className={styles.OpenInExternalBrowser__countdownDescription}>
            {OPEN_IN_EXTERNAL_BROWSER_COPY.countdownDescription}
          </p>
        </div>
        <Button
          asChild
          className={styles.OpenInExternalBrowser__primaryAction}
          size={OPEN_IN_EXTERNAL_BROWSER_BUTTON.size}
        >
          <a href={externalBrowserUrl} onClick={handlePrimaryAction}>
            {OPEN_IN_EXTERNAL_BROWSER_COPY.primaryAction}
          </a>
        </Button>
        <a
          className={styles.OpenInExternalBrowser__fallbackLink}
          href={fallbackSignInUrl}
        >
          {OPEN_IN_EXTERNAL_BROWSER_COPY.fallbackLink}
        </a>
      </div>
    </section>
  );
}
