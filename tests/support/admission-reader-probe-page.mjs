/** Renders only synthetic native-reader comparison pages; product journeys keep their own application. */
import { ADMISSION_READER_PROBE as PROBE } from "./constants/admission-reader-probe.mjs";

/**
 * @param {string} markupVariant - Registered synthetic markup variant.
 * @param {boolean} seededMarker - Whether the region starts with the hidden seeded marker.
 * @returns {string} The region's initial text before the button handler updates it.
 */
function initialStatusFor(markupVariant, seededMarker) {
  if (seededMarker) return PROBE.initialStatusMarker;
  return markupVariant === PROBE.markupVariants.empty ? "" : PROBE.initialStatusText;
}

/**
 * @param {{title:string,focus:string,status:string,markupVariant:string}} item - Server-generated synthetic case, never a caller-selected message.
 * @returns {string} A persistent polite/atomic region updated only by the page's actual button handler.
 */
export function renderAdmissionReaderProbePage(item) {
  if (!Object.values(PROBE.markupVariants).includes(item.markupVariant)) throw new Error("AdmissionReaderProbePage.render failed: unsupported_markup_variant");
  const seededMarker = item.markupVariant === PROBE.markupVariants.seededMarker;
  const initialStatus = initialStatusFor(item.markupVariant, seededMarker);
  const statusRole = item.markupVariant === PROBE.markupVariants.politeParagraph ? "" : ' role="status"';
  const updateStatus = item.markupVariant === PROBE.markupVariants.empty
    ? `status.textContent=${JSON.stringify(item.status)};`
    : `status.firstChild.nodeValue=${JSON.stringify(item.status)};`;
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>${item.title}</title>
<style>.ReaderProbe__status--idle{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}</style>
<body class="ReaderProbe"><h1>${PROBE.headingText}</h1><button id="control">${item.focus}</button>
<p id="status"${seededMarker ? ' class="ReaderProbe__status--idle"' : ""}${statusRole} aria-live="polite" aria-atomic="true">${initialStatus}</p><p>Fin</p>
<script>document.getElementById("control").addEventListener("click",()=>{
  const status=document.getElementById("status");
  ${updateStatus}
  status.classList.remove("ReaderProbe__status--idle");
});</script></body></html>`;
}
