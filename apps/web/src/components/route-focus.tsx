"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const WAIT_MS = 4000;

export function RouteFocus() {
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const main = document.getElementById("main");
    if (!main) return;

    let done = false;
    const focusHeading = () => {
      const heading = main.querySelector<HTMLElement>("h1");
      if (!heading || done) return false;
      done = true;
      heading.setAttribute("tabindex", "-1");
      heading.classList.add("outline-none");
      heading.focus({ preventScroll: true });
      return true;
    };

    if (focusHeading()) return;
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      if (!done) main.focus({ preventScroll: true });
    }, WAIT_MS);
    return () => {
      done = true;
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
