import { useEffect, useState } from "react";

/** Custom properties the centered element reads as its whole-pixel offsets. */
const SNAPPED_TOP_PROPERTY = "--pixel-snapped-top";
const SNAPPED_LEFT_PROPERTY = "--pixel-snapped-left";
/** Centering splits the free space evenly between both sides. */
const CENTERING_SIDES = 2;

/**
 * Offset that centers an element inside the viewport on a whole pixel.
 *
 * A centered element whose free space is odd (or whose size is fractional) sits
 * on a half pixel. Composited playback, such as a dialog entrance, paints it on
 * a snapped pixel and the settled layout then repaints it one pixel away, which
 * reads as a jump. Flooring keeps both paints on the same pixel.
 *
 * @param viewportSize - Viewport length along the axis, in CSS pixels.
 * @param elementSize - Element length along the same axis, in CSS pixels.
 * @returns The whole-pixel start offset, never negative.
 */
export function getPixelSnappedCenterOffset(
  viewportSize: number,
  elementSize: number
): number {
  return Math.max(0, Math.floor((viewportSize - elementSize) / CENTERING_SIDES));
}

/**
 * Keeps a fixed, centered element on whole pixels while it is mounted.
 *
 * It publishes `--pixel-snapped-top` and `--pixel-snapped-left` on the element
 * and refreshes them when the element or the viewport resizes. Styles opt in by
 * reading those properties (for example as margins with an `auto` fallback), so
 * layouts that do not use them, like a fullscreen mobile panel, are unaffected.
 *
 * @returns A callback ref to attach to the centered element.
 */
export function usePixelSnappedCentering(): (element: HTMLElement | null) => void {
  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!element) {
      return;
    }

    const snapToWholePixels = () => {
      const viewport = document.documentElement;
      // Layout sizes ignore transforms, so an entrance scale never skews the offsets.
      element.style.setProperty(
        SNAPPED_TOP_PROPERTY,
        `${getPixelSnappedCenterOffset(viewport.clientHeight, element.offsetHeight)}px`
      );
      element.style.setProperty(
        SNAPPED_LEFT_PROPERTY,
        `${getPixelSnappedCenterOffset(viewport.clientWidth, element.offsetWidth)}px`
      );
    };

    snapToWholePixels();
    const resizeObserver = new ResizeObserver(snapToWholePixels);
    resizeObserver.observe(element);
    window.addEventListener("resize", snapToWholePixels);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", snapToWholePixels);
      element.style.removeProperty(SNAPPED_TOP_PROPERTY);
      element.style.removeProperty(SNAPPED_LEFT_PROPERTY);
    };
  }, [element]);

  return setElement;
}
