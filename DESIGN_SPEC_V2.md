# Design specification v2: visual language and screen redesign

Status: proposed, 2026-10-11. Supersedes the visual parts of `DESIGN_SPEC.md` (v1 stays the source for behaviour: URL state, keyboard model, states, API use). Evidence: three research passes (accessibility-audit competitors, modern product UI and design systems, evidence-heavy and research-tool UX) summarised in section 12.

## 1. Diagnosis

v1 is disciplined but flat: pure zinc neutrals, no brand colour, a primary button that is near-black, 13 px root size, no summary layer above the data, a front door that is one input and a table. It reads as "fields and buttons" because nothing gives a screen a focal point, a hierarchy or a point of view. v1 banned every device that creates one (stat cards, gradients, illustrations). v2 keeps the ban on decoration for its own sake and adds structure, brand, tone and a story.

## 2. Principles

1. **Honest by design.** The product's difference is that it says what it did not decide: tiers (Automated / Needs review), coverage (Decided / Partly / Could not / Not on this page), uncertainty (intervals with plain verdicts). The UI makes honesty the most legible thing on screen. Never a single headline "score". "0 violations" always reads "0 found in the N criteria we could decide; M could not be checked."
2. **Evidence first.** Every claim sits next to the pixels, measured value or screenshot that supports it.
3. **Calm, dense, premium.** One accent colour, tint-based elevation, generous but not wasteful spacing, quiet motion.
4. **Exemplary accessibility.** An accessibility auditor's own UI must pass its own audit (AA everywhere, AAA focus appearance, 24 px targets measured in px, forced-colors and reduced-motion honoured). `@axe-core/playwright` zero violations is a CI gate on every route and state.
5. **No decoration that carries meaning, no meaning carried by decoration.** Gradients and illustrations are static, `aria-hidden`, and never behind small text.

## 3. Tokens (contrast verified, WCAG relative luminance)

Neutrals are a slightly cool ramp (hue about 270, very low chroma). Roles, not shades.

| Token | Light | Dark |
|---|---|---|
| `--bg` page | `#FAFAFB` | `#0B0B0E` |
| `--surface` card | `#FFFFFF` | `#16161B` |
| `--raised` popover, menu, sheet | `#FFFFFF` | `#1E1E25` |
| `--sunken` well, code, canvas | `#F1F1F4` | `#101014` |
| `--hover` | `#EEEEF2` | `#24242C` |
| `--border` (dividers only) | `#E4E4EA` | `#2A2A33` |
| `--border-strong` (controls: 3:1) | `#8A8A96` (3.41 on white, 3.27 on bg) | `#7B7B87` (4.31 on surface, 3.96 on raised) |
| `--text` | `#17171C` (17.1 on bg) | `#EDEDF0` (16.8 on bg) |
| `--text-muted` | `#5B5B66` (6.70 white, 5.95 sunken, 5.79 hover) | `#A0A0AB` (6.96 surface, 6.40 raised, 5.95 hover) |

Accent (one brand colour, used for primary action, links, selection and focus): light `#4338CA` (7.90 on white, 7.01 on sunken, text on it `#FFFFFF` 7.90), dark `#A5B4FC` (9.04 on surface, 8.31 on raised, text on it `#0B0B0E` 9.86). Tint fills: 8% (light) and 14% (dark) of the accent. Focus ring: 3 px in the accent plus 2 px offset in `--bg`; verified at least 3:1 against both adjacent colours.

Severity and status (colour + glyph + stroke, never colour alone). Text on `--sunken` (light) or `--raised` (dark):

| Level | Light | ratio | Dark | ratio | Glyph | Canvas stroke |
|---|---|---|---|---|---|---|
| Critical | `#B42318` | 5.83 | `#FDA29B` | 8.53 | ● | solid 2 px |
| Serious | `#9A5200` | 5.20 | `#FDB022` | 9.00 | ▲ | dashed 2 px |
| Minor | `#1D4ED8` | 5.94 | `#93C5FD` | 9.19 | ■ | dotted 2 px |
| Needs review | `#5B5B66` | 5.95 | `#A0A0AB` | 6.40 | ◇ | solid 1.5 px |
| Pass / decided | `#067647` | 5.05 | `#6CE9A6` | 10.92 | ✓ | n/a |

Chips: glyph + label, tint fill at 8% to 10%, 1 px border at 25%. The same chip is used in rail, table, detail, legend and overview so it is learned once. Re-run the contrast script (`apps/web/src/__tests__/tokens.test.ts` extends to the new tokens) whenever a surface or text value changes.

Type (Geist Sans, Geist Mono for data; both OFL and already bundled via the `geist` package; no CDN). Root font size 16 px (v1 used 13 px, which made `rem` and Tailwind spacing smaller than they look and caused the target-size failures found in the audit). All control sizes are specified in px.

| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Display (front door) | 44 / 48 | 600 | -0.03em |
| H1 | 28 / 36 | 600 | -0.02em |
| H2 | 20 / 28 | 600 | -0.01em |
| H3 | 16 / 24 | 600 | 0 |
| Body | 14 / 22 | 400 | 0 |
| Table row / dense | 13 / 20 | 400 | 0 |
| Caption | 12 / 16 | 400 | 0 |
| Eyebrow label (mono) | 11 / 14 | 500 | +0.06em, uppercase |

Numbers use `font-variant-numeric: tabular-nums` and Geist Mono for SC numbers, ratios, hex values and selectors.

Space 4 px base; page gutter 24 desktop / 16 mobile; section gap 32; card padding 16 to 20. Radius: controls and chips 6, cards 10, dialogs and sheets 14, pills 999. Elevation by tint (page `bg`, card `surface`, popover `raised`, well `sunken`), single 1 px borders; shadows only on floating layers: `0 8px 24px -6px rgb(16 16 24 / .16)` plus a 1 px border (dark: `rgb(0 0 0 / .5)`).

Controls: every interactive element at least 24 x 24 CSS px, specified in px (never `min-h-6`); default control height 36, compact 28, comfortable table row 40, compact row 32 (density toggle `data-density`, stored locally).

Motion: hover 120 ms, fade 200 ms, layout 240 ms, sheet 280 ms; ease-out `cubic-bezier(.2,.8,.2,1)`. Opt-in pattern: motion only under `prefers-reduced-motion: no-preference`; reduced motion keeps opacity-only fades. Never animate keyboard-initiated actions (J/K, arrows, shortcuts). No parallax, no animated gradients, no auto-playing loops. Skeletons mirror the final layout and reveal in order (chrome, rail, canvas, table; +40 ms steps); `aria-busy` on the region and one polite message.

## 4. Components (recipes)

- **Top bar** (56 px): logo mark + wordmark, primary nav (Audit, Runs, Evaluation, Study), search-style button showing `⌘K` (opens the command palette), theme toggle with state, density menu. Hairline bottom border; sticky; opaque.
- **Page header**: eyebrow (mono, uppercase), H1, one-line muted description, actions right. Content starts 32 px below.
- **Buttons**: primary (accent fill), secondary (surface + `border-strong`), ghost, destructive. 36 px default, 28 px compact, 48 px hero. Press scale 0.98 only without reduced motion.
- **Inputs**: visible label above (placeholders for examples only), `border-strong` outline, 3 px accent focus ring, inline error with icon + text (`aria-invalid`, `aria-describedby`, focus moves to the field, no toasts).
- **Toggles / segmented controls**: pressed state = accent tint fill + 2 px accent border + semibold; unpressed = 1 px `border-strong`; never a background-only change.
- **Chips**: severity, tier, provenance (rule ◐ / pixel ◑ / both ● / none ○ with text), verdict.
- **Summary strip** (replaces stat cards): one bordered 56 px strip divided by hairlines, a `<dl>`: verdict sentence, severity triplet with glyphs, coverage ("6 of 8 criteria decided"), tier mix bar with text counts, page / viewport / condition. Numerals 20 px tabular.
- **Tables**: sticky header, 1 px border, hover tint, selected row = 2 px accent bar + tint, numerics right-aligned tabular, truncation with tooltip (hover and focus) and full value in detail, the whole row is a labelled button.
- **Cards** (surface, border, radius 10) for evidence blocks, never for decoration.
- **Empty states**: original 2 px line illustration (inline SVG, `currentColor`, about 96 px, `aria-hidden`) + title + one sentence + one action. "No violations" states say what was checked and link to coverage.
- **Command palette** (⌘K): built from Base UI Dialog + Combobox (no `cmdk`); navigation, runs, jump to criterion, theme, density, export. Every action also has a visible control; single-key shortcuts (J/K/F) can be switched off in a shortcuts dialog (`?`), and appear as `Kbd` hints in tooltips.
- **Tooltips**: on hover and focus, Escape closes, content also reachable without hover.
- **Skip links, focus management and live regions** as implemented in the accessibility pass: one persistent polite status region per screen, focus to the page h1 on route change, focus return on dialog and menu close.

## 5. Screens

### 5.1 Front door `/`
Top bar, then a hero with a static accent wash and a faint 1 px grid mask (decorative, hidden in forced-colors):

```
 ML-ASSISTED WCAG 2.2 AUDIT                      (eyebrow)
 Find the accessibility failures
 that checklists miss.                           (display, max 720)
 Audit any page against eight WCAG 2.2 criteria, with evidence,
 measured values and a fix for every finding.     (16/26 muted)
 +--------------------------------------------------------------+
 | [URL] [Screenshots]                                          |  hero card: surface, border, radius 14, shadow
 | [ https://________________________ ] [ Audit  ⌘↵ ]           |  input 48 px, accent button
 | Viewports [Desktop ✓] [Mobile ✓]      Advanced >            |
 +--------------------------------------------------------------+
  Try: [example page] [sample report →]                           (first-run help)
 How it works:  1 Capture  2 Measure  3 Explain                   (three columns, line icons)
 What a report looks like: sample report image + three evidence bullets
 Built to be checked: criteria · measured F1 · open protocol · axe-clean   (numbers come from /eval only)
 Recent audits: dense table, 40 px rows
```
The trust strip uses only real numbers from the committed evaluation; no placeholder marketing figures. The sample-report image is an original capture of a project fixture (committed as webp/SVG under 200 KB) with real alt text.

### 5.2 Progress `/runs/[id]` (running)
Vertical timeline: completed steps show a check and elapsed time, the active step a moving bar (static under reduced motion), pending steps muted. The page screenshot materialises in the centre when captured; live counts "findings so far" as modules finish. One `role=status` region; cancel via a confirm dialog (existing). Failure: plain-language cause, collapsible technical details, "Start a new audit", retry (existing behaviour).

### 5.3 Report workspace `/runs/[id]`
Top bar, then page header (H1 = site host, meta line: viewport, condition, captured time) and the summary strip, then the three panes:

- **Left rail**: search, "All criteria", eight criteria rows (SC mono, name, severity triplet, provenance), Lighthouse-style buckets with counts and auto-expansion: Failed, Needs a human, Could not be decided, Not on this page. Selected row: tint + 2 px accent bar + `aria-pressed`.
- **Canvas**: screenshot on a `--sunken` dotted well, rounded inset frame; floating opaque toolbar bottom-centre (zoom, fit, 1:1, labels, minimap, page/focused/unfocused/diff) with opaque fill and forced-colors fallback; minimap only when zoomed; focus-order numbers on the screenshot for 2.4.x findings.
- **Detail pane** (order: verdict, key evidence, fix, raw data): header chip + SC link; verdict sentence in plain words ("Contrast is 3.1:1; this text needs 4.5:1"); tier chip with the stated reason (from `needs_review_reason`); measured / required with swatches; element crop or focus-pair before/after with "changed pixels n of N"; fix (HTML / CSS tabs, copy with confirmation message); raw evidence collapsed; Mark fixed / Ignore; Review action on needs-review findings with "reviewed, when" line (Siteimprove-style). Previous / Next steps through findings in reading order.
- **Table view**: as v1 with the chip language and density toggle.
- Under 1280 px the detail pane is a modal sheet; under 1024 px tabs (Criteria / Canvas / Detail) with a "Back to findings" action.

### 5.4 Coverage `/runs/[id]/coverage`
Heat grid 8 x 3 (rule / pixel / hybrid) with four states, each with glyph + word + count: **Decided** ("Checked and decided."), **Partly** ("Checked; some elements could not be decided."), **Could not** ("Could not be checked with this method. Not a pass."), **Not on this page** ("No such element."). Standing line: "An automated result is not a conformance claim." Catalogue text per criterion in an accordion. Grid is a real table.

### 5.5 Compare `/runs/[id]/compare`
The diff list is primary, canvases secondary: groups "Only hybrid found (n)", "Both found (n)", "Only rule-only found (n)", "Rule-only could not check (n criteria): it has no way to measure these." Each row has a text state label so grouping never depends on column or colour. Sync pan/zoom option; "show only differences".

### 5.6 Evaluation `/eval`
Reading guide in three lines at the top. Per metric one forest (dot-and-interval) plot per stratum: marker shape encodes condition (filled hybrid, hollow rule-only), direct value labels, n at right, "n/a" rendered as text, intervals at tiny n marked "interval not informative at this sample size". Rule-only recall of 0 renders as "cannot decide" with the tier glyph, never a zero bar. Difference plot (hybrid minus rule-only with CI around zero) with verdict words ("Hybrid is better; unlikely to be luck", "Too close to call"). McNemar as a paired-disagreement table plus verdict. Details tab: confusion counts (TP, FP, FN, Dup with tooltip), PR curve with the shipped operating point, reliability diagram (5 bins, bin counts as marginal histogram, whiskers on sparse bins). Chart / table toggle in every card header, stored in the URL; each chart has a short `role=img` label and the table as its long description.

### 5.7 Study `/study/*`
Calm and ethical: plain welcome, visible withdraw option at all times, no countdown (quiet elapsed text only: "No time limit. We record how long it takes so we can compare tools."), no streaks or scores, SUS items verbatim, "Skip to your fix" link, no researcher-only text shown to participants. Admin page keeps its table and token flow with the new components.

### 5.8 Errors and edges
Not found, run missing, service unreachable, partial capture failure (desktop shown, mobile retry), empty states, offline: plain wording, an action, a title and focus on the heading.

## 6. Responsive
1280+ three panes; 1024 to 1279 sheet; below 1024 tabs; front door one column at 640. Sticky bottom action bar on phones with 44 px targets. Reflow at 320 x 256 without two-dimensional scroll except the canvas and data tables.

## 7. Content and tone
Direct, plain, neutral. Tier definitions: Automated = "Measured by the tool; on our benchmark about X in 10 of these were right" (X computed from the evaluation at runtime, never hard-coded); Needs review = "The tool found something it cannot be sure about. A person should look" plus the specific reason. Avoid "low confidence". Errors say what happened, what is still available, and the next step.

## 8. Accessibility acceptance (every phase)
- `@axe-core/playwright` zero violations (all WCAG tags, 2.2 AA; `color-contrast-enhanced` off) on every route and state in light and dark, at 1440 and 390 px.
- Targets at least 24 px (measured in px), focus ring 3 px with at least 3:1, focus never obscured, reduced motion and forced colors verified, text spacing override has no clipped text, 200% text-only zoom works, no colour-only meaning.
- Focus management assertions (`toBeFocused`) for every dialog, menu, route change and skip link; no flaky focus tests (5 consecutive green runs).
- Unit tests for tokens (contrast), naming and ordering helpers.

## 9. Out of scope
Changing audit semantics, API, evaluation numbers or ethics-reviewed study wording. New heavy dependencies (`cmdk`, Storybook, Redux, ESLint) remain banned; fonts bundled; assets original or OFL/ISC/MIT.

## 10. Delivery plan
- **Phase 0 foundation** (one agent, blocks the rest): tokens in `globals.css` (light/dark), root 16 px, type scale, base components restyled (button, input, badge, card, tabs, toggle, table, dialog, sheet, popover, tooltip, skeleton), new primitives (SeverityChip, TierChip, ProvenanceChip, SummaryStrip, PageHeader, EmptyState, Kbd), shell (top bar, theme toggle, density), token tests.
- **Phase 1 screens in parallel** (one agent per file group): A front door, progress, errors; B report workspace; C coverage, compare, evaluation; D study.
- **Phase 2 polish**: motion and skeleton choreography, empty-state illustrations, command palette and shortcuts dialog, density toggle, sample-report asset, responsive and forced-colors QA, snapshot regeneration.
- **QA lenses after each phase**: visual critique with screenshots (hierarchy, spacing, consistency), accessibility proxy (axe, keyboard, focus), responsive (320 to 1920), performance (bundle, LCP), content (microcopy).
- Gate per phase: `make check` and the full Playwright suite green serially, committed on branch `ui-redesign`.

## 11. Decisions for the owner
1. Accent colour: indigo `#4338CA` / `#A5B4FC` proposed; any change needs the contrast table recomputed.
2. Dark mode default: follow the system (current), or default light.
3. Command palette and density toggle: include in Phase 2 (recommended) or defer.
4. Sample report on the front door: use a project fixture capture (recommended) or none.
5. Wordmark and logo mark: a simple original mark is proposed; supply one if you have it.

## 12. Evidence base (research summary)
Competitors (axe DevTools 3.0 needs-review state and sticky filter, Accessibility Insights failure anatomy and tab-order overlay, Siteimprove guided review with who/when, WAVE reference panel, Sa11y in-place tooltips, Lighthouse manual/not-applicable buckets and "does not guarantee" caveat, Chrome DevTools Issues affected-resources counts, Stark live-fix suggestions, Sentry issue-detail order); modern product UI (Geist and Radix role-based colour scales, Linear's few-input theme and contrast control, Stripe's accessible colour systems, Vercel/Linear/Resend page anatomy, shadcn blocks, Emil Kowalski on motion, web.dev reduced motion, W3C Focus Appearance); evidence UX (W3C complex-image two-part alternatives, Highcharts accessibility module, Snyk reachability "no path found is not safe", CodeQL precision-driven display, Evidently report components, scikit-learn reliability diagrams, error bars for evals, Prolific and Maze participant-experience guidance). Details and URLs are in the research reports kept with the session notes; unverified items are marked in them.
