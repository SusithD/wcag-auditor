() => {
  const st = document.getElementById('__a11y_start');
  if (st && document.activeElement !== st) st.remove();
  const el = document.activeElement;
  if (st && el === st) return null;
  if (!el || el === document.body || el === document.documentElement) return null;
  const path = (n) => { const p = []; let d = 0;
    while (n && n.nodeType === 1 && d < 6) { let s = n.tagName.toLowerCase();
      if (n.id) { p.unshift(s + '#' + n.id); break; }
      if (typeof n.className === 'string' && n.className.trim()) s += '.' + n.className.trim().split(/\s+/)[0];
      p.unshift(s); n = n.parentElement; d++; } return p.join(' > '); };
  window.__a11yIds = window.__a11yIds || new WeakMap();
  if (!window.__a11yIds.has(el)) window.__a11yIds.set(el, (window.__a11yN = (window.__a11yN || 0) + 1));
  const r = el.getBoundingClientRect();
  return { uid: window.__a11yIds.get(el), tag: el.tagName.toLowerCase(), role: el.getAttribute('role'),
           name: (el.getAttribute('aria-label') || el.innerText || el.value || '').toString().trim().slice(0, 60),
           selector: path(el),
           rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
           scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
           png_scale: window.visualViewport ? Math.round(window.visualViewport.scale * 1000) / 1000 : 1 };
}
