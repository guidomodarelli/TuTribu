/** Projects native browser errors into bounded fixture diagnostics without private URLs or exception text. @module admission-whatsapp-browser-errors */
import { ADMISSION_WHATSAPP_BROWSER_ERROR, type AdmissionWhatsappBrowserPhase } from "./constants/admission-whatsapp-number";

/** Own observation context contains only known in-memory request identities and fixed workflow labels. */
export type AdmissionWhatsappBrowserErrorContext = {
  phase: AdmissionWhatsappBrowserPhase;
  leaderSurface: boolean;
  origin: string;
  submissionUrl: string | null;
  correctionUrl: string | null;
  accountUrls: ReadonlySet<string>;
};

/** Public diagnostic envelope deliberately excludes the Error object and every free-form field. */
export type AdmissionWhatsappBrowserErrorObservation = {
  phase: AdmissionWhatsappBrowserPhase;
  leaderSurface: boolean;
  name: string;
  sameOrigin: boolean | null;
  matchesSubmission: boolean;
  matchesCorrection: boolean;
  matchesAccountProbe: boolean;
  accessControl: boolean;
  canceled: boolean;
  frames: { chunk: string; line: number; column: number }[];
};

/**
 * Selects closed error names, exact-request comparison booleans and public chunk coordinates only.
 * @param error - Native Playwright error, never persisted directly.
 * @param context - Current fixture state; request URLs are used only for comparison.
 * @returns Bounded metadata suitable for the private evidence directory; no error is ignored.
 */
export function observeAdmissionWhatsappBrowserError(error: Error, context: AdmissionWhatsappBrowserErrorContext): AdmissionWhatsappBrowserErrorObservation {
  const description = `${error.name}:${error.message}`;
  const nativeFetch = description.startsWith(ADMISSION_WHATSAPP_BROWSER_ERROR.nativeFetchPrefix);
  const name = nativeFetch ? ADMISSION_WHATSAPP_BROWSER_ERROR.nativeFetchName : ADMISSION_WHATSAPP_BROWSER_ERROR.knownNames.some((knownName) => knownName === error.name) ? error.name : ADMISSION_WHATSAPP_BROWSER_ERROR.unknownName;
  let networkUrl: URL | null = null;
  let networkDescription = "";
  if (nativeFetch) {
    const fetchDescription = description.slice(ADMISSION_WHATSAPP_BROWSER_ERROR.nativeFetchPrefix.length), address = fetchDescription.split(" ")[0];
    networkDescription = fetchDescription.slice(address.length);
    try { networkUrl = new URL(address); }
    catch { networkUrl = null; }
  }
  const rawStack = error.stack ?? "", messageLines = new Set(error.message.split(/\r?\n/).map((line) => line.trim()));
  const header = [`${error.name}: ${error.message}`, `${error.name}:${error.message}`].find((candidate) => rawStack.startsWith(candidate));
  const frameStack = header ? rawStack.slice(header.length) : rawStack;
  const frames: AdmissionWhatsappBrowserErrorObservation["frames"] = [];
  for (const stackLine of frameStack.split(/\r?\n/)) {
    let location = stackLine.trim();
    if (messageLines.has(location)) continue;
    if (location.startsWith("at ")) location = location.slice("at ".length);
    if (location.endsWith(")")) {
      const functionSeparator = location.indexOf(" (");
      if (functionSeparator >= 0) location = location.slice(functionSeparator + " (".length, -1);
      else if (location.startsWith("(")) location = location.slice(1, -1);
    }
    if (!location.startsWith("http://") && !location.startsWith("https://") && location.includes("@")) location = location.slice(location.indexOf("@") + 1);
    const frame = ADMISSION_WHATSAPP_BROWSER_ERROR.frameLocationPattern.exec(location);
    if (!frame) continue;
    const [, address, lineText, columnText] = frame;
    let frameUrl: URL;
    try { frameUrl = new URL(address); } catch { continue; }
    if (frameUrl.origin !== context.origin || frameUrl.username || frameUrl.password || !frameUrl.pathname.startsWith(ADMISSION_WHATSAPP_BROWSER_ERROR.ownFramePath)) continue;
    const chunk = frameUrl.pathname.slice(ADMISSION_WHATSAPP_BROWSER_ERROR.ownFramePath.length), line = Number(lineText), column = Number(columnText);
    if (!ADMISSION_WHATSAPP_BROWSER_ERROR.chunkNamePattern.test(chunk) || !Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 0) continue;
    frames.push({ chunk, line, column });
    if (frames.length >= ADMISSION_WHATSAPP_BROWSER_ERROR.maximumFrames) break;
  }
  return { phase: context.phase, leaderSurface: context.leaderSurface, name, sameOrigin: networkUrl ? networkUrl.origin === context.origin : null, matchesSubmission: networkUrl !== null && networkUrl.href === context.submissionUrl, matchesCorrection: networkUrl !== null && networkUrl.href === context.correctionUrl, matchesAccountProbe: networkUrl !== null && context.accountUrls.has(networkUrl.href), accessControl: networkUrl !== null && ADMISSION_WHATSAPP_BROWSER_ERROR.accessControlPattern.test(networkDescription), canceled: networkUrl !== null && ADMISSION_WHATSAPP_BROWSER_ERROR.canceledPattern.test(networkDescription), frames };
}
