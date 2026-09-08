"use client";

/** Restores a full-document error view with an independent shared UI provider. */
import { useEffect } from "react";

import { ErrorState } from "@/components/feedback/error-state";
import { siteConfig } from "@/lib/site-config";
import { geist, ibmPlexMono, poppins } from "./fonts";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
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

const GLOBAL_ERROR_DOCUMENT_CLASS = {
  body: "GlobalErrorPageBody",
} as const;
type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

/** Restores independent UI providers when the root layout fails. */
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
      className={`${geist.variable} ${poppins.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body className={GLOBAL_ERROR_DOCUMENT_CLASS.body}>
        <title>{`Error inesperado | ${siteConfig.name}`}</title>
        <AppUIProvider>
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
        </AppUIProvider>
      </body>
    </html>
  );
}
