import { createServerSupabaseClient } from "@/src/modules/shared/infrastructure/supabase/server-client";

const AUTH_SIGN_OUT_ERROR_MESSAGE = "No pudimos cerrar la sesion.";
const HTTP_CONTENT_TYPE = "application/json";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return new Response(
      JSON.stringify({
        message: AUTH_SIGN_OUT_ERROR_MESSAGE,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": HTTP_CONTENT_TYPE,
        },
      }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": HTTP_CONTENT_TYPE,
      },
    }
  );
}
