Context: Fernlea Health Centre (fictional clinic demo), indigo theme, appointment request form.
Seeded defect: SC 2.5.7, "Maximum travel distance" is a div role=slider changed only by dragging the thumb (pointer events); no input/button/link in its widget container.
Location: `.range-card` block in section#appointment (`#thumb` role=slider) and the pointer-event script at the end of the file.
Minimal fix: replace with `<input type=range>`, or add +/- buttons or a number field bound to the value.
Risk: per the rubric the slider has no keyboard support and is not focusable, so SC 2.1.1 is also violated by construction; thumb is 30px (2.5.8 ok); extract.js reports alternatives=[] for it.
Revision 2 (after review): the date field is now a text input with a placeholder. The slider is kept as designed (a div, not focusable), so it also fails 2.1.1 by construction; a native input type=range fixes both 2.5.7 and 2.1.1. A keyboard-only fix (focusable slider with arrow keys) is a partial fix for 2.5.7 only if a single-pointer alternative to dragging is still missing; native range or +/- buttons pass.
