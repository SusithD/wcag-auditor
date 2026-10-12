import { addInvitation, revokeInvitation } from "@/lib/auth/members";
import { isValidEmail, normaliseEmail } from "@/lib/auth/policy";
import { requireAdmin } from "@/lib/auth/session";
import { inviteLink } from "../../../../../scripts/invite-store.mjs";

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  if (!isValidEmail(email))
    return Response.json(
      { detail: "Enter a valid email address" },
      { status: 400 },
    );
  const address = normaliseEmail(email);
  const { token, expiresAt } = await addInvitation(address, admin.email);
  const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  return Response.json(
    { email: address, link: inviteLink(base, token), expiresAt },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const email = new URL(request.url).searchParams.get("email") ?? "";
  const removed = await revokeInvitation(email);
  if (!removed)
    return Response.json({ detail: "No such invitation" }, { status: 404 });
  return new Response(null, { status: 204 });
}
