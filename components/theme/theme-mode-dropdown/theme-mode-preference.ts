"use client";

import {
  DARK_THEME_CLASS_NAME,
  DARK_THEME_MODE,
  LIGHT_THEME_MODE,
  SYSTEM_THEME_MEDIA_QUERY,
  SYSTEM_THEME_MODE,
  THEME_MODE_ATTRIBUTE_VALUES,
  THEME_MODE_STORAGE_KEY,
  type ThemeMode,
} from "@/src/constants/theme-mode";

const DEFAULT_THEME_MODE: ThemeMode = SYSTEM_THEME_MODE;

export function isThemeMode(value: string | null): value is ThemeMode {
  return THEME_MODE_ATTRIBUTE_VALUES.some((themeMode) => themeMode === value);
}

export function getStoredThemeMode(): ThemeMode {
  try {
    const storedThemeMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);

    return isThemeMode(storedThemeMode) ? storedThemeMode : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function storeThemeMode(themeMode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
  } catch {
    return;
  }
}

function resolveSystemThemeMode(): Exclude<ThemeMode, "system"> {
  if (!window.matchMedia) {
    return LIGHT_THEME_MODE;
  }

  return window.matchMedia(SYSTEM_THEME_MEDIA_QUERY).matches
    ? DARK_THEME_MODE
    : LIGHT_THEME_MODE;
}

export function applyThemeMode(themeMode: ThemeMode) {
  const resolvedThemeMode =
    themeMode === SYSTEM_THEME_MODE ? resolveSystemThemeMode() : themeMode;

  document.documentElement.classList.toggle(
    DARK_THEME_CLASS_NAME,
    resolvedThemeMode === DARK_THEME_MODE
  );
}
