import { getAuth } from "./auth";
import { isAdminEmail } from "./policy";
import type { SessionUser } from "./user-context";

export async function getSessionUser(
  headers: Headers,
): Promise<SessionUser | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, email, name } = session.user;
  return { id, email, name, isAdmin: isAdminEmail(email) };
}

export async function requireAdmin(
  request: Request,
): Promise<SessionUser | Response> {
  const user = await getSessionUser(request.headers);
  if (!user)
    return Response.json({ detail: "Sign in required" }, { status: 401 });
  if (!user.isAdmin)
    return Response.json({ detail: "Admin access required" }, { status: 403 });
  return user;
}
