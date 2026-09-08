/** Validates the theme vocabulary shared by application controls and providers. */
import { THEME_MODE_ATTRIBUTE_VALUES, type ThemeMode } from "@/src/constants/theme-mode";

/**
 * Accepts only the supported persisted theme modes.
 * @param value - Untrusted theme value from storage or a control.
 * @returns Whether the value belongs to the application's theme vocabulary.
 */
export function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODE_ATTRIBUTE_VALUES.some((themeMode) => themeMode === value);
}
