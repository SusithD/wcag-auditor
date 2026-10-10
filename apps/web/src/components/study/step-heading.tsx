"use client";

import { type ReactNode, useEffect, useRef } from "react";

export function StepHeading({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <header className="mb-6">
      <h1
        ref={ref}
        tabIndex={-1}
        className="text-h1 font-semibold tracking-tight outline-none"
      >
        {children}
      </h1>
      {hint ? (
        <p className="mt-1 text-body text-muted-foreground">{hint}</p>
      ) : null}
    </header>
  );
}

export function FormError({
  message,
  id,
}: {
  message: string | null;
  id?: string;
}) {
  return message ? (
    <p id={id} role="alert" className="mt-4 text-body text-destructive">
      {message}
    </p>
  ) : null;
}
