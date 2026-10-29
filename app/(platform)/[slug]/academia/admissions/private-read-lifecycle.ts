/**
 * Mount and restore lifecycle shared by the private admission settings flows
 * (rules and messaging usage): read on mount, reread after a restored page,
 * and release every read and write in flight on cleanup.
 *
 * @module private-read-lifecycle
 */
import type { RefObject } from "react";

/** Work slots of a private flow: the read and write in flight and the busy/loaded guards. */
type PrivateWorkSlots = {
  busy: RefObject<boolean>;
  loaded: RefObject<boolean>;
  readController: RefObject<AbortController | null>;
  writeController: RefObject<AbortController | null>;
};

/** Callbacks of the flow that the lifecycle drives. */
type PrivateReadLifecycle = {
  /** Whether the flow already mounted once (an Activity re-show is not the first read). */
  mounted: RefObject<boolean>;
  /** Reads the current private state; `initial` is true only on the first mount. */
  readCurrent: (signal: AbortSignal, initial: boolean) => Promise<void>;
  /** Hides the private state and withdraws its freshness and confirmation before a reread. */
  invalidate: () => void;
  /** Launches the explicit read after a restored page. */
  relaunch: () => void;
};

/**
 * Aborts reads and writes in flight and forgets the loaded original, so a
 * later mount or restoration reads it again.
 *
 * @param slots - Work slots of the flow.
 */
function releasePrivateWork(slots: PrivateWorkSlots): void {
  slots.readController.current?.abort();
  slots.writeController.current?.abort();
  slots.busy.current = false;
  slots.loaded.current = false;
}

/**
 * Reads on mount (invalidating first when it is not the first mount) and
 * rereads a page restored from Activity/bfcache, which must reload the
 * original stored intent before any new write.
 *
 * @param slots - Work slots of the flow.
 * @param lifecycle - Mount flag, read, invalidation and relaunch of the flow.
 * @returns The cleanup that aborts the reads and writes in flight.
 */
export function startPrivateReadLifecycle(
  slots: PrivateWorkSlots,
  { mounted, readCurrent, invalidate, relaunch }: PrivateReadLifecycle
): () => void {
  const controller = new AbortController();
  slots.readController.current = controller;
  void Promise.resolve().then(() => {
    if (controller.signal.aborted) return;
    const initial = !mounted.current;
    mounted.current = true;
    if (!initial) invalidate();
    return readCurrent(controller.signal, initial);
  });
  const restored = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    invalidate();
    slots.writeController.current?.abort();
    slots.busy.current = false;
    slots.loaded.current = false;
    relaunch();
  };
  window.addEventListener("pageshow", restored);
  return () => {
    controller.abort();
    releasePrivateWork(slots);
    window.removeEventListener("pageshow", restored);
  };
}
