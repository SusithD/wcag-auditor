"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Dark theme"
      aria-pressed={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <Moon
        className="size-4 dark:hidden"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <Sun
        className="hidden size-4 dark:block"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </Button>
  );
}
