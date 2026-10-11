"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { StatusShape } from "@/components/ds";

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
      <h1 ref={ref} tabIndex={-1} className="t-page text-ink outline-none">
        {children}
      </h1>
      {hint ? <p className="mt-1 text-body text-ink-2">{hint}</p> : null}
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
    <p
      id={id}
      role="alert"
      className="mt-4 flex items-start gap-2 text-body text-ink"
    >
      <StatusShape kind="critical" className="mt-1" />
      {message}
    </p>
  ) : null;
}
