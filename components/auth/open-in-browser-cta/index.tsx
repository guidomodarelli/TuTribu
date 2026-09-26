import { CardDescription } from "beez-ui";
import styles from "./styles.module.scss";

const HTTPS_PROTOCOL = "https://";
const SAFARI_URL_SCHEME = "x-safari-https://";
const ANCHOR_REL_OPENER_SAFE = "noopener noreferrer";

const OPEN_IN_BROWSER_COPY = {
  description:
    "Estás dentro del navegador interno de la app que te trajo hasta acá. Para acceder a tu tribu, abrí TuTribu en tu navegador habitual.",
  iosButtonLabel: "Abrir en Safari",
  iosHint:
    "Tocá el botón para abrir TuTribu en Safari. Después iniciá sesión y vas a entrar a tu tribu.",
  manualHintAndroid:
    "Tocá los tres puntos arriba a la derecha y elegí “Abrir en Chrome” o copiá este link y pegalo en tu navegador.",
  manualHintGeneric:
    "Copiá este link y pegalo en tu navegador habitual para continuar.",
  title: "Abrí TuTribu en tu navegador",
} as const;

type OpenInBrowserCtaProps = {
  isIos: boolean;
  signInUrl: string;
};

function buildSafariUrl(signInUrl: string): string {
  return signInUrl.startsWith(HTTPS_PROTOCOL)
    ? SAFARI_URL_SCHEME + signInUrl.slice(HTTPS_PROTOCOL.length)
    : signInUrl;
}

/**
 * Asks people inside an in-app browser to continue in their regular browser:
 * a Safari deep link on iOS, manual steps elsewhere, and the sign-in link
 * ready to copy.
 */
export function OpenInBrowserCta({ isIos, signInUrl }: OpenInBrowserCtaProps) {
  const safariUrl = buildSafariUrl(signInUrl);

  return (
    <section className={styles.OpenInBrowserCta}>
      <h2 className={styles.OpenInBrowserCta__title}>
        {OPEN_IN_BROWSER_COPY.title}
      </h2>
      <CardDescription className={styles.OpenInBrowserCta__description}>
        {OPEN_IN_BROWSER_COPY.description}
      </CardDescription>
      {isIos ? (
        <>
          <a
            className={styles.OpenInBrowserCta__primaryAction}
            href={safariUrl}
            rel={ANCHOR_REL_OPENER_SAFE}
          >
            {OPEN_IN_BROWSER_COPY.iosButtonLabel}
          </a>
          <p className={styles.OpenInBrowserCta__hint}>
            {OPEN_IN_BROWSER_COPY.iosHint}
          </p>
        </>
      ) : (
        <p className={styles.OpenInBrowserCta__hint}>
          {OPEN_IN_BROWSER_COPY.manualHintAndroid}
        </p>
      )}
      <p className={styles.OpenInBrowserCta__url}>{signInUrl}</p>
    </section>
  );
}
