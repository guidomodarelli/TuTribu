/** Defines the persisted theme contract shared with beez-ui. */
/** Preserves preferences saved before the provider migration. */
export const THEME_MODE_STORAGE_KEY = "tutribu-theme";
/** Accepted theme modes; the provider resolves the system preference. */
export const THEME_MODE_ATTRIBUTE_VALUES = ["light", "dark", "system"] as const;
/** Named modes derived from the public vocabulary. */
export const [LIGHT_THEME_MODE, DARK_THEME_MODE, SYSTEM_THEME_MODE] =
  THEME_MODE_ATTRIBUTE_VALUES;

export type ThemeMode = (typeof THEME_MODE_ATTRIBUTE_VALUES)[number];
