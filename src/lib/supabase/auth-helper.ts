import { createClient } from "./server";

export async function getAuthenticatedUser(request: Request) {
  const supabase = await createClient();

  // Try cookie-based auth first (web)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return { user, supabase };

  // Try Bearer token auth (mobile)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const {
      data: { user: tokenUser },
    } = await supabase.auth.getUser(token);
    if (tokenUser) return { user: tokenUser, supabase };
  }

  return { user: null, supabase };
}
