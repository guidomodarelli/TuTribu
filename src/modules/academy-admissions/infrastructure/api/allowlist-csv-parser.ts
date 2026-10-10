/** Parses the allowlist's untrusted file input without creating previews or entries. @module allowlist-csv-parser */
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ALLOWLIST_CSV_CHARACTER as CHARACTER, ALLOWLIST_CSV_ENCODING, ALLOWLIST_CSV_FIELD_STATE as FIELD, ALLOWLIST_CSV_HEADER } from "../../constants/allowlist-import";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import type { AllowlistImportInputRow } from "../../domain/entities/allowlist-import";

/** @param input - Original UTF-8 bytes or browser-upload text. @returns Logical records preserving all field data for row validation. @throws AdmissionOperationError for a global encoding, format, header or product-limit failure without raw file contents. */
export function parseAllowlistCsv(input: string | Uint8Array): AllowlistImportInputRow[] {
  if (typeof input === "string" && (input.length > ADMISSION_LIMIT.csvByteCount || new TextDecoder(ALLOWLIST_CSV_ENCODING, { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(input)) !== input)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > ADMISSION_LIMIT.csvByteCount) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  let text: string;
  try { text = new TextDecoder(ALLOWLIST_CSV_ENCODING, { fatal: true }).decode(bytes); }
  catch (error) { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput, { cause: error }); }
  if (text.includes(CHARACTER.nullCharacter)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const rows: AllowlistImportInputRow[] = [];
  let fields: string[] = [], fragments: string[] = [], fieldStart = 0, headerRead = false;
  let fieldState: typeof FIELD[keyof typeof FIELD] = FIELD.unquoted;
  /** @param end - Exclusive field boundary in the decoded file. @returns After collecting one field; fails before allocating a third column. */
  const finishField = (end: number): void => {
    if (fields.length >= ALLOWLIST_CSV_HEADER.length) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    fields.push(fieldState === FIELD.closed ? fragments.join("") : text.slice(fieldStart, end));
    fragments = []; fieldState = FIELD.unquoted;
  };
  /** @returns After preserving one logical row or validating the exact header. */
  const finishRecord = (): void => {
    if (fields.length !== ALLOWLIST_CSV_HEADER.length) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (!headerRead) {
      if (!ALLOWLIST_CSV_HEADER.every((name, index) => fields[index] === name)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      headerRead = true;
    } else {
      if (rows.length >= ADMISSION_LIMIT.csvDataRowCount) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      rows.push({ rowNumber: rows.length + 1, identity: fields[0], displayName: fields[1] });
    }
    fields = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (fieldState === FIELD.quoted) {
      if (character === CHARACTER.quote) {
        fragments.push(text.slice(fieldStart, index));
        if (text[index + 1] === CHARACTER.quote) { fragments.push(CHARACTER.quote); index += 1; fieldStart = index + 1; }
        else fieldState = FIELD.closed;
      }
      continue;
    }
    if (character === CHARACTER.separator) { finishField(index); fieldStart = index + 1; continue; }
    if (character === CHARACTER.lineFeed || character === CHARACTER.carriageReturn) {
      finishField(index); finishRecord();
      if (character === CHARACTER.carriageReturn) { if (text[index + 1] !== CHARACTER.lineFeed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput); index += 1; }
      fieldStart = index + 1; continue;
    }
    if (fieldState === FIELD.closed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (character === CHARACTER.quote) {
      if (index !== fieldStart) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      fieldState = FIELD.quoted; fieldStart = index + 1;
    }
  }
  if (fieldState === FIELD.quoted) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  if (fields.length || fieldStart < text.length || fieldState === FIELD.closed) { finishField(text.length); finishRecord(); }
  if (!headerRead) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return rows;
}
