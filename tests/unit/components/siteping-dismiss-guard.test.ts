import { installSitepingDismissGuard } from "@/components/providers/siteping-provider/siteping-dismiss-guard";

const RADIX_POINTER_DOWN_OUTSIDE_EVENT = "dismissableLayer.pointerDownOutside";
const RADIX_FOCUS_OUTSIDE_EVENT = "dismissableLayer.focusOutside";
const SITEPING_WIDGET_TAG_NAME = "siteping-widget";

/**
 * Reproduces how Radix `DismissableLayer` decides whether to dismiss: it
 * dispatches a cancelable custom event on the interaction target and only
 * dismisses when `defaultPrevented` is still false afterwards.
 */
function dispatchRadixOutsideEvent(eventName: string, target: Element): boolean {
  const event = new CustomEvent(eventName, { bubbles: false, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * Reproduces how Radix `FocusScope` traps focus: it listens for native
 * `focusin`/`focusout` on `document` (bubble phase) and refocuses the dialog.
 * Returns whether the bubble listener still runs — i.e. whether the trap would
 * fire — after the guard had its chance to stop the event in the capture phase.
 */
function focusEventReachesDocument(
  eventName: "focusin" | "focusout",
  target: Element,
  relatedTarget: Element | null
): boolean {
  const trapListener = jest.fn();
  document.addEventListener(eventName, trapListener);
  const event = new FocusEvent(eventName, { bubbles: true, relatedTarget });
  target.dispatchEvent(event);
  document.removeEventListener(eventName, trapListener);
  return trapListener.mock.calls.length > 0;
}

describe("installSitepingDismissGuard", () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installSitepingDismissGuard();
  });

  afterEach(() => {
    uninstall();
    document.body.innerHTML = "";
  });

  it("cancels the Radix pointer-down-outside dismissal when the target is the Siteping widget", () => {
    const widget = document.createElement(SITEPING_WIDGET_TAG_NAME);
    document.body.appendChild(widget);

    const wasDismissed = !dispatchRadixOutsideEvent(
      RADIX_POINTER_DOWN_OUTSIDE_EVENT,
      widget
    );

    expect(wasDismissed).toBe(false);
  });

  it("cancels the Radix focus-outside dismissal when the target is the Siteping widget", () => {
    const widget = document.createElement(SITEPING_WIDGET_TAG_NAME);
    document.body.appendChild(widget);

    const wasDismissed = !dispatchRadixOutsideEvent(
      RADIX_FOCUS_OUTSIDE_EVENT,
      widget
    );

    expect(wasDismissed).toBe(false);
  });

  it("cancels the dismissal for elements flagged with the Siteping ignore attribute", () => {
    const ignored = document.createElement("div");
    ignored.setAttribute("data-siteping-ignore", "true");
    document.body.appendChild(ignored);

    const wasDismissed = !dispatchRadixOutsideEvent(
      RADIX_POINTER_DOWN_OUTSIDE_EVENT,
      ignored
    );

    expect(wasDismissed).toBe(false);
  });

  it("cancels the dismissal when drawing on the Siteping annotation overlay", () => {
    const overlay = document.createElement("div");
    overlay.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:2147483646;cursor:crosshair;"
    );
    document.body.appendChild(overlay);

    const wasDismissed = !dispatchRadixOutsideEvent(
      RADIX_POINTER_DOWN_OUTSIDE_EVENT,
      overlay
    );

    expect(wasDismissed).toBe(false);
  });

  it("cancels the dismissal for a child of the Siteping instruction toolbar", () => {
    const toolbar = document.createElement("div");
    toolbar.setAttribute(
      "style",
      "position:fixed;top:0;left:0;right:0;z-index:2147483647;"
    );
    const cancelButton = document.createElement("button");
    toolbar.appendChild(cancelButton);
    document.body.appendChild(toolbar);

    const wasDismissed = !dispatchRadixOutsideEvent(
      RADIX_FOCUS_OUTSIDE_EVENT,
      cancelButton
    );

    expect(wasDismissed).toBe(false);
  });

  it("keeps dismissing for unrelated page elements that merely use a high z-index", () => {
    const wrapper = document.createElement("section");
    const inner = document.createElement("div");
    inner.setAttribute("style", "position:relative;z-index:2147483647;");
    wrapper.appendChild(inner);
    document.body.appendChild(wrapper);

    const wasDismissed = !dispatchRadixOutsideEvent(
      RADIX_POINTER_DOWN_OUTSIDE_EVENT,
      inner
    );

    expect(wasDismissed).toBe(true);
  });

  it("stops the focus trap from firing when focus enters a Siteping panel field", () => {
    const panel = document.createElement("div");
    panel.setAttribute("data-siteping-ignore", "true");
    const textarea = document.createElement("textarea");
    panel.appendChild(textarea);
    document.body.appendChild(panel);

    const trapWouldFire = focusEventReachesDocument("focusin", textarea, null);

    expect(trapWouldFire).toBe(false);
  });

  it("stops the focus trap when focus leaves the dialog toward a Siteping field", () => {
    const dialogField = document.createElement("input");
    document.body.appendChild(dialogField);
    const panel = document.createElement("div");
    panel.setAttribute("data-siteping-ignore", "true");
    const textarea = document.createElement("textarea");
    panel.appendChild(textarea);
    document.body.appendChild(panel);

    const trapWouldFire = focusEventReachesDocument(
      "focusout",
      dialogField,
      textarea
    );

    expect(trapWouldFire).toBe(false);
  });

  it("leaves the focus trap intact for focus changes outside Siteping", () => {
    const dialogField = document.createElement("input");
    document.body.appendChild(dialogField);

    const trapWouldFire = focusEventReachesDocument("focusin", dialogField, null);

    expect(trapWouldFire).toBe(true);
  });

  it("keeps dismissing Radix layers for interactions outside the Siteping widget", () => {
    const unrelated = document.createElement("button");
    document.body.appendChild(unrelated);

    const wasDismissed = !dispatchRadixOutsideEvent(
      RADIX_POINTER_DOWN_OUTSIDE_EVENT,
      unrelated
    );

    expect(wasDismissed).toBe(true);
  });

  it("stops guarding once uninstalled", () => {
    const widget = document.createElement(SITEPING_WIDGET_TAG_NAME);
    document.body.appendChild(widget);

    uninstall();

    const wasDismissed = !dispatchRadixOutsideEvent(
      RADIX_POINTER_DOWN_OUTSIDE_EVENT,
      widget
    );

    expect(wasDismissed).toBe(true);
  });
});
