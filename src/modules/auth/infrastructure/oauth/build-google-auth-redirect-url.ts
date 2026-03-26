export function buildGoogleAuthRedirectUrl(
  callbackUrl: string,
  origin: string
): string {
  const redirectUrl = new URL("/auth/callback", origin);
  redirectUrl.searchParams.set("next", callbackUrl);
  return redirectUrl.toString();
}
