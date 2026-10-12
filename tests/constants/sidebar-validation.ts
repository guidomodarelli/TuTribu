/** Defines the shared navigation interaction exercised by the production browser suite. */

/** Targets the public toggle rendered by the actual shared sidebar provider. */
export const SIDEBAR_TOGGLE_SELECTOR = '[data-slot="sidebar-trigger"]';

/** Exercises both supported modifier shortcuts, including an uppercase native key. */
export const SIDEBAR_SHORTCUT_SEQUENCE = ["Control+b", "Meta+Shift+B"] as const;
