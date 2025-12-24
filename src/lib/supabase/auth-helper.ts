import { createClient as createServerClient } from "./server";
import { createClient } from "@supabase/supabase-js";

export async function getAuthenticatedUser(request: Request) {
  const supabase = await createServerClient();

  // Try cookie-based auth first (web)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return { user, supabase };

  // Try Bearer token auth (mobile)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Use standard Supabase client for JWT token validation
    const supabaseWithToken = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user: tokenUser },
    } = await supabaseWithToken.auth.getUser();
    if (tokenUser) return { user: tokenUser, supabase: supabaseWithToken };
  }

  return { user: null, supabase };
}
