"use client";

import { Button } from "@/components/ui/button";
import { navigateToUrl } from "@/lib/browser-navigation";
import styles from "./styles.module.scss";

const VISIBILITY_FALLBACK_DELAY_MS = 2000;
const VISIBILITY_VISIBLE_STATE = "visible";

const OPEN_IN_EXTERNAL_BROWSER_COPY = {
  description:
    "Para entrar a tu tribu después del pago, abrí TuTribu en tu navegador habitual y completá el inicio de sesión.",
  eyebrow: "Suscripción confirmada",
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
  const handlePrimaryAction = () => {
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
        <Button
          asChild
          className={styles.OpenInExternalBrowser__primaryAction}
          size={OPEN_IN_EXTERNAL_BROWSER_BUTTON.size}
        >
          <a href={externalBrowserUrl} onClick={handlePrimaryAction}>
            {OPEN_IN_EXTERNAL_BROWSER_COPY.primaryAction}
          </a>
        </Button>
      </div>
      <a
        className={styles.OpenInExternalBrowser__fallbackLink}
        href={fallbackSignInUrl}
      >
        {OPEN_IN_EXTERNAL_BROWSER_COPY.fallbackLink}
      </a>
    </section>
  );
}
