"use client";

import { useEffect } from "react";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { ErrorState } from "@/components/feedback/error-state";
import { siteConfig } from "@/lib/site-config";
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
    >
      <body>
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
