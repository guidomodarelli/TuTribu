/** Owns notification panel regions and shared-library motion settings. @module notification-panel-constants */
import { MOTION_TIMING, MOTION_EASE } from "@guidomodarelli/beez-ui";

/** Separates cached rows from loading/error/empty body regions. */
export const NOTIFICATION_PANEL_VIEW = { empty: "empty", error: "error", idle: "idle", list: "list", loading: "loading" } as const;
/** Preserves the header action's original opacity-only shared motion. */
export const MARK_ALL_FADE = { animate: { opacity: 1 }, exit: { opacity: 0 }, initial: { opacity: 0 }, transition: { duration: MOTION_TIMING.enter, ease: MOTION_EASE } } as const;
