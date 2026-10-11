"use client";

import { useSyncExternalStore } from "react";

const KEY = "wcag-auditor.settings";

function read(): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return true;
    return (JSON.parse(raw) as { shortcuts?: boolean }).shortcuts !== false;
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("wcag-auditor:settings", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("wcag-auditor:settings", onChange);
  };
}

export function useShortcutsEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}
