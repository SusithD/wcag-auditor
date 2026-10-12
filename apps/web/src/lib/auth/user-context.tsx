"use client";

import { createContext, type ReactNode, useContext } from "react";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

const UserContext = createContext<SessionUser | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: SessionUser | null;
  children: ReactNode;
}) {
  return <UserContext value={user}>{children}</UserContext>;
}

export function useSessionUser(): SessionUser | null {
  return useContext(UserContext);
}
