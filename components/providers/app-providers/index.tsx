"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";

import styles from "./styles.module.scss";

const APP_PROVIDERS_TOASTER = {
  closeButton: true,
  position: "top-center",
  richColors: true,
} as const;

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <div className={styles.AppProviders}>
      {children}
      <Toaster
        closeButton={APP_PROVIDERS_TOASTER.closeButton}
        position={APP_PROVIDERS_TOASTER.position}
        richColors={APP_PROVIDERS_TOASTER.richColors}
      />
    </div>
  );
}
