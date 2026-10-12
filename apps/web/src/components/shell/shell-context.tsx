"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Crumb } from "@/lib/shell";

type ShellState = {
  crumbs: Crumb[] | null;
  setCrumbs: (crumbs: Crumb[] | null) => void;
  wide: boolean;
  setWide: (wide: boolean) => void;
  actionsEl: HTMLElement | null;
  setActionsEl: (el: HTMLElement | null) => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const [wide, setWide] = useState(false);
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ crumbs, setCrumbs, wide, setWide, actionsEl, setActionsEl }),
    [crumbs, wide, actionsEl],
  );
  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell(): ShellState {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside ShellProvider");
  return value;
}

export function PageCrumbs({ items }: { items: Crumb[] }) {
  const { setCrumbs } = useShell();
  const key = JSON.stringify(items);
  useEffect(() => {
    setCrumbs(JSON.parse(key) as Crumb[]);
    return () => setCrumbs(null);
  }, [key, setCrumbs]);
  return null;
}

export function WideContent() {
  const { setWide } = useShell();
  useEffect(() => {
    setWide(true);
    return () => setWide(false);
  }, [setWide]);
  return null;
}

export function TopBarActions({ children }: { children: ReactNode }) {
  const { actionsEl } = useShell();
  return actionsEl ? createPortal(children, actionsEl) : null;
}
