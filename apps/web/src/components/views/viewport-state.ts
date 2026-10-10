"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Viewport } from "@/lib/report";

export function useViewportParam(available: Viewport[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get("vp");
  const viewport = (
    asked && available.includes(asked as Viewport) ? asked : available[0]
  ) as Viewport | undefined;
  const setViewport = (vp: Viewport) =>
    router.replace(`${pathname}?vp=${vp}`, { scroll: false });
  return { viewport, setViewport };
}
