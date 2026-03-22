const GOOGLE_CLIENT_ID_ENV = "GOOGLE_CLIENT_ID";
const GOOGLE_CLIENT_SECRET_ENV = "GOOGLE_CLIENT_SECRET";
const NEXT_AUTH_SECRET_ENV = "NEXTAUTH_SECRET";

const defaultGoogleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
];

export type GoogleOAuthServerConfig = {
  clientId: string;
  clientSecret: string;
  nextAuthSecret: string | undefined;
  scopeString: string;
};

export function getGoogleOAuthServerConfig(): GoogleOAuthServerConfig | null {
  const clientId = process.env[GOOGLE_CLIENT_ID_ENV];
  const clientSecret = process.env[GOOGLE_CLIENT_SECRET_ENV];

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    nextAuthSecret: process.env[NEXT_AUTH_SECRET_ENV],
    scopeString: defaultGoogleScopes.join(" "),
  };
}
