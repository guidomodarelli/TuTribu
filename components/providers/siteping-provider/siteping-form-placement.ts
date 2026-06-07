/**
 * Keeps SitePing's annotation comment form fully visible inside the viewport.
 *
 * SitePing anchors the comment form next to the drawn rectangle and flips it to
 * fit the viewport — but its fit math uses the full viewport height and is blind
 * to the instruction toolbar this app relocates to the bottom of the screen
 * while a modal is open (see `siteping-overlay.scss`). As a result the form can
 * land partly behind that toolbar, hiding its "Cancelar"/"Enviar" actions. This
 * module re-clamps the form so it always clears the toolbar band and the
 * viewport edges, which is also a safety net for the no-modal case where the
 * toolbar sits at the top.
 */

/** Gap kept between the form and the viewport edges / toolbar band, in px. */
const FORM_VIEWPORT_MARGIN_PX = 8;

/** Panel SitePing marks with `data-siteping-ignore` (its comment form root). */
const SITEPING_PANEL_SELECTOR = '[data-siteping-ignore="true"]';
const COMMENT_TEXTAREA_SELECTOR = "textarea";
const HIDDEN_DISPLAY_VALUE = "none";

/** Inline z-index SitePing stamps on the instruction toolbar (and the form). */
const SITEPING_TOP_LAYER_Z_INDEX = "2147483647";

/**
 * The toolbar's inline `top` anchor in the browser-serialized form. SitePing
 * pins the toolbar at `top:0` (this app may relocate it to the bottom via CSS,
 * but the inline attribute is unchanged). This distinguishes the toolbar from
 * the SitePing tooltip, which shares the same z-index but is positioned
 * dynamically. See the same serialization note in `siteping-overlay.scss`.
 */
const SITEPING_TOOLBAR_TOP_ANCHOR = "top: 0px";

/** Tag name of SitePing's body-level toolbar/overlay containers. */
const DIV_TAG_NAME = "DIV";

/** A fixed rectangle expressed as viewport-relative top/left plus size. */
export interface FormRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Vertical band occupied by the instruction toolbar, in viewport coordinates. */
export interface ToolbarBand {
  top: number;
  bottom: number;
}

/**
 * Computes a clamped top/left for the comment form so it stays inside the
 * viewport and clears the toolbar band. Pure and layout-free for testing.
 *
 * @returns Rounded `top`/`left` to assign to the form's fixed position.
 */
export function computeClampedFormPosition(params: {
  form: FormRect;
  viewportWidth: number;
  viewportHeight: number;
  toolbar: ToolbarBand | null;
  margin?: number;
}): { top: number; left: number } {
  const { form, viewportWidth, viewportHeight, toolbar } = params;
  const margin = params.margin ?? FORM_VIEWPORT_MARGIN_PX;

  let usableTop = margin;
  let usableBottom = viewportHeight - margin;
  if (toolbar) {
    const toolbarSitsAtTop = toolbar.top <= margin;
    if (toolbarSitsAtTop) {
      usableTop = toolbar.bottom + margin;
    } else {
      usableBottom = toolbar.top - margin;
    }
  }

  let top = form.top;
  if (top + form.height > usableBottom) {
    top = usableBottom - form.height;
  }
  if (top < usableTop) {
    top = usableTop;
  }

  let left = form.left;
  const rightLimit = viewportWidth - margin;
  if (left + form.width > rightLimit) {
    left = rightLimit - form.width;
  }
  if (left < margin) {
    left = margin;
  }

  return { top: Math.round(top), left: Math.round(left) };
}

/** The comment form panel whether or not it is currently shown. */
function findCommentFormPanel(ownerDocument: Document): HTMLElement | null {
  const panels = ownerDocument.querySelectorAll<HTMLElement>(
    SITEPING_PANEL_SELECTOR
  );
  for (const panel of panels) {
    if (panel.querySelector(COMMENT_TEXTAREA_SELECTOR) !== null) {
      return panel;
    }
  }
  return null;
}

/** The comment form panel only while it is visible (SitePing toggles display). */
function findOpenCommentForm(ownerDocument: Document): HTMLElement | null {
  const panel = findCommentFormPanel(ownerDocument);
  if (!panel) {
    return null;
  }
  const view = ownerDocument.defaultView;
  const isVisible =
    !view || view.getComputedStyle(panel).display !== HIDDEN_DISPLAY_VALUE;
  return isVisible ? panel : null;
}

function findSitepingToolbar(ownerDocument: Document): HTMLElement | null {
  for (const child of Array.from(ownerDocument.body.children)) {
    if (!(child instanceof HTMLElement) || child.tagName !== DIV_TAG_NAME) {
      continue;
    }
    const style = child.getAttribute("style") ?? "";
    const isToolbar =
      style.includes(SITEPING_TOP_LAYER_Z_INDEX) &&
      style.includes(SITEPING_TOOLBAR_TOP_ANCHOR) &&
      !child.hasAttribute("data-siteping-ignore");
    if (isToolbar) {
      return child;
    }
  }
  return null;
}

function clampOpenCommentForm(ownerDocument: Document): void {
  const view = ownerDocument.defaultView;
  if (!view) {
    return;
  }
  const form = findOpenCommentForm(ownerDocument);
  if (!form) {
    return;
  }

  const formRect = form.getBoundingClientRect();
  const toolbar = findSitepingToolbar(ownerDocument);
  const toolbarRect = toolbar?.getBoundingClientRect() ?? null;

  const { top, left } = computeClampedFormPosition({
    form: {
      top: formRect.top,
      left: formRect.left,
      width: formRect.width,
      height: formRect.height,
    },
    viewportWidth: view.innerWidth,
    viewportHeight: view.innerHeight,
    toolbar: toolbarRect
      ? { top: toolbarRect.top, bottom: toolbarRect.bottom }
      : null,
  });

  // Idempotent: only writes when out of place, so the style observer settles.
  if (Math.round(formRect.top) !== top) {
    form.style.top = `${top}px`;
  }
  if (Math.round(formRect.left) !== left) {
    form.style.left = `${left}px`;
  }
}

/**
 * Installs the viewport clamp: repositions SitePing's comment form whenever it
 * opens, moves, or the window resizes, so its actions never sit off-screen or
 * behind the relocated toolbar.
 *
 * @param ownerDocument - Document to observe. Defaults to the global `document`.
 * @returns A cleanup function that disconnects observers and listeners.
 */
export function installSitepingFormViewportClamp(
  ownerDocument: Document = document
): () => void {
  const view = ownerDocument.defaultView;
  let observedForm: HTMLElement | null = null;
  let formStyleObserver: MutationObserver | null = null;
  let formSizeObserver: ResizeObserver | null = null;

  const reclamp = (): void => clampOpenCommentForm(ownerDocument);

  const syncObservedForm = (): void => {
    const form = findCommentFormPanel(ownerDocument);
    if (form && form === observedForm) {
      reclamp();
      return;
    }

    formStyleObserver?.disconnect();
    formSizeObserver?.disconnect();
    observedForm = form;
    if (!form) {
      formStyleObserver = null;
      formSizeObserver = null;
      return;
    }

    // Style observer catches SitePing repositioning the form (top/left/display).
    formStyleObserver = new MutationObserver(reclamp);
    formStyleObserver.observe(form, {
      attributeFilter: ["style"],
      attributes: true,
    });
    // Size observer catches the form settling to its final height after its
    // content renders, which a style-attribute observer cannot see and which
    // would otherwise leave the form a few px past the intended margin.
    if (view && typeof view.ResizeObserver === "function") {
      formSizeObserver = new view.ResizeObserver(reclamp);
      formSizeObserver.observe(form);
    }
    reclamp();
  };

  syncObservedForm();

  // `subtree` so we also catch SitePing building the form's contents (the
  // textarea) into a panel it already appended, not just the panel insertion
  // itself — otherwise the style observer is never attached and the clamp never
  // runs. The handler is a cheap selector lookup, so the broad scope is fine.
  const bodyObserver = new MutationObserver(syncObservedForm);
  bodyObserver.observe(ownerDocument.body, { childList: true, subtree: true });

  view?.addEventListener("resize", reclamp);

  return () => {
    bodyObserver.disconnect();
    formStyleObserver?.disconnect();
    formSizeObserver?.disconnect();
    view?.removeEventListener("resize", reclamp);
  };
}
