"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { api, type Condition, type Viewport } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { normalizeUrl } from "@/lib/url";

const ALL_VIEWPORTS: Viewport[] = ["desktop", "mobile"];

function uploadFiles(files: File[], onProgress: (fraction: number) => void) {
  return new Promise<{ upload_id: string }>((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { upload_id?: string; detail?: unknown } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.upload_id) {
        resolve({ upload_id: body.upload_id });
      } else {
        reject(
          new Error(
            typeof body.detail === "string" ? body.detail : "The upload failed",
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error("The audit service is not reachable"));
    xhr.send(form);
  });
}

export function NewAuditForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ids = useId();
  const urlInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<string>("url");
  const [url, setUrl] = useState("");
  const [viewports, setViewports] = useState<Viewport[]>(ALL_VIEWPORTS);
  const [condition, setCondition] = useState<Condition>("hybrid");
  const [budget, setBudget] = useState(15);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const hasError = formError !== null;

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (hasError) alertRef.current?.focus();
  }, [hasError]);

  const errorId = `${ids}-url-error`;

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

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (viewports.length === 0) {
      setFormError("Select at least one viewport");
      return;
    }
    setSubmitting(true);
    try {
      let source: { url: string } | { upload_id: string };
      if (tab === "url") {
        const result = normalizeUrl(url);
        if (!result.ok) {
          setFieldError(result.error);
          setSubmitting(false);
          urlInput.current?.focus();
          return;
        }
        setFieldError(null);
        source = { url: result.url };
      } else {
        if (files.length === 0) {
          setFormError("Choose at least one screenshot");
          setSubmitting(false);
          fileInput.current?.focus();
          return;
        }
        setProgress(0);
        source = await uploadFiles(files, setProgress);
      }
      const { data, error } = await api.POST("/runs", {
        body: { ...source, viewports, condition, max_focus_steps: budget },
      });
      if (error || !data) {
        const detail = (error as { detail?: unknown } | undefined)?.detail;
        throw new Error(
          typeof detail === "string"
            ? detail
            : "The audit could not be started",
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
      router.push(`/runs/${data.run_id}`);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "The audit could not be started",
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      data-ready={ready}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
      }}
      aria-label="New audit"
    >
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="url">URL</TabsTrigger>
          <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
        </TabsList>
        <TabsContent value="url" className="mt-4 space-y-2">
          <Label htmlFor={`${ids}-url`}>Web address</Label>
          <Input
            id={`${ids}-url`}
            ref={urlInput}
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="example.com"
            value={url}
            disabled={submitting}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
            onChange={(e) => {
              setUrl(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            onPaste={onPaste}
          />
          {fieldError ? (
            <p id={errorId} className="text-caption text-destructive">
              {fieldError}
            </p>
          ) : null}
        </TabsContent>
        <TabsContent value="screenshots" className="mt-4 space-y-3">
          <fieldset
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="rounded-lg border border-dashed p-4"
          >
            <Label htmlFor={`${ids}-files`}>Page screenshots</Label>
            <p className="mt-1 text-caption text-muted-foreground">
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
              className="mt-3 block min-h-8 w-full text-body file:mr-3 file:min-h-8 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:text-body"
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
                  <span className="font-mono text-label text-muted-foreground">
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
      </Tabs>

      <fieldset
        className="mt-4"
        disabled={submitting}
        aria-describedby={
          formError?.includes("viewport") ? `${ids}-form-error` : undefined
        }
      >
        <legend className="mb-2 text-body font-medium">Viewports</legend>
        <div className="flex gap-2">
          {ALL_VIEWPORTS.map((vp) => (
            <Toggle
              key={vp}
              variant="outline"
              pressed={viewports.includes(vp)}
              onPressedChange={(on) =>
                setViewports(
                  ALL_VIEWPORTS.filter((v) =>
                    v === vp ? on : viewports.includes(v),
                  ),
                )
              }
            >
              {vp === "desktop" ? "Desktop" : "Mobile"}
            </Toggle>
          ))}
        </div>
      </fieldset>

      <Collapsible className="mt-4">
        <CollapsibleTrigger className="group inline-flex min-h-8 items-center gap-1 text-body font-medium">
          <ChevronRight
            aria-hidden="true"
            className="size-4 transition-transform group-data-[panel-open]:rotate-90"
          />
          Advanced
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4">
          <fieldset disabled={submitting}>
            <legend className="mb-2 text-body font-medium">Condition</legend>
            <RadioGroup
              value={condition}
              onValueChange={(v) => setCondition(v as Condition)}
              aria-label="Condition"
            >
              <Label className="min-h-8 gap-2">
                <RadioGroupItem value="hybrid" />
                Hybrid (rule and pixel channels)
              </Label>
              <Label className="min-h-8 gap-2">
                <RadioGroupItem value="rule_only" />
                Rule-only (axe-core)
              </Label>
            </RadioGroup>
          </fieldset>
          <div>
            <Label htmlFor={`${ids}-budget`}>
              Focus budget: <span className="font-mono">{budget}</span> keyboard
              stops
            </Label>
            <input
              id={`${ids}-budget`}
              type="range"
              min={5}
              max={30}
              value={budget}
              disabled={submitting}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="mt-2 block min-h-8 w-full accent-primary"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {formError ? (
        <p
          ref={alertRef}
          id={`${ids}-form-error`}
          role="alert"
          tabIndex={-1}
          className="mt-4 text-body text-destructive outline-none"
        >
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="mt-6 aria-disabled:pointer-events-none aria-disabled:opacity-60"
        aria-disabled={submitting}
        aria-keyshortcuts="Control+Enter Meta+Enter"
      >
        {submitting ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        {submitting ? "Starting audit" : "Audit"}
        <Kbd aria-hidden="true">⌘⏎</Kbd>
      </Button>
    </form>
  );
}
