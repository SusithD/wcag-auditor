import { listMembers } from "@/lib/auth/members";
import { requireAdmin } from "@/lib/auth/session";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  return Response.json(await listMembers(), {
    headers: { "Cache-Control": "no-store" },
  });
}
