/** Owns historical URL attribution and reference-only browser recovery. @module legacy-admission-arrival */
export const LEGACY_ADMISSION_ARRIVAL = {
  segment: "legacy",
  canonicalTokenPattern: /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u,
  scopePattern: /^[a-f0-9]{64}$/u,
  hashDomain: "tutribu.admission.legacy.browser.v1:",
  hashAlgorithm: "SHA-256",
  hexRadix: 16,
  hexByteWidth: 2,
} as const;
