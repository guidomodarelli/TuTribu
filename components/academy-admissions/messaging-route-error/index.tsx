"use client";

/** Owns the failure surface every messaging page embeds, with its own title and the Google sign-in way out. @module messaging-route-error */
import { AdmissionRouteError } from "@/components/academy-admissions/admission-route-error";
import { SignInWithGoogleButton } from "@/components/auth/sign-in-with-google-button";
import { MESSAGING_ROUTE_ERROR_COPY } from "@/src/modules/messaging/constants/messaging-route-error";
import type { MessagingRouteRecovery } from "@/lib/messaging/messaging-route-recovery";

/**
 * @param props - Safe Spanish feedback and the exits `resolveMessagingRouteRecovery` chose: `googleSignInCallbackUrl` starts Google
 * sign-in back to that internal path as the primary action, and `retry` stays next to it as a secondary one when it can still help.
 * @returns The embedded failure of a messaging page, titled as messaging instead of as the applicant's admission.
 */
export function MessagingRouteError({ message, retry, googleSignInCallbackUrl, initialViewHref }: MessagingRouteRecovery & { message?: string }) {
  const signIn = googleSignInCallbackUrl ? <SignInWithGoogleButton callbackUrl={googleSignInCallbackUrl} label={MESSAGING_ROUTE_ERROR_COPY.reauthenticate} fullWidth={false} /> : undefined;
  return <AdmissionRouteError embedded title={MESSAGING_ROUTE_ERROR_COPY.title} message={message} retry={retry} initialViewHref={initialViewHref} action={signIn} />;
}
