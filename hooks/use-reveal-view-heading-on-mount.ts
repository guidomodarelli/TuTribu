import { useEffect, useRef, type RefObject } from "react";

/**
 * After a client-side view swap, brings the new view to the top of the page
 * and moves focus to its heading, so keyboard and screen reader users land on
 * the content that replaced the previous view.
 *
 * Only the value on mount counts: a view that stays mounted while the flag
 * changes (for example, a lesson change inside the same course) keeps focus
 * where the user left it.
 *
 * @param headingRef - Heading of the view; it needs `tabIndex={-1}` to take focus.
 * @param shouldRevealOnMount - Whether the view was mounted by an in-page navigation.
 */
export function useRevealViewHeadingOnMount(
  headingRef: RefObject<HTMLElement | null>,
  shouldRevealOnMount: boolean
): void {
  const shouldRevealOnMountRef = useRef(shouldRevealOnMount);

  useEffect(() => {
    if (!shouldRevealOnMountRef.current) {
      return;
    }

    // The two-argument form jumps instantly on every engine.
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [headingRef]);
}
