"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/feedback/error-state";

/**
 * Platform segments fail inside the shell: the rail and the tribe navigation stay, and only the section shows recovery.
 * The shell already renders the page's `<main>`, so this boundary renders a section, never another landmark.
 */
const PLATFORM_ERROR_COPY = {
  description:
    "Ocurrió un problema al cargar esta sección. Podés reintentar ahora o volver al inicio mientras lo revisamos.",
  eyebrow: "Error inesperado",
  homeLabel: "Volver al inicio",
  retryLabel: "Reintentar",
  title: "No pudimos cargar esta sección",
} as const;

type PlatformErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

/** @param props - The failure App Router caught and its `retry`, which re-fetches the segment. @returns Recovery inside the shell. */
export default function PlatformError({ error, retry }: PlatformErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      description={PLATFORM_ERROR_COPY.description}
      eyebrow={PLATFORM_ERROR_COPY.eyebrow}
      homeLabel={PLATFORM_ERROR_COPY.homeLabel}
      onRetry={retry}
      retryLabel={PLATFORM_ERROR_COPY.retryLabel}
      title={PLATFORM_ERROR_COPY.title}
    />
  );
}
