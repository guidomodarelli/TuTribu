/** Defines the exact file grammar separately from confirmed row outcomes. @module allowlist-import-constants */
export const ALLOWLIST_CSV_HEADER = ["identity", "display_name"] as const;
/** Names lexical boundaries without treating file data as executable content. */
export const ALLOWLIST_CSV_CHARACTER = { separator: ",", quote: '"', carriageReturn: "\r", lineFeed: "\n", nullCharacter: "\0" } as const;
/** Quotes may enclose a complete field; trailing characters after closure are invalid. */
export const ALLOWLIST_CSV_FIELD_STATE = { unquoted: "unquoted", quoted: "quoted", closed: "closed" } as const;
/** File bytes must decode losslessly; alternate encodings are rejected. */
export const ALLOWLIST_CSV_ENCODING = "utf-8";
