"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/feedback/error-state";

const ERROR_PAGE_COPY = {
  description:
    "Ocurrio un problema inesperado. Puedes reintentar ahora o volver al inicio mientras lo revisamos.",
  eyebrow: "Error inesperado",
  homeLabel: "Volver al inicio",
  retryLabel: "Reintentar",
  title: "No pudimos cargar esta seccion",
} as const;

type ErrorPageProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function ErrorPage({ error, unstable_retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <ErrorState
        description={ERROR_PAGE_COPY.description}
        eyebrow={ERROR_PAGE_COPY.eyebrow}
        homeLabel={ERROR_PAGE_COPY.homeLabel}
        onRetry={unstable_retry}
        retryLabel={ERROR_PAGE_COPY.retryLabel}
        title={ERROR_PAGE_COPY.title}
      />
    </main>
  );
}
