import { addInvitation, revokeInvitation } from "@/lib/auth/members";
import { isValidEmail, normaliseEmail } from "@/lib/auth/policy";
import { requireAdmin } from "@/lib/auth/session";

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
  const outcome = await addInvitation(normaliseEmail(email), admin.email);
  if (outcome === "exists")
    return Response.json(
      { detail: "That email is already invited" },
      { status: 409 },
    );
  return Response.json({ email: normaliseEmail(email) }, { status: 201 });
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
