export type Member = {
  id: string;
  name: string;
  email: string;
  provider: string;
  lastSignIn: string | null;
  isAdmin: boolean;
};

export type Invitation = {
  email: string;
  invitedBy: string;
  createdAt: string;
};

export const MEMBERS_KEY = ["admin", "members"] as const;

async function failure(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    detail?: string;
  } | null;
  return new Error(body?.detail ?? `Request failed (${response.status})`);
}

export async function fetchMembers(): Promise<{
  users: Member[];
  invitations: Invitation[];
}> {
  const response = await fetch("/api/admin/members");
  if (!response.ok) throw await failure(response);
  return response.json();
}

export async function sendInvite(email: string): Promise<string> {
  const response = await fetch("/api/admin/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as { email: string }).email;
}

export async function revokeInvite(email: string): Promise<string> {
  const response = await fetch(
    `/api/admin/invitations?email=${encodeURIComponent(email)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw await failure(response);
  return email;
}

export async function removeUserRequest(id: string): Promise<string> {
  const response = await fetch(
    `/api/admin/users?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw await failure(response);
  return id;
}
