# Design specification (UI/UX), v1

Quality bar: Linear, Vercel, Raycast. Calm, dense, monochrome chrome; the screenshot is the only saturated thing besides severity marks and the focus accent. Built with shadcn/ui on Base UI, Tailwind v4, Geist. The app must pass its own eight checks, including the AAA ones (2.4.12, 2.4.13).

## 1. Tokens

**Neutrals (Tailwind zinc).** bg `zinc-50 / zinc-950`; surface `white / zinc-900`; muted `zinc-100 / zinc-800`; border `zinc-200 / zinc-800`; text `zinc-900 / zinc-50`; text-muted `zinc-500 / zinc-400`. Primary action = `zinc-900` on light, `zinc-50` on dark (no coloured primary button).

**Accent (focus and selection only).** `blue-600` light, `blue-400` dark.

**Severity.** Encoded by colour **and** glyph **and** stroke style; never colour alone.

| Level | Light fg | Dark fg | Ratio on surface (light) | Glyph | Box stroke |
|---|---|---|---|---|---|
| Critical | `#B91C1C` red-700 | `#FCA5A5` | 6.5:1 | ● | solid 2px |
| Serious | `#B45309` amber-700 | `#FCD34D` | 5.3:1 | ▲ | dashed 2px |
| Minor | `#1D4ED8` blue-700 | `#93C5FD` | 7.7:1 | ■ | dotted 2px |
| Needs review | `#52525B` zinc-600 | `#A1A1AA` | 7.3:1 | ◇ | solid 1.5px |

Tints: fill `/8`, hover `/16`. Box strokes on screenshots sit on a 4 px white (light) or black (dark) halo so they reach 3:1 against any background. `forced-colors`: strokes use `Highlight`/`CanvasText`.

**Focus ring.** `focus-visible:ring-[3px] ring-offset-2` with ring colour pinned per theme (blue-600 / blue-400), verified ≥ 3:1 against both surfaces. Never `outline-none` without a ring.

**Type (Geist Sans / Geist Mono).** 11/14 mono labels · 12/16 caption · 13/20 body (default) · 14/20 table row · 16/24 h3 · 20/28 h2 · 24/32 h1. Letter-spacing −0.01em above 16.

**Spacing** 4-px scale; gutters 12 (rail), 16 (pane), 24 (page). **Radius** 6 controls, 8 cards, 10 sheets, full pills. **Elevation** borders only; popovers/dialogs get `shadow-md` + 1 px border. **Motion** 120 ms hover, 200 ms fade, 240 ms layout, 320 ms sheet, `cubic-bezier(.2,.8,.2,1)`; `prefers-reduced-motion` → instant.

**Targets** every interactive element ≥ 24 × 24 CSS px, table row actions included.

## 2. Screens

### `/` New Audit (front door)
Single column, max-w 640, centred, top offset 20vh.
- `Tabs`: **URL** | **Screenshots**.
- URL tab: `Input` (auto-prefix `https://` on paste, favicon on blur), `ToggleGroup` Desktop / Mobile (multi, both on by default), `Collapsible` **Advanced** → `RadioGroup` condition (Hybrid default / Rule-only), `Slider` focus budget (native range, 5–30), `Button` primary **Audit** with `Kbd` ⌘⏎.
- Screenshots tab: dashed `Card` dropzone with a real `<input type="file">` button; optional focus-pair upload; per-file `Progress`.
- Below: **Recent runs** dense `Table` (36 px rows): URL (middle-truncated), viewports, condition `Badge`, severity triplet `3 · 7 · 2` with coloured dots, age, status.
- States: idle; invalid URL → inline field error (`aria-invalid`, `aria-describedby`, focus moves to the field); submitting → button spinner, inputs disabled; queued → navigate immediately to `/runs/[id]`.

### `/runs/[id]` Run progress → Report (same route)
**Progress.** Left rail: vertical stepper (queued → capture desktop → capture mobile → rules → elements → modules ×8 → fusion → report), `aria-current="step"`, one `role="status" aria-live="polite"` region announcing stage changes only. Centre: `Skeleton` canvas (`aria-busy`); the screenshot cross-fades in (200 ms) when capture finishes; boxes appear per module (staggered 30 ms). Right: "Findings so far" count. Cancel = ghost `Button` + `AlertDialog`. On `done`, the rail morphs into the criteria rail (240 ms layout) and focus moves to the report heading.

**Report layout.** `grid-cols-[280px_1fr_380px]` at ≥ 1440; side panes `ResizablePanel` (min 240 / 320); right pane becomes a `Sheet` under 1280; under 1024 the three panes are `Tabs` (Criteria / Canvas / Detail). Landmarks: `nav` (rail), `main` (canvas), `aside` (detail); skip link to canvas and to table. No sticky element may cover a focused row (`scroll-padding` set).

Top bar (48 px): breadcrumb URL, `ToggleGroup` viewport, `ToggleGroup` Canvas | Table, `DropdownMenu` Export (JSON / HTML / PDF / CSV, with page count and size), condition `Badge`, theme toggle.

**Left rail.** Search `Input`; "Summary" header (total, per-channel verdict counts); 8 SC rows: SC number (mono), name, severity triplet, provenance glyph (◐ rule, ◑ pixel, ● both, ○ no verdict) with a legend `Tooltip`. Active row: `bg-muted` + 2 px left accent bar, `aria-current="page"`. ↑↓ move, Enter focuses the canvas.

**Canvas.** `<img alt="Full-page screenshot of {url}, {viewport}, {n} findings; use the findings table for details">` + SVG overlay inside `react-zoom-pan-pinch`. Each finding is `<g role="button" tabindex>` with `aria-label="{sc} {name}, {severity}, measured {value}, {element}"`; roving tabindex in reading order; Enter selects, Esc clears; Tab cycles stacked boxes (smaller on top). Hover or focus → fill 16 % + label pill (SC, short title), tooltip dismissible with Esc. Selected → 2 px stroke, others dim to 40 %, auto-pan to fit with 48 px margin (240 ms). Floating bottom toolbar: zoom − / + / fit / 100 % `Button`s, `Kbd` hints (`+ − 0`, arrows pan), labels on/off, minimap toggle, **focus-pair** `ToggleGroup` Focused / Unfocused / Diff (`Kbd` F) — never a drag slider. Right-click `ContextMenu`: copy selector, copy evidence.

**Right pane** (`ScrollArea`). Header: severity glyph + label, SC chip (links to the W3C Understanding page), provenance chip, tier chip, score as text `0.91` with a 4-segment bar. **Evidence** `Card`: measured vs required with sampled swatches (16 px squares with hex), delta in mono, 2× crop of the element (focus pairs show before/after). **Fix** `Tabs` HTML / CSS in `pre` Geist Mono with copy button; content from `guidance.yaml` (per SC: what failed, nearest passing value where computable, snippet, technique link). Footer: `ButtonGroup` Mark fixed / Ignore (persisted), ← → previous/next (`J` / `K`).

**Table view.** Real `<table>` (TanStack, virtualised with `aria-rowcount`/`aria-rowindex`, `aria-sort`), 36 px rows: SC · severity · element · measured · required · provenance · tier · score; `Popover` facet filters; grouped by SC with sticky group headers; row click selects on canvas and opens detail. Filter and selection state live in the URL (`?vp=&sc=&sev=&prov=&f=`).

**States.** 0 findings: canvas with a single green outline pulse (respecting reduced motion), copy "No violations found in the 8 in-scope criteria. The coverage view shows what was checked." Partial: `Alert` "Mobile capture failed" with Retry. Error: full-pane empty state with cause and a `Collapsible` log.

### `/runs/[id]/coverage`
8 × 3 grid (rule / pixel / hybrid), cells show tier glyph and count; legend; catalogue text per SC from `/catalogue`; "SCs with a reliable verdict: n / 8" per configuration.

### `/runs/[id]/compare`
Two report canvases side by side (hybrid left, rule-only right), synchronised pan/zoom and selection; a diff list of findings present in one only.

### `/eval`
Run button (disabled while running, progress via SSE); per-SC P/R/F1 bars with CI whiskers (shadcn chart, `role="img"` summary, "View as table" toggle); strata `Tabs` Real / Synthetic / Combined; McNemar and ΔPrecision table; export CSV / LaTeX.

### `/study/...` (M9)
Participant code entry, consent check, task list in counterbalanced order, task page with the report embedded and a "Submit fix" form, SUS form (10 items, native radios), thank-you. Timing is logged server-side (open → submit).

## 3. Premium details (include)
1. URL state for every filter and selection.
2. Element crop at 2× with before/after focus pair in the detail pane.
3. Keyboard model J/K/F/+/−/0 with `Kbd` hints in tooltips.
4. Severity triplets `3 · 7 · 2` with dots, never pie charts.
5. Export menu shows page count and size before download.

## 4. Anti-patterns (forbid)
1. Stat cards with big numbers and gradient icons.
2. Pie/donut charts; progress rings for confidence.
3. Toasts for validation errors.
4. Spinners for anything over 300 ms (use skeletons).
5. More than one saturated colour in chrome; colour as the only severity signal; drag-only controls.

## 5. Accessibility gate (CI)
`@axe-core/playwright` with the WCAG 2.2 AA+AAA tags on every route: zero violations. Plus, once before M7b is closed: a VoiceOver + Safari and an NVDA + Chrome pass of the report screen, recorded in `NOTES.md`.
