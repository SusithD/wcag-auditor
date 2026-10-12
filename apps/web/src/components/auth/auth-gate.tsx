import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isPublicPath, PATHNAME_HEADER } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/session";
import { UserProvider } from "@/lib/auth/user-context";

export async function AuthGate({ children }: { children: ReactNode }) {
  const incoming = await headers();
  const pathname = incoming.get(PATHNAME_HEADER) ?? "/";
  if (isPublicPath(pathname)) {
    return <UserProvider user={null}>{children}</UserProvider>;
  }
  const user = await getSessionUser(incoming);
  if (!user) redirect(`/login?next=${encodeURIComponent(pathname)}`);
  return <UserProvider user={user}>{children}</UserProvider>;
}
