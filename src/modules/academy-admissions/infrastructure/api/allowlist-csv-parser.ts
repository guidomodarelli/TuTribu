/** Parses the allowlist's untrusted file input without creating previews or entries. @module allowlist-csv-parser */
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ALLOWLIST_CSV_CHARACTER as CHARACTER, ALLOWLIST_CSV_ENCODING, ALLOWLIST_CSV_FIELD_STATE as FIELD, ALLOWLIST_CSV_HEADER } from "../../constants/allowlist-import";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import type { AllowlistImportInputRow } from "../../domain/entities/allowlist-import";

/** @param input - Original UTF-8 bytes or browser-upload text. @returns Logical records preserving all field data for row validation. @throws AdmissionOperationError for a global encoding, format, header or product-limit failure without raw file contents. */
export function parseAllowlistCsv(input: string | Uint8Array): AllowlistImportInputRow[] {
  return new AllowlistCsvReader(decodeAllowlistCsv(input)).read();
}

/** @param input - Original UTF-8 bytes or browser-upload text. @returns The decoded text. @throws AdmissionOperationError for an oversized, non-UTF-8 or NUL-bearing file. */
function decodeAllowlistCsv(input: string | Uint8Array): string {
  if (typeof input === "string" && (input.length > ADMISSION_LIMIT.csvByteCount || new TextDecoder(ALLOWLIST_CSV_ENCODING, { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(input)) !== input)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > ADMISSION_LIMIT.csvByteCount) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  let text: string;
  try { text = new TextDecoder(ALLOWLIST_CSV_ENCODING, { fatal: true }).decode(bytes); }
  catch (error) { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput, { cause: error }); }
  if (text.includes(CHARACTER.nullCharacter)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return text;
}

/** Reads decoded text one character at a time, keeping the current field and record state. */
class AllowlistCsvReader {
  private readonly rows: AllowlistImportInputRow[] = [];
  private fields: string[] = [];
  private fragments: string[] = [];
  private fieldStart = 0;
  private headerRead = false;
  private fieldState: typeof FIELD[keyof typeof FIELD] = FIELD.unquoted;

  /** @param text - Decoded file contents. */
  constructor(private readonly text: string) {}

  /** @returns Logical records after the exact header. @throws AdmissionOperationError for a format, header or product-limit failure. */
  read(): AllowlistImportInputRow[] {
    let index = 0;
    while (index < this.text.length) index = this.readCharacter(index) + 1;
    if (this.fieldState === FIELD.quoted) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (this.fields.length || this.fieldStart < this.text.length || this.fieldState === FIELD.closed) { this.finishField(this.text.length); this.finishRecord(); }
    if (!this.headerRead) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    return this.rows;
  }

  /** @param index - Position of the current character. @returns Position of the last character consumed. */
  private readCharacter(index: number): number {
    const character = this.text[index];
    if (this.fieldState === FIELD.quoted) return this.readQuoted(index, character);
    if (character === CHARACTER.separator) { this.finishField(index); this.fieldStart = index + 1; return index; }
    if (character === CHARACTER.lineFeed || character === CHARACTER.carriageReturn) return this.readLineBreak(index, character);
    if (this.fieldState === FIELD.closed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (character === CHARACTER.quote) {
      if (index !== this.fieldStart) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      this.fieldState = FIELD.quoted; this.fieldStart = index + 1;
    }
    return index;
  }

  /** @param index - Position inside a quoted field. @param character - Character at that position. @returns Position of the last character consumed; a doubled quote consumes both. */
  private readQuoted(index: number, character: string | undefined): number {
    if (character !== CHARACTER.quote) return index;
    this.fragments.push(this.text.slice(this.fieldStart, index));
    if (this.text[index + 1] === CHARACTER.quote) { this.fragments.push(CHARACTER.quote); const consumed = index + 1; this.fieldStart = consumed + 1; return consumed; }
    this.fieldState = FIELD.closed;
    return index;
  }

  /** @param index - Position of the line break. @param character - Line feed or carriage return. @returns Position of the last character consumed; CRLF consumes both. @throws AdmissionOperationError for a bare carriage return. */
  private readLineBreak(index: number, character: string): number {
    this.finishField(index); this.finishRecord();
    let end = index;
    if (character === CHARACTER.carriageReturn) {
      if (this.text[index + 1] !== CHARACTER.lineFeed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      end = index + 1;
    }
    this.fieldStart = end + 1;
    return end;
  }

  /** @param end - Exclusive field boundary in the decoded file. @returns After collecting one field; fails before allocating a third column. */
  private finishField(end: number): void {
    if (this.fields.length >= ALLOWLIST_CSV_HEADER.length) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    this.fields.push(this.fieldState === FIELD.closed ? this.fragments.join("") : this.text.slice(this.fieldStart, end));
    this.fragments = []; this.fieldState = FIELD.unquoted;
  }

  /** @returns After preserving one logical row or validating the exact header. */
  private finishRecord(): void {
    if (this.fields.length !== ALLOWLIST_CSV_HEADER.length) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    if (!this.headerRead) {
      if (!ALLOWLIST_CSV_HEADER.every((name, index) => this.fields[index] === name)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      this.headerRead = true;
    } else {
      if (this.rows.length >= ADMISSION_LIMIT.csvDataRowCount) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      this.rows.push({ rowNumber: this.rows.length + 1, identity: this.fields[0], displayName: this.fields[1] });
    }
    this.fields = [];
  }
}
