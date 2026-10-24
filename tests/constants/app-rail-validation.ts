/** Defines the current application rail interaction exercised by the production browser suite. @module app-rail-validation */

/** Targets the actual visible desktop or mobile toggle, including while its modal is open. */
export const APP_RAIL_TOGGLE_SELECTOR = 'button[aria-keyshortcuts="["][aria-expanded]:visible';
/** Selects the desktop toggle by its accessible product name. */
export const APP_RAIL_DESKTOP_TOGGLE_LABEL_PATTERN = /^(?:Contraer|Expandir) barra lateral$/u;
/** Provides deterministic layout geometry where jsdom cannot calculate CSS widths. */
export const APP_RAIL_TEST_DESKTOP_WIDTH_PX = 1280;
/** Supplies the required Next router cache identity inside the real provider fixture. */
export const APP_RAIL_TEST_BFCACHE_ID = "app-rail-keyboard-fixture";

/** Uses the shortcut published by the current rail. */
export const APP_RAIL_SHORTCUT_KEY = "[";
/** Distinguishes the mobile modal trigger from the desktop rail toggle. */
export const APP_RAIL_MOBILE_TOGGLE_LABEL = "Abrir navegación";
/** Bounds a hydration attempt before the native shortcut is tried again. */
export const APP_RAIL_HYDRATION_ATTEMPT_MS = 2_000;
/** Bounds the complete readiness check without a fixed sleep. */
export const APP_RAIL_HYDRATION_TIMEOUT_MS = 10_000;
