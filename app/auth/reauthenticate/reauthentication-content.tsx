/** Resolves runtime query/session data inside the current page's Suspense boundary. */
import { loadReauthenticationPageState } from "@/src/modules/auth/infrastructure/composition/reauthentication-page";
import { ReauthenticationContainer } from "./reauthentication-container";

/**
 * Loads one safe initial snapshot without a client refetch or conventional sign-in redirect.
 * @param props - The framework's unresolved request query.
 * @returns A keyed route container so another intent cannot inherit the previous intent's state.
 */
export async function ReauthenticationContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = await loadReauthenticationPageState(await searchParams);
  return <ReauthenticationContainer key={state.kind === "ready" ? state.intent.intentId : state.code} initialState={state} />;
}
