"use client";

/** Composes shared Next adapters and the application's persisted theme contract. */
import { useEffect, type ReactNode } from "react";
import { useTheme } from "beez-ui";
import { BeezUIProvider, type BeezUIProviderProps } from "beez-ui/next";
import { isThemeMode } from "@/lib/theme-mode";
import { SYSTEM_THEME_MODE, THEME_MODE_STORAGE_KEY } from "@/src/constants/theme-mode";

/** Retains existing preferences and system default across the provider migration. */
const APP_THEME_OPTIONS = {
  storageKey: THEME_MODE_STORAGE_KEY,
  defaultTheme: SYSTEM_THEME_MODE,
  enableSystem: true,
} satisfies BeezUIProviderProps["themeOptions"];

/** Restores the system default for unsupported stored values without owning a second theme state. */
function ThemePreferenceValidation() {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (theme !== undefined && !isThemeMode(theme)) setTheme(SYSTEM_THEME_MODE);
  }, [theme, setTheme]);
  return null;
}

/**
 * Activates Next images, client navigation and a single shared theme owner.
 * @param props - Descendants, including the independent global error fallback.
 * @returns The shared provider with legacy preference validation.
 */
export function AppUIProvider({ children }: { children: ReactNode }) {
  return (
    <BeezUIProvider themeOptions={APP_THEME_OPTIONS}>
      <ThemePreferenceValidation />
      {children}
    </BeezUIProvider>
  );
}
