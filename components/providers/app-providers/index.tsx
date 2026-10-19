"use client";

/** Composes the shared UI provider with application notifications and Siteping. */
import { Suspense, type ReactNode } from "react";
import { ThemedToaster, useTheme } from "@golfo/ui";

import { PrivateAwareSiteping } from "@/components/providers/private-aware-siteping";
import { DARK_THEME_MODE, LIGHT_THEME_MODE } from "@/src/constants/theme-mode";
import { AppUIProvider } from "./app-ui-provider";

import styles from "./styles.module.scss";

/** Notification options the application layers on top of the shared toaster style. */
const APP_PROVIDERS_TOASTER = {
  closeButton: true,
  position: "top-center",
  richColors: true,
} as const;

type AppProvidersProps = {
  children: ReactNode;
  isSitepingEnabled: boolean;
};

/** Mounts the shared toaster with the application options and the shared resolved theme. */
function AppToaster() {
  const { resolvedTheme } = useTheme();
  return <ThemedToaster {...APP_PROVIDERS_TOASTER} theme={resolvedTheme === DARK_THEME_MODE ? DARK_THEME_MODE : LIGHT_THEME_MODE} />;
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
        <Suspense fallback={null}><PrivateAwareSiteping enabled={isSitepingEnabled} /></Suspense>
        <AppToaster />
      </div>
    </AppUIProvider>
  );
}
