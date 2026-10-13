/** Keeps the segment's loading state deterministic without any browser or identity lookup. */
import { ReauthenticationStatus } from "@/components/auth/reauthentication-status";

/** Renders the same safe loading shell for page load and sibling-route navigation. */
export default function Loading() { return <ReauthenticationStatus state={{ kind: "loading" }} />; }
