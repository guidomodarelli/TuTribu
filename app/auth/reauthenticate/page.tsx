/** Provides an independent global confirmation page for a member whose session already exists. */
import { Suspense } from "react";
import Loading from "./loading";
import { ReauthenticationContent } from "./reauthentication-content";

/** Keeps request-time query/session work below this segment's deterministic loading shell. */
export default function ReauthenticationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<Loading />}><ReauthenticationContent searchParams={searchParams} /></Suspense>;
}
