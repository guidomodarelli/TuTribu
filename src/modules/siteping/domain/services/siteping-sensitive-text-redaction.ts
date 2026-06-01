const SITEPING_REDACTION = {
  hiddenValue: "[redacted]",
  sensitiveHeaderNamePattern: /\b(cookie|set-cookie)(:\s*)/gi,
  sensitiveHeaderValueBoundaryPattern: /\s+(?:cookie|set-cookie):|\s+\{/i,
  sensitiveJsonKeyValuePattern:
    /("[^"]*(?:token|key|password|secret|code|state|session|auth|cookie)[^"]*"\s*:\s*)"[^"]*"/gi,
  sensitiveKeyValuePattern:
    /\b([a-z0-9_-]*(?:token|key|password|secret|code|state|session|auth|cookie)[a-z0-9_-]*)(=|:\s*)[^\s,;)&]+/gi,
  sensitiveQueryPattern:
    /([?&][^=&]*(?:token|key|password|secret|code|state|session|auth|cookie)[^=&]*=)[^&]+/gi,
  tokenLikePattern: /(bearer\s+)[a-z0-9._-]+/gi,
} as const;

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
    const boundaryMatch = remainingText.match(
      SITEPING_REDACTION.sensitiveHeaderValueBoundaryPattern
    );
    const headerValueEndIndex =
      boundaryMatch?.index === undefined
        ? value.length
        : headerValueStartIndex + boundaryMatch.index;

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
  const redactedStructuredValue = value
    .replace(
      SITEPING_REDACTION.sensitiveQueryPattern,
      `$1${SITEPING_REDACTION.hiddenValue}`
    )
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
