"use client";

/** Composes the shared UI provider with application notifications and Siteping. */
import type { ReactNode } from "react";
import { Toaster, useTheme } from "beez-ui";

import { SitepingProvider } from "@/components/providers/siteping-provider";
import { DARK_THEME_MODE, LIGHT_THEME_MODE } from "@/src/constants/theme-mode";
import { AppUIProvider } from "./app-ui-provider";

import styles from "./styles.module.scss";

/** Preserves the application's notification presentation. */
const APP_PROVIDERS_TOASTER = {
  closeButton: true,
  position: "top-center",
  richColors: true,
} as const;

type AppProvidersProps = {
  children: ReactNode;
  isSitepingEnabled: boolean;
};

/** Keeps the existing notification options synchronized with the shared resolved theme. */
function AppToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster {...APP_PROVIDERS_TOASTER} theme={resolvedTheme === DARK_THEME_MODE ? DARK_THEME_MODE : LIGHT_THEME_MODE} />;
}

/** Composes UI, notifications and optional Siteping for the application. */
export function AppProviders({
  children,
  isSitepingEnabled,
}: AppProvidersProps) {
  return (
    <AppUIProvider>
      <div className={styles.AppProviders}>
        {children}
        {isSitepingEnabled ? <SitepingProvider /> : null}
        <AppToaster />
      </div>
    </AppUIProvider>
  );
}
