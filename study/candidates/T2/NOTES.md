Context: Wobblewheel Cycle Workshop (fictional bike repair shop), green theme.
Seeded defect: SC 2.4.7, the "Book my repair" submit button has its focus outline removed with no replacement style.
Location: `form button.cta:focus,form button.cta:focus-visible{outline:none}` in the style block; button has class `btn cta`.
Minimal fix: delete that rule so the global `:focus-visible` 3px outline applies (or give the button a visible outline/ring).
Risk: all other focus stops (verified by tabbing, incl. date input via `:focus-within`) have a 3px outline; the button has no hover/focus colour change.
Revision 2 (after review): 'Book my repair' is focus stop 14 of the first 15 on desktop (1280x800) and mobile (390x844): the FAQ section now follows the booking form and the date field is a text input with placeholder so the date picker does not capture the keyboard. Prices use pound signs. Footer disclaimer added (all pages). Partial credit: restoring any visible outline that is not 3:1 or is under 2 px is a partial fix.
