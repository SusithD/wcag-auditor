() => Array.from(document.querySelectorAll('[data-test-el]')).map(el => {
  const r = el.getBoundingClientRect();
  let covered = 0, total = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const x = r.left + (i + 0.5) * r.width / 5, y = r.top + (j + 0.5) * r.height / 5;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    total++;
    const t = document.elementFromPoint(x, y);
    if (!t || t === el || el.contains(t)) continue;
    let n = t, pinned = false;
    while (n && n.nodeType === 1) { const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') { pinned = true; break; } n = n.parentElement; }
    if (pinned) covered++;
  }
  const q = v => Math.round(v * 100) / 100;
  return { id: el.getAttribute('data-test-el'),
           rect: { x: q(r.left + scrollX), y: q(r.top + scrollY), w: q(r.width), h: q(r.height) },
           occluded_samples: covered, samples: total };
})
