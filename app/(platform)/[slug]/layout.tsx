import { Suspense } from "react";

import { TribePresenceHeartbeat } from "@/components/tribes/tribe-presence-heartbeat";

/**
 * Tribe segment layout: renders the tribe pages untouched and mounts the
 * presence heartbeat so any open tribe page keeps the viewer's membership
 * `last_seen_at` fresh for the about page online counter.
 *
 * The layout deliberately reads no `params` on the server: URL data awaited
 * in a layout ties its App Shell to one tribe and blocks instant navigation
 * for every `/[slug]/*` route, even behind a layout-level `Suspense`. The
 * heartbeat resolves the slug on the client through `useParams`, which only
 * needs a `Suspense` boundary for the static shell on page loads and resolves
 * synchronously on client navigations.
 */
export default function TribeSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <TribePresenceHeartbeat />
      </Suspense>
    </>
  );
}
