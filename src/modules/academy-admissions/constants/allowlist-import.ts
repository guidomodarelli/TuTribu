/** Defines the exact file grammar separately from confirmed row outcomes. @module allowlist-import-constants */
import { ADMISSION_INPUT_CATEGORY } from "./admission-resources";
export const ALLOWLIST_CSV_HEADER = ["identity", "display_name"] as const;
/** Names lexical boundaries without treating file data as executable content. */
export const ALLOWLIST_CSV_CHARACTER = { separator: ",", quote: '"', carriageReturn: "\r", lineFeed: "\n", nullCharacter: "\0" } as const;
/** Quotes may enclose a complete field; trailing characters after closure are invalid. */
export const ALLOWLIST_CSV_FIELD_STATE = { unquoted: "unquoted", quoted: "quoted", closed: "closed" } as const;
/** File bytes must decode losslessly; alternate encodings are rejected. */
export const ALLOWLIST_CSV_ENCODING = "utf-8";
/** Technical transaction size never changes the product file/selection ceiling. */
export const ALLOWLIST_IMPORT_BLOCK_SIZE = 25;
/** Includes initial selection, each bounded block and final original snapshot. */
export const ALLOWLIST_IMPORT_STEP_OVERHEAD = 2;
export const ALLOWLIST_IMPORT_DENIAL = "denied";
/** Protects staged row/list work while known rejection completes the original ledger. */
export const ALLOWLIST_IMPORT_EFFECT_SQL = { begin: "savepoint admission_import_effect", rollback: "rollback to savepoint admission_import_effect", release: "release savepoint admission_import_effect" } as const;
/** Reports are for human reading; neutralized cells are not an exact reimport source. */
export const ALLOWLIST_IMPORT_REPORT_HEADER = ["row_number", ...ALLOWLIST_CSV_HEADER, "outcome", "errors", "entry_version"] as const;
export const ALLOWLIST_IMPORT_REPORT_LINE_END = "\r\n";
export const ALLOWLIST_IMPORT_REPORT_FORMULA_PATTERN = /^[\s]*[=+\-@＝＋－＠]|^[\t\r\n]/u;
/** Combines a text marker with a retained tab inside the quoted CSV cell. */
export const ALLOWLIST_IMPORT_REPORT_TEXT_PREFIX = "'\t";
export const ALLOWLIST_IMPORT_REPORT_OUTCOME_LABEL = { added: "Agregada", unchanged: "Sin cambios", skipped: "Omitida", conflict: "Conflicto", pending: "Pendiente" } as const;
export const ALLOWLIST_IMPORT_REPORT_ERROR_LABEL = {
  [ADMISSION_INPUT_CATEGORY.contact]: "Contacto inválido", [ADMISSION_INPUT_CATEGORY.duplicateContact]: "Contacto duplicado",
  [ADMISSION_INPUT_CATEGORY.name]: "Nombre inválido", [ADMISSION_INPUT_CATEGORY.country]: "País inválido",
  [ADMISSION_INPUT_CATEGORY.version]: "Versión inválida", [ADMISSION_INPUT_CATEGORY.operation]: "Operación inválida",
  [ADMISSION_INPUT_CATEGORY.confirmation]: "Falta confirmación", [ADMISSION_INPUT_CATEGORY.fields]: "Faltan datos",
} as const;
