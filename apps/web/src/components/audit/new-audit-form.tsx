"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Monitor, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { Condition, Viewport } from "@/api/client";
import { Kbd, Panel } from "@/components/ds";
import { OPTION_CARD } from "@/components/settings/option-card";
import { useSettings } from "@/components/settings/use-settings";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import { startAudit, uploadFiles } from "./audit-request";

const ALL_VIEWPORTS: Viewport[] = ["desktop", "mobile"];
const MIN_BUDGET = 5;
const MAX_BUDGET = 30;

const VIEWPORT_CARDS: Record<
  Viewport,
  { name: string; size: string; icon: ReactNode }
> = {
  desktop: {
    name: "Desktop",
    size: "1440 × 900 px",
    icon: <Monitor aria-hidden="true" className="size-4 text-ink-2" />,
  },
  mobile: {
    name: "Mobile",
    size: "390 × 844 px",
    icon: <Smartphone aria-hidden="true" className="size-4 text-ink-2" />,
  },
};

const METHODS: { value: Condition; name: string; text: string }[] = [
  {
    value: "hybrid",
    name: "Detector and rules",
    text: "Rules plus the element detector; some findings need review",
  },
  {
    value: "rule_only",
    name: "Rules only",
    text: "Browser rules only; fewer criteria can be decided",
  },
];

const GROUP = "min-w-0 border-0 border-b border-line p-6 max-[720px]:px-4";

const CARD_INPUT =
  "peer absolute inset-0 m-0 size-full cursor-pointer opacity-0";

function Marker({ kind }: { kind: "box" | "radio" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-px grid size-5 shrink-0 place-items-center border border-line-strong bg-surface text-on-accent peer-checked:border-accent-fill peer-checked:bg-accent-fill",
        kind === "box"
          ? "rounded-sm [&_svg]:opacity-0 peer-checked:[&_svg]:opacity-100"
          : "rounded-full after:size-2 after:rounded-full after:bg-on-accent after:opacity-0 after:content-[''] peer-checked:after:opacity-100",
      )}
    >
      {kind === "box" ? <Check className="size-3" /> : null}
    </span>
  );
}

export function NewAuditForm({
  initialTab = "url",
}: {
  initialTab?: "url" | "screenshots";
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ids = useId();
  const urlInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const budgetInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<string>(initialTab);
  const [url, setUrl] = useState("");
  const [settings] = useSettings();
  const [viewports, setViewports] = useState<Viewport[]>(ALL_VIEWPORTS);
  const [condition, setCondition] = useState<Condition>("hybrid");
  const touched = useRef(false);
  const submitLock = useRef(false);
  const [budgetText, setBudgetText] = useState("15");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const [notice, setNotice] = useState("");
  const hasError = formError !== null;
  const screenshots = tab === "screenshots";
  const effectiveCondition: Condition =
    screenshots && condition === "rule_only" ? "hybrid" : condition;

  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      if (e.defaultPrevented || e.isComposing) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"]'))
        return;
      e.preventDefault();
      void submitRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (touched.current) return;
    setViewports(ALL_VIEWPORTS.filter((v) => settings.viewports.includes(v)));
    setCondition(settings.method);
  }, [settings.viewports, settings.method]);
  useEffect(() => {
    if (hasError) alertRef.current?.focus();
  }, [hasError]);

  const errorId = `${ids}-url-error`;
  const budgetErrorId = `${ids}-budget-error`;

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text").trim();
    if (text && !text.includes("://") && !/\s/.test(text)) {
      event.preventDefault();
      setUrl(`https://${text}`);
      setFieldError(null);
    }
  }

  function addFiles(list: FileList | File[]) {
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles(images);
    setFormError(
      images.length === Array.from(list).length
        ? null
        : "Only image files can be audited",
    );
  }

  function onDrop(event: DragEvent<HTMLFieldSetElement>) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  function toggleViewport(vp: Viewport, on: boolean) {
    touched.current = true;
    setViewports(
      ALL_VIEWPORTS.filter((v) => (v === vp ? on : viewports.includes(v))),
    );
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting || submitLock.current) return;
    submitLock.current = true;
    const started = await attempt();
    if (!started) submitLock.current = false;
  }

  async function attempt(): Promise<boolean> {
    setFormError(null);
    if (viewports.length === 0) {
      setFormError("Select at least one viewport");
      return false;
    }
    const budget = Number(budgetText);
    if (
      budgetText.trim() === "" ||
      !Number.isInteger(budget) ||
      budget < MIN_BUDGET ||
      budget > MAX_BUDGET
    ) {
      setBudgetError(
        `Enter a whole number from ${MIN_BUDGET} to ${MAX_BUDGET}`,
      );
      setAdvancedOpen(true);
      requestAnimationFrame(() => budgetInput.current?.focus());
      return false;
    }
    setBudgetError(null);
    setSubmitting(true);
    try {
      let source: { url: string } | { upload_id: string };
      if (tab === "url") {
        const result = normalizeUrl(url);
        if (!result.ok) {
          setFieldError(result.error);
          setSubmitting(false);
          urlInput.current?.focus();
          return false;
        }
        setFieldError(null);
        source = { url: result.url };
      } else {
        if (files.length === 0) {
          setFormError("Choose at least one screenshot");
          setSubmitting(false);
          fileInput.current?.focus();
          return false;
        }
        setProgress(0);
        source = await uploadFiles(files, setProgress);
      }
      const runId = await startAudit(
        source,
        { viewports, condition: effectiveCondition, budget },
        queryClient,
      );
      router.push(`/runs/${runId}`);
      return true;
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "The audit could not be started. Try again.",
      );
      setSubmitting(false);
      return false;
    }
  }

  return (
    <form
      noValidate
      data-ready={ready}
      onSubmit={submit}
      aria-label="New audit"
    >
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = String(v);
          setTab(next);
          setNotice(
            next === "screenshots" && condition === "rule_only"
              ? "Method changed to Detector and rules. Rules only needs a web address, because screenshots have no page to read."
              : "",
          );
        }}
      >
        <TabsList aria-label="Audit source">
          <TabsTrigger value="url">Web address</TabsTrigger>
          <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
        </TabsList>
        <Panel as="div">
          <TabsContent value="url" className={cn(GROUP, "space-y-2")}>
            <Label htmlFor={`${ids}-url`}>Web address</Label>
            <Input
              id={`${ids}-url`}
              ref={urlInput}
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com"
              value={url}
              disabled={submitting}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${errorId}` : `${ids}-url-hint`}
              onChange={(e) => {
                setUrl(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              onPaste={onPaste}
            />
            {fieldError ? (
              <p id={errorId} className="text-label text-critical">
                {fieldError}
              </p>
            ) : (
              <p id={`${ids}-url-hint`} className="text-label text-ink-3">
                The page must be publicly reachable.
              </p>
            )}
          </TabsContent>
          <TabsContent value="screenshots" className={cn(GROUP, "space-y-3")}>
            <fieldset
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="min-w-0 rounded-md border border-dashed border-line-strong p-4"
            >
              <Label htmlFor={`${ids}-files`}>Page screenshots</Label>
              <p className="mt-1 text-label text-ink-3">
                One image per viewport (desktop wider than 600 px, mobile 600 px
                or less). You can also drop files here.
              </p>
              <input
                id={`${ids}-files`}
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                disabled={submitting}
                onChange={(e) => e.target.files && addFiles(e.target.files)}
                className="mt-3 block min-h-8 w-full text-body file:mr-3 file:min-h-8 file:rounded-md file:border file:border-line-control file:bg-surface file:px-2.5 file:text-body"
              />
            </fieldset>
            {files.length > 0 ? (
              <ul
                className="space-y-1 text-body"
                aria-label="Selected screenshots"
              >
                {files.map((f) => (
                  <li
                    key={`${f.name}-${f.size}-${f.lastModified}`}
                    className="flex justify-between gap-3"
                  >
                    <span className="truncate">{f.name}</span>
                    <span className="num text-label text-ink-3">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {submitting && tab === "screenshots" ? (
              <Progress
                value={Math.round(progress * 100)}
                aria-label="Upload progress"
              />
            ) : null}
          </TabsContent>

          <fieldset
            className="min-w-0 border-0 border-b border-line p-0"
            disabled={submitting}
            aria-describedby={
              formError?.includes("viewport") ? `${ids}-form-error` : undefined
            }
          >
            <legend className="px-6 pb-3 pt-6 text-body font-medium text-ink max-[720px]:px-4">
              Viewports
            </legend>
            <div className="grid grid-cols-2 gap-3 px-6 pb-6 max-[720px]:grid-cols-1 max-[720px]:px-4">
              {ALL_VIEWPORTS.map((vp) => (
                <label key={vp} className={OPTION_CARD}>
                  <input
                    type="checkbox"
                    name="viewport"
                    value={vp}
                    checked={viewports.includes(vp)}
                    disabled={submitting}
                    onChange={(e) => toggleViewport(vp, e.target.checked)}
                    className={CARD_INPUT}
                  />
                  <Marker kind="box" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-2 font-semibold">
                      {VIEWPORT_CARDS[vp].icon}
                      {VIEWPORT_CARDS[vp].name}
                    </span>
                    <span className="num text-dense text-ink-2">
                      {VIEWPORT_CARDS[vp].size}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset
            className="min-w-0 border-0 border-b border-line p-0"
            disabled={submitting}
          >
            <legend className="px-6 pb-3 pt-6 text-body font-medium text-ink max-[720px]:px-4">
              Method
            </legend>
            <div className="grid grid-cols-2 gap-3 px-6 pb-6 max-[720px]:grid-cols-1 max-[720px]:px-4">
              {METHODS.map((m) => {
                const unavailable = screenshots && m.value === "rule_only";
                return (
                  <label
                    key={m.value}
                    className={cn(OPTION_CARD, unavailable && "opacity-60")}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={m.value}
                      checked={effectiveCondition === m.value}
                      disabled={submitting || unavailable}
                      aria-describedby={
                        unavailable ? `${ids}-rules-hint` : undefined
                      }
                      onChange={() => {
                        touched.current = true;
                        setCondition(m.value);
                        setNotice("");
                      }}
                      className={CARD_INPUT}
                    />
                    <Marker kind="radio" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold">{m.name}</span>
                      <span className="text-dense text-ink-2">{m.text}</span>
                      {unavailable ? (
                        <span
                          id={`${ids}-rules-hint`}
                          className="text-dense text-ink-2"
                        >
                          Not available for screenshots: they have no page to
                          read. Use a web address.
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
            <output className="sr-only">{notice}</output>
            {notice ? (
              <p
                aria-hidden="true"
                className="px-6 pb-4 text-dense text-ink-2 max-[720px]:px-4"
              >
                {notice}
              </p>
            ) : null}
          </fieldset>

          <Collapsible
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            className="border-b border-line"
          >
            <CollapsibleTrigger className="group flex min-h-12 w-full items-center gap-2 px-6 text-left font-semibold hover:bg-subtle max-[720px]:px-4">
              Advanced
              <ChevronDown
                aria-hidden="true"
                className="size-3.5 text-ink-3 group-data-[panel-open]:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 px-6 pb-6 pt-2 max-[720px]:px-4">
              <fieldset disabled={submitting} className="min-w-0 space-y-1">
                <Label htmlFor={`${ids}-budget`}>Focus steps</Label>
                <Input
                  id={`${ids}-budget`}
                  ref={budgetInput}
                  type="number"
                  inputMode="numeric"
                  min={MIN_BUDGET}
                  max={MAX_BUDGET}
                  value={budgetText}
                  aria-invalid={budgetError ? true : undefined}
                  aria-describedby={
                    budgetError ? budgetErrorId : `${ids}-budget-hint`
                  }
                  onChange={(e) => {
                    setBudgetText(e.target.value);
                    if (budgetError) setBudgetError(null);
                  }}
                  className="num max-w-30"
                />
                {budgetError ? (
                  <p id={budgetErrorId} className="text-label text-critical">
                    {budgetError}
                  </p>
                ) : (
                  <p
                    id={`${ids}-budget-hint`}
                    className="text-label text-ink-3"
                  >
                    How many Tab presses to record, from {MIN_BUDGET} to{" "}
                    {MAX_BUDGET}
                  </p>
                )}
              </fieldset>
            </CollapsibleContent>
          </Collapsible>

          {formError ? (
            <p
              ref={alertRef}
              id={`${ids}-form-error`}
              role="alert"
              tabIndex={-1}
              className="mx-6 mt-4 text-body text-critical outline-none max-[720px]:mx-4"
            >
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4 p-6 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:px-4">
            <span className="text-dense text-ink-3">
              The audit runs in the background. You can leave the progress page.
            </span>
            <div className="flex justify-end gap-2">
              <Link
                href="/"
                className={buttonVariants({ variant: "default", size: "lg" })}
              >
                Cancel
              </Link>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
                aria-disabled={submitting}
                aria-keyshortcuts="Control+Enter Meta+Enter"
              >
                {submitting ? "Starting audit" : "Run audit"}
                <Kbd
                  aria-hidden="true"
                  className="border-on-accent/30 bg-transparent text-on-accent"
                >
                  ⌘↵
                </Kbd>
              </Button>
            </div>
          </div>
        </Panel>
      </Tabs>
    </form>
  );
}
