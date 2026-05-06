const TRIBE_SLUG_BUILD_SEPARATOR = "-";
const TRIBE_SLUG_NORMALIZATION_FORM = "NFD";
const TRIBE_SLUG_RESERVED_VALUE_LIST = ["crear"] as const;
const TRIBE_SLUG_RESERVED_VALUES = new Set<string>(TRIBE_SLUG_RESERVED_VALUE_LIST);
const EMPTY_TEXT = "";

export function normalizeTribeSlug(input: string): string {
  return input
    .normalize(TRIBE_SLUG_NORMALIZATION_FORM)
    .replace(/[\u0300-\u036f]/g, EMPTY_TEXT)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, TRIBE_SLUG_BUILD_SEPARATOR)
    .replace(/^-+|-+$/g, EMPTY_TEXT)
    .replace(/-{2,}/g, TRIBE_SLUG_BUILD_SEPARATOR);
}

export function isReservedTribeSlug(slug: string): boolean {
  return TRIBE_SLUG_RESERVED_VALUES.has(slug.trim().toLowerCase());
}

export function buildTribeSlugSuggestion(baseSlug: string, index: number): string {
  return `${baseSlug}${TRIBE_SLUG_BUILD_SEPARATOR}${index}`;
}
