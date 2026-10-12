"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";
import { useSessionUser } from "@/lib/auth/user-context";
import { cn } from "@/lib/utils";

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source;
  return letters.slice(0, 2).toUpperCase();
}

export function UserMenu({ side }: { side: boolean }) {
  const user = useSessionUser();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    window.location.assign("/login");
  }

  return (
    <div
      className={cn(
        "flex-none border-t border-line p-2",
        side && "max-[1100px]:px-1",
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="user-menu"
          aria-label={`Account menu for ${user.name || user.email}`}
          className={cn(
            "flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-1.5 text-left transition-colors duration-hover hover:bg-subtle aria-expanded:bg-subtle",
            side && "max-[1100px]:justify-center max-[1100px]:px-0",
          )}
        >
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-subtle text-[0.6875rem] font-semibold text-ink-2"
          >
            {initials(user.name, user.email)}
          </span>
          <span className={cn("min-w-0 flex-1", side && "max-[1100px]:hidden")}>
            <span className="block truncate font-medium text-ink">
              {user.name || user.email}
            </span>
            <span className="block truncate text-xs text-ink-3">
              {user.email}
            </span>
          </span>
          <ChevronsUpDown
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-ink-3",
              side && "max-[1100px]:hidden",
            )}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-48">
          <DropdownMenuItem disabled={busy} onClick={signOut}>
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
