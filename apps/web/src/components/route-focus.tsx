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
      heading.setAttribute("tabindex", "-1");
      heading.classList.add("outline-none");
      heading.focus({ preventScroll: true });
      if (document.activeElement !== heading) return false;
      done = true;
      return true;
    };

    if (focusHeading()) return;
    const observer = new MutationObserver(() => {
      if (focusHeading()) {
        observer.disconnect();
        window.clearInterval(retry);
      }
    });
    observer.observe(main, { childList: true, subtree: true });
    const retry = window.setInterval(() => {
      if (focusHeading()) {
        observer.disconnect();
        window.clearInterval(retry);
      }
    }, 50);
    const timer = window.setTimeout(() => {
      observer.disconnect();
      window.clearInterval(retry);
      if (!done) main.focus({ preventScroll: true });
    }, WAIT_MS);
    return () => {
      done = true;
      observer.disconnect();
      window.clearTimeout(timer);
      window.clearInterval(retry);
    };
  }, [pathname]);

  return null;
}
