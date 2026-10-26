/** Owns list filtering and entry state choices without changing their contracts. @module allowlist-options */
import { ALLOWLIST_FILTER_ALL } from "./allowlist-browser";
import { ALLOWLIST_ENTRY_STATUS } from "./admission-resources";

/** Distinguishes an unfiltered query from either persisted entry state. */
export const ALLOWLIST_FILTER_OPTIONS = [
  { value: ALLOWLIST_FILTER_ALL, label: "Todas" },
  { value: ALLOWLIST_ENTRY_STATUS.enabled, label: "Habilitadas" },
  { value: ALLOWLIST_ENTRY_STATUS.disabled, label: "Deshabilitadas" },
] as const;
/** Labels a single entry's persisted state. */
export const ALLOWLIST_ENTRY_STATUS_OPTIONS = [
  { value: ALLOWLIST_ENTRY_STATUS.enabled, label: "Habilitada" },
  { value: ALLOWLIST_ENTRY_STATUS.disabled, label: "Deshabilitada" },
] as const;
