"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";
import { parseState, type ReportState, serialiseState } from "@/lib/report";

export function useReportState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = useMemo(
    () => parseState(new URLSearchParams(params.toString())),
    [params],
  );
  const latest = useRef(state);
  const seen = useRef(params.toString());
  if (seen.current !== params.toString()) {
    seen.current = params.toString();
    latest.current = state;
  }

  const update = useCallback(
    (patch: Partial<ReportState>, mode: "replace" | "push" = "replace") => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      const query = serialiseState(next);
      const url = query ? `${pathname}?${query}` : pathname;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router],
  );

  return { state, update };
}
