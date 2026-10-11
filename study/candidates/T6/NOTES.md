Context: Fernhill Ramblers, fictional volunteer walking club with a membership sign-up form (forest green, rounded cards).
Seeded defect (SC 1.4.11): the five sign-up form fields have a 1 px border #c8cfca on a white form, about 1.6:1 (needs 3:1); the fill is white so it gives no boundary either.
Location: CSS rule `input[type=text],input[type=email],input[type=tel],select,textarea` (border colour), form under #join.
Minimal fix: change the border colour to a 3:1 value such as #767676 (4.5:1) or #8a938d (about 3.2:1).
Risk: no other inputs on the page; labels, placeholder-free fields and text stay above 4.5:1. Button has a visible label so it is exempt.
Revision 2 (after review): the .skip link is high contrast (white, #10331f text, 2 px border). Measured: input border #c8cfca on white is 1.59:1 (needs 3:1); axe reports no violation (non-text contrast is not covered), so the rule-only report cannot flag it.
