/**
 * Browser clipboard adapter with feature detection. The async Clipboard API
 * is preferred; when it is missing (older WebKit, insecure context) or
 * rejects, a hidden textarea plus `document.execCommand("copy")` is tried,
 * which WebKit still honours inside a user gesture.
 */

const FALLBACK_COPY_COMMAND = "copy";
const FALLBACK_TEXTAREA_TAG = "textarea";
const FALLBACK_READONLY_ATTRIBUTE = "readonly";
const OFFSCREEN_POSITION = "fixed";
const OFFSCREEN_OFFSET = "-9999px";

function copyWithSelectionFallback(text: string): boolean {
  if (typeof document.execCommand !== "function") {
    return false;
  }

  const textarea = document.createElement(FALLBACK_TEXTAREA_TAG);

  textarea.value = text;
  textarea.setAttribute(FALLBACK_READONLY_ATTRIBUTE, "");
  textarea.style.position = OFFSCREEN_POSITION;
  textarea.style.top = OFFSCREEN_OFFSET;
  document.body.appendChild(textarea);
  textarea.select();
  // iOS Safari needs an explicit range for read-only fields.
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand(FALLBACK_COPY_COMMAND);
  } catch {
    // The legacy command can throw when copying is blocked; report failure.
    return false;
  } finally {
    textarea.remove();
  }
}

/**
 * Copies text to the clipboard.
 *
 * @param text - Text to copy.
 * @returns True when the text reached the clipboard.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or unsupported context: try the legacy path below.
    }
  }

  return copyWithSelectionFallback(text);
}
