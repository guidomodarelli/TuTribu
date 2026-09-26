import type { TribeMemberSelectionBadge } from "@/components/tribes/tribe-member-list";
import type {
  TribeMemberResult,
  TribeMemberRole,
} from "@/src/modules/tribes/application/results/tribe-member-result";

export const MEMBER_EXPORT_FORMAT = {
  csv: "csv",
  html: "html",
} as const;

export type MemberExportFormat =
  (typeof MEMBER_EXPORT_FORMAT)[keyof typeof MEMBER_EXPORT_FORMAT];

export const MEMBER_EXPORT_MIME_TYPE: Record<MemberExportFormat, string> = {
  csv: "text/csv;charset=utf-8;",
  html: "text/html;charset=utf-8;",
};

const PAGE_HEADING_PREFIX = "Miembros de ";

export const MEMBER_EXPORT_COPY = {
  columns: {
    elections: "Elecciones",
    email: "Email",
    name: "Nombre",
    role: "Rol",
  },
  filenamePrefix: "miembros",
  noSelections: "Sin elecciones",
  pageHeading: (tribeSlug: string) => PAGE_HEADING_PREFIX + tribeSlug,
  roleLabel: {
    guardian: "Guardián",
    leader: "Líder",
    tribemate: "Miembro",
  } satisfies Record<TribeMemberRole, string>,
} as const;

const CSV = {
  fieldSeparator: ",",
  lineSeparator: "\r\n",
  quote: '"',
  escapedQuote: '""',
  formulaNeutralizingPrefix: "'",
  formulaStartPattern: /^\s*[=+\-@]/,
  unsafeFieldPattern: /[",\r\n]/,
} as const;

const HTML_ENTITY_BY_CHARACTER: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_PATTERN = /[&<>"']/g;

const SELECTION_FORMATTER = {
  itemSeparator: "; ",
  countOpen: " (",
  countClose: ")",
} as const;

const FILENAME = {
  separator: "-",
  extensionSeparator: ".",
  dateSliceLength: 10,
  slugFallback: "tribu",
  invalidCharsPattern: /[^a-z0-9-]+/gi,
} as const;

const HTML_TEMPLATE_PLACEHOLDER = {
  open: "{{",
  close: "}}",
  pattern: /\{\{([a-z]+)\}\}/g,
} as const;

const HTML_TEMPLATE_KEY = {
  elections: "elections",
  email: "email",
  headers: "headers",
  heading: "heading",
  name: "name",
  role: "role",
  rows: "rows",
  value: "value",
} as const;

const HTML_ROW_TEMPLATE = `      <tr>
        <td>{{name}}</td>
        <td>{{email}}</td>
        <td>{{role}}</td>
        <td>{{elections}}</td>
      </tr>`;

const HTML_HEADER_CELL_TEMPLATE = `      <th>{{value}}</th>`;

const HTML_DOCUMENT_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>{{heading}}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d4d4d8; padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; }
  tbody tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
<h1>{{heading}}</h1>
<table>
  <thead>
    <tr>
{{headers}}
    </tr>
  </thead>
  <tbody>
{{rows}}
  </tbody>
</table>
</body>
</html>`;

const HTML_ROW_SEPARATOR = "\n";
const HTML_HEADER_CELL_SEPARATOR = "\n";

/**
 * Replaces HTML template placeholders without reprocessing inserted values.
 *
 * @param template - Template containing `{{key}}` placeholders.
 * @param replacements - Placeholder values keyed by template token.
 * @returns The template with known placeholders replaced once.
 */
function fillTemplate(
  template: string,
  replacements: Record<string, string>
): string {
  return template.replace(
    HTML_TEMPLATE_PLACEHOLDER.pattern,
    (placeholder, key: string) =>
      Object.prototype.hasOwnProperty.call(replacements, key)
        ? replacements[key]
        : placeholder
  );
}

const DOWNLOAD_ANCHOR = {
  tagName: "a",
  relValue: "noopener",
} as const;

/**
 * Delay before releasing the download blob URL. WebKit (Safari, iOS) starts the
 * download asynchronously and cancels it when the URL is revoked in the same task.
 */
const OBJECT_URL_REVOKE_DELAY_MS = 1000;

function buildSelectionsCell(selections: TribeMemberSelectionBadge[]): string {
  if (selections.length === 0) {
    return MEMBER_EXPORT_COPY.noSelections;
  }

  return selections
    .map(
      (selection) =>
        `${selection.label}${SELECTION_FORMATTER.countOpen}${selection.count}${SELECTION_FORMATTER.countClose}`
    )
    .join(SELECTION_FORMATTER.itemSeparator);
}

function buildRoleLabel(role: TribeMemberRole): string {
  return MEMBER_EXPORT_COPY.roleLabel[role];
}

/**
 * Prefixes spreadsheet formula-like values so user-controlled exports stay literal.
 *
 * @param value - CSV field value before serialization.
 * @returns The original field value or a neutralized literal-safe value.
 */
function neutralizeCsvFormula(value: string): string {
  if (!CSV.formulaStartPattern.test(value)) {
    return value;
  }

  return `${CSV.formulaNeutralizingPrefix}${value}`;
}

/**
 * Escapes a CSV field after neutralizing spreadsheet formulas.
 *
 * @param value - User-controlled or derived field value.
 * @returns A CSV-safe field value.
 */
function escapeCsvField(value: string): string {
  const neutralizedValue = neutralizeCsvFormula(value);

  if (!CSV.unsafeFieldPattern.test(neutralizedValue)) {
    return neutralizedValue;
  }

  const escapedValue = neutralizedValue
    .split(CSV.quote)
    .join(CSV.escapedQuote);

  return `${CSV.quote}${escapedValue}${CSV.quote}`;
}

function escapeHtml(value: string): string {
  return value.replace(
    HTML_ESCAPE_PATTERN,
    (character) => HTML_ENTITY_BY_CHARACTER[character] ?? character
  );
}

type MemberExportRow = {
  elections: string;
  email: string;
  name: string;
  role: string;
};

const HIDDEN_EMAIL_FALLBACK = "";

function buildMemberRows(
  members: TribeMemberResult[],
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>
): MemberExportRow[] {
  return members.map((member) => ({
    elections: buildSelectionsCell(selectionsByMemberId[member.id] ?? []),
    email: member.email ?? HIDDEN_EMAIL_FALLBACK,
    name: member.name,
    role: buildRoleLabel(member.role),
  }));
}

export function buildMembersCsv(
  members: TribeMemberResult[],
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>
): string {
  const header = [
    MEMBER_EXPORT_COPY.columns.name,
    MEMBER_EXPORT_COPY.columns.email,
    MEMBER_EXPORT_COPY.columns.role,
    MEMBER_EXPORT_COPY.columns.elections,
  ]
    .map(escapeCsvField)
    .join(CSV.fieldSeparator);

  const dataRows = buildMemberRows(members, selectionsByMemberId).map((row) =>
    [row.name, row.email, row.role, row.elections]
      .map(escapeCsvField)
      .join(CSV.fieldSeparator)
  );

  return [header, ...dataRows].join(CSV.lineSeparator);
}

export function buildMembersHtml(
  members: TribeMemberResult[],
  selectionsByMemberId: Record<string, TribeMemberSelectionBadge[]>,
  tribeSlug: string
): string {
  const heading = escapeHtml(MEMBER_EXPORT_COPY.pageHeading(tribeSlug));
  const rowsHtml = buildMemberRows(members, selectionsByMemberId)
    .map((row) =>
      fillTemplate(HTML_ROW_TEMPLATE, {
        [HTML_TEMPLATE_KEY.elections]: escapeHtml(row.elections),
        [HTML_TEMPLATE_KEY.email]: escapeHtml(row.email),
        [HTML_TEMPLATE_KEY.name]: escapeHtml(row.name),
        [HTML_TEMPLATE_KEY.role]: escapeHtml(row.role),
      })
    )
    .join(HTML_ROW_SEPARATOR);
  const headerCells = [
    MEMBER_EXPORT_COPY.columns.name,
    MEMBER_EXPORT_COPY.columns.email,
    MEMBER_EXPORT_COPY.columns.role,
    MEMBER_EXPORT_COPY.columns.elections,
  ]
    .map((column) =>
      fillTemplate(HTML_HEADER_CELL_TEMPLATE, {
        [HTML_TEMPLATE_KEY.value]: escapeHtml(column),
      })
    )
    .join(HTML_HEADER_CELL_SEPARATOR);

  return fillTemplate(HTML_DOCUMENT_TEMPLATE, {
    [HTML_TEMPLATE_KEY.headers]: headerCells,
    [HTML_TEMPLATE_KEY.heading]: heading,
    [HTML_TEMPLATE_KEY.rows]: rowsHtml,
  });
}

function sanitizeFilenameSlug(tribeSlug: string): string {
  const normalized = tribeSlug
    .trim()
    .toLowerCase()
    .replace(FILENAME.invalidCharsPattern, FILENAME.separator)
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : FILENAME.slugFallback;
}

function buildIsoDateSegment(now: Date): string {
  return now.toISOString().slice(0, FILENAME.dateSliceLength);
}

export function buildMembersExportFilename(
  tribeSlug: string,
  format: MemberExportFormat,
  now: Date = new Date()
): string {
  const safeSlug = sanitizeFilenameSlug(tribeSlug);
  const dateSegment = buildIsoDateSegment(now);

  const baseName = [
    MEMBER_EXPORT_COPY.filenamePrefix,
    safeSlug,
    dateSegment,
  ].join(FILENAME.separator);

  return [baseName, format].join(FILENAME.extensionSeparator);
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement(DOWNLOAD_ANCHOR.tagName);

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = DOWNLOAD_ANCHOR.relValue;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, OBJECT_URL_REVOKE_DELAY_MS);
}
