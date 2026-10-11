"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Density = "comfortable" | "compact";
export type DefaultMethod = "hybrid" | "rule_only";
export type DefaultViewport = "desktop" | "mobile";

export type AppSettings = {
  density: Density;
  shortcuts: boolean;
  viewports: DefaultViewport[];
  method: DefaultMethod;
};

export const SETTINGS_KEY = "wcag-auditor.settings";

export const DEFAULT_SETTINGS: AppSettings = {
  density: "comfortable",
  shortcuts: true,
  viewports: ["desktop", "mobile"],
  method: "hybrid",
};

const EVENT = "wcag-auditor:settings";

export function parseSettings(raw: string | null): AppSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<AppSettings>;
    const viewports = Array.isArray(value.viewports)
      ? value.viewports.filter(
          (v): v is DefaultViewport => v === "desktop" || v === "mobile",
        )
      : DEFAULT_SETTINGS.viewports;
    return {
      density: value.density === "compact" ? "compact" : "comfortable",
      shortcuts: value.shortcuts !== false,
      viewports: viewports.length > 0 ? viewports : DEFAULT_SETTINGS.viewports,
      method: value.method === "rule_only" ? "rule_only" : "hybrid",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let memory: AppSettings | null = null;
let cachedRaw: string | null | undefined;
let cachedValue: AppSettings = DEFAULT_SETTINGS;

function snapshot(): AppSettings {
  if (memory) return memory;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parseSettings(raw);
  }
  return cachedValue;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function serverSnapshot() {
  return DEFAULT_SETTINGS;
}

export function useSettings(): [
  AppSettings,
  (patch: Partial<AppSettings>) => void,
] {
  const settings = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const update = useCallback((patch: Partial<AppSettings>) => {
    const next = { ...snapshot(), ...patch };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      memory = null;
    } catch {
      memory = next;
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [settings, update];
}
