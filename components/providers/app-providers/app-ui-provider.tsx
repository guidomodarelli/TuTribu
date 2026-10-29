"use client";

/** Composes shared Next adapters and the application's persisted theme contract. */
import { useEffect, type ReactNode } from "react";
import { LazyMotion, domMax } from "motion/react";
import { useTheme } from "@golfo/ui";
import { GolfoUIProvider, type GolfoUIProviderProps } from "@golfo/ui/next";
import { isThemeMode } from "@/lib/theme-mode";
import { SYSTEM_THEME_MODE, THEME_MODE_STORAGE_KEY } from "@/src/constants/theme-mode";

/** Retains existing preferences and system default across the provider migration. */
const APP_THEME_OPTIONS = {
  storageKey: THEME_MODE_STORAGE_KEY,
  defaultTheme: SYSTEM_THEME_MODE,
  enableSystem: true,
} satisfies GolfoUIProviderProps["themeOptions"];

/** Restores the system default for unsupported stored values without owning a second theme state. */
function ThemePreferenceValidation() {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (theme !== undefined && !isThemeMode(theme)) setTheme(SYSTEM_THEME_MODE);
  }, [theme, setTheme]);
  return null;
}

/**
 * Activates Next images, client navigation, a single shared theme owner and the motion features for `m` components.
 * `domMax` because the app uses shared layouts (`layoutId`) and drag, not only enter/exit animations.
 * @param props - Descendants, including the independent global error fallback.
 * @returns The shared provider with legacy preference validation.
 */
export function AppUIProvider({ children }: { children: ReactNode }) {
  return (
    <GolfoUIProvider themeOptions={APP_THEME_OPTIONS}>
      <ThemePreferenceValidation />
      <LazyMotion features={domMax}>{children}</LazyMotion>
    </GolfoUIProvider>
  );
}
