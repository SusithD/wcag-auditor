Context: Marlowe Green Library (fictional community library) home page, teal theme.
Seeded defect: SC 1.4.3, the "Our story" second paragraph (16px normal weight) is #777777 on #ffffff = 4.48:1.
Location: `.story{color:#777777}` in the style block and `<p class="story">` in section#story.
Minimal fix: change the colour to #595959 or darker (at least 4.5:1 on white).
Risk: none known; axe (wcag2a/aa/21/22aa) reports only this one node, desktop and 390 px.
