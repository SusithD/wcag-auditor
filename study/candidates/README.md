# Candidate task pages (DRAFT)

Proposed candidate task pages for the developer study; NOT approved by the supervisor; NOT referenced by study/tasks.yaml; replaces the synthetic placeholder pages only after sign-off and after the ethics reference is recorded.

Each page is self-contained (one index.html, no external assets) with one seeded defect. NOTES.md in each folder gives the location, measured values and risks. Every page carries the same footer disclaimer: "Fictional example page for a research study. All names, events and services are invented."

## Tasks

| Task | SC | Context | Seeded defect | Expected fix |
|---|---|---|---|---|
| T1 | 1.4.3 | Marlowe Green Library (S1) | Low-contrast text block (.story) | Raise text colour to at least 4.5:1 |
| T2 | 2.4.7 | Wobblewheel Cycle Workshop, repair booking (S1) | "Book my repair" button has `outline:none` and no replacement | Delete the rule so the global 3 px focus outline applies |
| T3 | 2.4.11 | Kettle & Crumb recipes, fixed 72 px header (S1) | Focus script scrolls #time to the viewport top under the header | `scroll-padding-top` or `scroll-margin-top` of at least 72 px, or a non-fixed header (removing only the script is incomplete) |
| T4 | 2.5.7 | Fernlea Health Centre, appointment form (S1) | "Maximum travel distance" is a drag-only div slider (also fails 2.1.1) | Native `input type=range`, or +/- buttons or a number field |
| T5 | 2.5.8 | Thistlebank Clay Studio, class booking (S2) | Seat stepper buttons 20x20 px with a 2 px gap | 24x24 px buttons, or at least 4 px gap |
| T6 | 1.4.11 | Fernhill Ramblers, membership form (S2) | Form field borders #c8cfca on white (1.59:1) | Border at least 3:1, e.g. #767676 |
| T7 | 2.4.13 | Larkfield High School, timetable (S2) | Form controls have a 1 px #a3adbb focus outline (2.27:1); also fails 1.4.11 | 2 px or thicker solid outline at 3:1 or more on white and on the dark footer |
| T8 | 2.4.12 | The Saltmarsh Courier, letters form, fixed 56 px header (S2) | Focus script scrolls #ltext (message textarea) under the header, 18 percent covered | `scroll-padding-top` of at least 72 px (removing only the script is incomplete); deliberate AAA case, 2.4.11 passes |

## Capture instructions

```
python3 -m http.server <port> --directory study/candidates
uv run auditor capture http://localhost:<port>/T1/index.html --out <dir>
```

- Capture each page at 1280x800 (desktop) and 390x844 (mobile). Do not capture T3 or T8 at a larger viewport than 1280x800.
- The default focus-stop budget is 15; the target element must be within the first 15 stops (T2 button is stop 14; T3 #time is stop 11 desktop and 8 mobile; T8 #ltext is stop 12).
- Measured with the vendored axe (all WCAG tags, color-contrast-enhanced off): the only violations are T1 color-contrast and T5 target-size; T2, T3, T4, T6, T7 and T8 have none, so the rule-only report does not show them.

## Open questions for the supervisor

1. Brief wording: "The report lists one accessibility issue" is false for the rule-only report on 6 of 8 tasks. It needs rewording, and a decision on whether "no fix needed" is an allowed answer.
2. S1 pages share one layout while S2 pages are four different designs, and S2 has about 36 percent more text. Is this difference acceptable between sets?
3. Effort gap: T4 (build a widget) versus T6 (one-line colour change).
4. Session length (about 75 to 110 minutes) versus the approved protocol.
5. Should a no-defect control page be added?
6. Rubric amendments to approve:
   - T3 and T8: add "removing the focus script is not enough", and a numeric rule (field top edge at or below the header bottom at 1280x800 and 390x844).
   - T4: a keyboard-only fix is partial; native range or buttons are a pass.
   - T5: the spacing option needs at least 4 px for 20 px targets.
   - T7: the fix must hold 3:1 on both white and the dark footer.
   - T2: wording for partial credit.
7. Second rater and the kappa threshold.
8. Name collision check against real organisations (all names are invented but unchecked).
