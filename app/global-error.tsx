"use client";

import { useEffect } from "react";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import Script from "next/script";

import { ErrorState } from "@/components/feedback/error-state";
import { siteConfig } from "@/lib/site-config";
import {
  DARK_THEME_CLASS_NAME,
  DARK_THEME_MODE,
  LIGHT_THEME_MODE,
  SYSTEM_THEME_MEDIA_QUERY,
  SYSTEM_THEME_MODE,
  THEME_MODE_ATTRIBUTE_VALUES,
  THEME_MODE_STORAGE_KEY,
} from "@/src/constants/theme-mode";
import "./globals.css";

const GLOBAL_ERROR_PAGE_COPY = {
  description:
    "Se produjo un problema inesperado al cargar la aplicacion. Reintenta en unos segundos o vuelve al inicio.",
  eyebrow: "Error inesperado",
  homeLabel: "Volver al inicio",
  htmlLanguage: "es",
  retryLabel: "Reintentar",
  title: `Algo salio mal al cargar ${siteConfig.name}`,
} as const;

const GLOBAL_ERROR_THEME_SCRIPT = {
  id: "global-error-theme-bootstrap-script",
  strategy: "beforeInteractive",
} as const;
const GLOBAL_ERROR_DOCUMENT_CLASS = {
  body: "GlobalErrorPageBody",
} as const;
const GLOBAL_ERROR_THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var storageKey = ${JSON.stringify(THEME_MODE_STORAGE_KEY)};
    var themeMode = window.localStorage.getItem(storageKey);
    var validThemeModes = ${JSON.stringify(THEME_MODE_ATTRIBUTE_VALUES)};

    if (validThemeModes.indexOf(themeMode) === -1) {
      themeMode = ${JSON.stringify(SYSTEM_THEME_MODE)};
    }

    var resolvedThemeMode = themeMode;

    if (themeMode === ${JSON.stringify(SYSTEM_THEME_MODE)}) {
      resolvedThemeMode = window.matchMedia(${JSON.stringify(SYSTEM_THEME_MEDIA_QUERY)}).matches ? ${JSON.stringify(DARK_THEME_MODE)} : ${JSON.stringify(LIGHT_THEME_MODE)};
    }

    document.documentElement.classList.toggle(${JSON.stringify(DARK_THEME_CLASS_NAME)}, resolvedThemeMode === ${JSON.stringify(DARK_THEME_MODE)});
  } catch {
    document.documentElement.classList.remove(${JSON.stringify(DARK_THEME_CLASS_NAME)});
  }
})();
`;

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function GlobalErrorPage({
  error,
  unstable_retry,
}: GlobalErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html
      lang={GLOBAL_ERROR_PAGE_COPY.htmlLanguage}
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id={GLOBAL_ERROR_THEME_SCRIPT.id}
          strategy={GLOBAL_ERROR_THEME_SCRIPT.strategy}
        >
          {GLOBAL_ERROR_THEME_BOOTSTRAP_SCRIPT}
        </Script>
      </head>
      <body className={GLOBAL_ERROR_DOCUMENT_CLASS.body}>
        <title>{`Error inesperado | ${siteConfig.name}`}</title>
        <main>
          <ErrorState
            description={GLOBAL_ERROR_PAGE_COPY.description}
            eyebrow={GLOBAL_ERROR_PAGE_COPY.eyebrow}
            homeLabel={GLOBAL_ERROR_PAGE_COPY.homeLabel}
            onRetry={unstable_retry}
            retryLabel={GLOBAL_ERROR_PAGE_COPY.retryLabel}
            title={GLOBAL_ERROR_PAGE_COPY.title}
          />
        </main>
      </body>
    </html>
  );
}
