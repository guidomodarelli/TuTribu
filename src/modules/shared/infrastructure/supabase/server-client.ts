import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getServerSupabaseEnvironment } from "./server-environment";

export async function createServerSupabaseClient() {
  const { publishableKey, url } = getServerSupabaseEnvironment();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies directly. Proxy refresh covers this path.
        }
      },
    },
  });
}
