const SITEPING_REDACTION = {
  hiddenValue: "[redacted]",
  sensitiveHeaderNamePattern: /\b(cookie|set-cookie)(:\s*)/gi,
  sensitiveHeaderValueBoundaryPattern: /\s(?:cookie|set-cookie):|\s\{/i,
  whitespacePattern: /\s/,
  sensitiveJsonKeyValuePattern:
    /("[^"]*(?:token|key|password|secret|code|state|session|auth|cookie)[^"]*"\s*:\s*)"[^"]*"/gi,
  sensitiveKeyValuePattern:
    /\b([a-z0-9_-]*(?:token|key|password|secret|code|state|session|auth|cookie)[a-z0-9_-]*)(=|:\s*)[^\s,;)&]+/gi,
  queryParameterStarts: new Set(["?", "&"]),
  queryParameterSeparator: "&",
  queryParameterAssignment: "=",
  sensitiveQueryNamePattern: /token|key|password|secret|code|state|session|auth|cookie/i,
  tokenLikePattern: /(bearer\s+)[a-z0-9._-]+/gi,
} as const;

/**
 * @param value - Text being scanned.
 * @param startIndex - First index after the `?` or `&` that opens a parameter.
 * @returns Index of the `=` or `&` that ends the parameter name, or the text length.
 */
function findQueryParameterNameEnd(value: string, startIndex: number): number {
  let index = startIndex;
  while (index < value.length && value.charAt(index) !== SITEPING_REDACTION.queryParameterAssignment && value.charAt(index) !== SITEPING_REDACTION.queryParameterSeparator) index += 1;
  return index;
}

/**
 * Redacts the values of query parameters whose name looks sensitive.
 * A parameter with a harmless name is kept, and the scan resumes inside its value because it may embed another query.
 * @param value - Text that may contain query strings.
 * @returns Text with sensitive query values hidden.
 */
function redactSensitiveQueryValues(value: string): string {
  const { queryParameterStarts, queryParameterSeparator, queryParameterAssignment } = SITEPING_REDACTION;
  let cursor = 0;
  let redactedValue = "";
  let index = 0;
  while (index < value.length) {
    if (!queryParameterStarts.has(value.charAt(index))) {
      index += 1;
      continue;
    }
    const nameEndIndex = findQueryParameterNameEnd(value, index + 1);
    if (value.charAt(nameEndIndex) !== queryParameterAssignment) {
      index = nameEndIndex;
      continue;
    }
    const valueStartIndex = nameEndIndex + 1;
    const hasValue = valueStartIndex < value.length && value.charAt(valueStartIndex) !== queryParameterSeparator;
    if (hasValue && SITEPING_REDACTION.sensitiveQueryNamePattern.test(value.slice(index, valueStartIndex))) {
      const separatorIndex = value.indexOf(queryParameterSeparator, valueStartIndex);
      const valueEndIndex = separatorIndex === -1 ? value.length : separatorIndex;
      redactedValue += `${value.slice(cursor, valueStartIndex)}${SITEPING_REDACTION.hiddenValue}`;
      cursor = valueEndIndex;
      index = valueEndIndex;
    } else {
      index = valueStartIndex;
    }
  }
  return `${redactedValue}${value.slice(cursor)}`;
}

/**
 * Finds where a header value ends: at the whitespace run that precedes the next header or a JSON object.
 * The boundary pattern matches only the last whitespace of that run, so the run is walked back to its start.
 * @param text - Text that follows a sensitive header name.
 * @returns Index of the boundary in `text`, or undefined when the value runs to the end.
 */
function findHeaderValueBoundary(text: string): number | undefined {
  const boundaryMatch = SITEPING_REDACTION.sensitiveHeaderValueBoundaryPattern.exec(text);

  if (!boundaryMatch) {
    return undefined;
  }

  let boundaryIndex = boundaryMatch.index;

  while (
    boundaryIndex > 0 &&
    SITEPING_REDACTION.whitespacePattern.test(text.charAt(boundaryIndex - 1))
  ) {
    boundaryIndex -= 1;
  }

  return boundaryIndex;
}

function redactSensitiveHeaderValues(value: string): string {
  let cursor = 0;
  let redactedValue = "";
  let headerMatch: RegExpExecArray | null;

  SITEPING_REDACTION.sensitiveHeaderNamePattern.lastIndex = 0;
  headerMatch = SITEPING_REDACTION.sensitiveHeaderNamePattern.exec(value);

  while (headerMatch) {
    const headerStartIndex = headerMatch.index;
    const headerValueStartIndex = headerStartIndex + headerMatch[0].length;
    const remainingText = value.slice(headerValueStartIndex);
    const boundaryIndex = findHeaderValueBoundary(remainingText);
    const headerValueEndIndex =
      boundaryIndex === undefined
        ? value.length
        : headerValueStartIndex + boundaryIndex;

    redactedValue += `${value.slice(cursor, headerValueStartIndex)}${SITEPING_REDACTION.hiddenValue}`;
    cursor = headerValueEndIndex;
    SITEPING_REDACTION.sensitiveHeaderNamePattern.lastIndex =
      headerValueEndIndex;
    headerMatch = SITEPING_REDACTION.sensitiveHeaderNamePattern.exec(value);
  }

  return `${redactedValue}${value.slice(cursor)}`;
}

/**
 * Redacts SitePing diagnostic text before it can be persisted or published.
 *
 * @param value - Diagnostic or feedback text that may contain sensitive values.
 * @returns Text with sensitive query, JSON, header, and token-like values redacted.
 */
export function redactSitepingSensitiveText(value: string): string {
  const redactedStructuredValue = redactSensitiveQueryValues(value)
    .replace(
      SITEPING_REDACTION.sensitiveJsonKeyValuePattern,
      `$1"${SITEPING_REDACTION.hiddenValue}"`
    );

  return redactSensitiveHeaderValues(redactedStructuredValue)
    .replace(
      SITEPING_REDACTION.sensitiveKeyValuePattern,
      `$1$2${SITEPING_REDACTION.hiddenValue}`
    )
    .replace(
      SITEPING_REDACTION.tokenLikePattern,
      `$1${SITEPING_REDACTION.hiddenValue}`
    );
}
