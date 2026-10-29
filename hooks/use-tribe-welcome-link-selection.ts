import { useRef, useState } from "react";
import { toast } from "@golfo/ui";

import type { TribeWelcomeLinkResult } from "@/src/modules/tribes/application/results/tribe-welcome-result";

const TRIBE_WELCOME_LINK_SELECTION_COPY = {
  fallbackError:
    "No pudimos registrar tu elección. Probá de nuevo en unos minutos.",
} as const;

const SELECTION_REQUEST = {
  apiPrefix: "/api/tribes/",
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  postMethod: "POST",
  selectionsSegment: "/welcome/selections",
} as const;

const SELECTION_WINDOW_OPEN = {
  blankUrl: "about:blank",
  target: "_blank",
} as const;

/** One member choice of a welcome resource. */
export type TribeWelcomeLinkSelection = {
  /** Destination opened once the choice is recorded. */
  href: string;
  link: TribeWelcomeLinkResult;
  /** Runs once the selection is recorded and the destination opened. */
  onSelected?: () => void;
  tribeSlug: string;
};

function openDestinationWindow(): Window | null {
  const openedWindow = window.open(
    SELECTION_WINDOW_OPEN.blankUrl,
    SELECTION_WINDOW_OPEN.target
  );

  if (openedWindow) {
    openedWindow.opener = null;
  }

  return openedWindow;
}

/**
 * Records the member's welcome resource choice, one at a time, and opens its
 * destination in a window opened beforehand, so popup blockers let it through
 * (or in the current one when popups are blocked).
 * @returns The id of the link being recorded and the selection handler.
 */
export function useTribeWelcomeLinkSelection() {
  const [pendingLinkId, setPendingLinkId] = useState<string | null>(null);
  const pendingSelectionRef = useRef(false);

  const selectLink = async ({
    href,
    link,
    onSelected,
    tribeSlug,
  }: TribeWelcomeLinkSelection): Promise<void> => {
    if (pendingSelectionRef.current) {
      return;
    }

    const destinationWindow = openDestinationWindow();

    pendingSelectionRef.current = true;
    setPendingLinkId(link.id);

    try {
      const response = await fetch(
        SELECTION_REQUEST.apiPrefix +
          encodeURIComponent(tribeSlug) +
          SELECTION_REQUEST.selectionsSegment,
        {
          body: JSON.stringify({ welcomeLinkId: link.id }),
          headers: {
            [SELECTION_REQUEST.contentTypeHeader]:
              SELECTION_REQUEST.jsonContentType,
          },
          method: SELECTION_REQUEST.postMethod,
        }
      );

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        toast.error(
          errorPayload?.message ||
            TRIBE_WELCOME_LINK_SELECTION_COPY.fallbackError
        );
        destinationWindow?.close();
        return;
      }

      if (destinationWindow) {
        destinationWindow.location.href = href;
      } else {
        window.location.assign(href);
      }

      onSelected?.();
    } catch {
      destinationWindow?.close();
      toast.error(TRIBE_WELCOME_LINK_SELECTION_COPY.fallbackError);
    } finally {
      pendingSelectionRef.current = false;
      setPendingLinkId(null);
    }
  };

  return { pendingLinkId, selectLink };
}
