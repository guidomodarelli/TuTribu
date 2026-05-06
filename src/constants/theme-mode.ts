export const THEME_MODE_STORAGE_KEY = "tutribu-theme";
export const THEME_MODE_ATTRIBUTE_VALUES = ["light", "dark", "system"] as const;
export const SYSTEM_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const [LIGHT_THEME_MODE, DARK_THEME_MODE, SYSTEM_THEME_MODE] =
  THEME_MODE_ATTRIBUTE_VALUES;
export const DARK_THEME_CLASS_NAME = "dark";

export type ThemeMode = (typeof THEME_MODE_ATTRIBUTE_VALUES)[number];
