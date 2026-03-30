import "server-only";

import { headers } from "next/headers";

import { auth } from "./auth";

export type BetterAuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export type RequestAuthContext = {
  email: string | null;
  image: string | null;
  name: string | null;
  userId: string | null;
};

export async function getServerBetterAuthSession(): Promise<BetterAuthSession> {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function getRequestAuthContext(): Promise<RequestAuthContext> {
  const session = await getServerBetterAuthSession();

  if (!session) {
    return {
      email: null,
      image: null,
      name: null,
      userId: null,
    };
  }

  return {
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    name: session.user.name ?? null,
    userId: session.user.id,
  };
}
