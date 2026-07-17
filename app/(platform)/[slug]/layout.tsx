import { TribePresenceHeartbeat } from "@/components/tribes/tribe-presence-heartbeat";

/**
 * Tribe segment layout: renders the tribe pages untouched and mounts the
 * presence heartbeat so any open tribe page keeps the viewer's membership
 * `last_seen_at` fresh for the about page online counter.
 */
export default async function TribeSegmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;

  return (
    <>
      {children}
      <TribePresenceHeartbeat tribeSlug={slug} />
    </>
  );
}
