import { removeUser } from "@/lib/auth/members";
import { requireAdmin } from "@/lib/auth/session";

const MESSAGES = {
  missing: ["No such user", 404],
  admin: ["Admins cannot be removed here", 409],
  self: ["You cannot remove your own account", 409],
} as const;

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const outcome = await removeUser(id, admin.id);
  if (outcome === "removed") return new Response(null, { status: 204 });
  const [detail, status] = MESSAGES[outcome];
  return Response.json({ detail }, { status });
}
