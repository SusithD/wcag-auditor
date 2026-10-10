() => {
  const sx = window.scrollX, sy = window.scrollY;
  const r1 = (n) => Math.round(n * 10) / 10;
  const box = (r) => ({ x: r1(r.left + sx), y: r1(r.top + sy), w: r1(r.width), h: r1(r.height) });
  const path = (n) => {
    const p = []; let d = 0;
    while (n && n.nodeType === 1 && d < 6) {
      let s = n.tagName.toLowerCase();
      if (n.id) { p.unshift(s + '#' + n.id); break; }
      if (typeof n.className === 'string' && n.className.trim()) s += '.' + n.className.trim().split(/\s+/)[0];
      p.unshift(s); n = n.parentElement; d++;
    }
    return p.join(' > ');
  };
  const alpha = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return c === 'transparent' ? 0 : 1;
    const parts = m[1].split(/[ ,/]+/).filter(Boolean);
    if (parts.length < 4) return 1;
    return parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  };
  const visible = (el, cs, r) =>
    cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  const style = (cs) => ({
    color: cs.color,
    background_color: cs.backgroundColor,
    font_size_px: parseFloat(cs.fontSize),
    font_weight: parseInt(cs.fontWeight, 10) || 400,
    border_top_width: parseFloat(cs.borderTopWidth),
    border_top_style: cs.borderTopStyle,
    border_top_color: cs.borderTopColor,
    outline_style: cs.outlineStyle,
    opacity: parseFloat(cs.opacity),
    position: cs.position,
    pointer_events: cs.pointerEvents,
  });

  const probe = document.createElement('iframe');
  probe.style.cssText = 'position:absolute;left:-9999px;width:200px;height:100px';
  document.body.appendChild(probe);
  const probeDoc = probe.contentDocument;
  const pristine = {};
  const isPristine = (el, cs) => {
    const key = el.tagName + ':' + (el.getAttribute('type') || '');
    if (!pristine[key]) {
      const ref = probeDoc.createElement(el.tagName.toLowerCase());
      if (el.getAttribute('type')) ref.setAttribute('type', el.getAttribute('type'));
      probeDoc.body.appendChild(ref);
      const p = probe.contentWindow.getComputedStyle(ref);
      pristine[key] = {
        bt: p.borderTopWidth + p.borderTopStyle + p.borderTopColor,
        bg: p.backgroundColor, appearance: p.appearance, radius: p.borderTopLeftRadius,
      };
    }
    const k = pristine[key];
    return k.bt === cs.borderTopWidth + cs.borderTopStyle + cs.borderTopColor &&
      k.bg === cs.backgroundColor && k.appearance === cs.appearance &&
      k.radius === cs.borderTopLeftRadius;
  };

  const out = [];
  const seen = new Set();
  const INTERACTIVE = 'a[href], button, input, select, textarea, summary, [tabindex], ' +
    '[onclick], [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], ' +
    '[role=menuitem], [role=switch], [role=slider], [role=combobox], [role=textbox]';
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (el === probe || probe.contains(el)) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && type === 'hidden') continue;
    const tabindex = el.getAttribute('tabindex');
    if (tabindex !== null && parseInt(tabindex, 10) < 0 && !el.matches('a[href], button, input, select, textarea, [role]')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!visible(el, cs, r)) continue;
    const role = el.getAttribute('role');
    let kind = 'button';
    if (tag === 'input' && type === 'range' || role === 'slider') kind = 'slider';
    else if (tag === 'input' && (type === 'checkbox' || type === 'radio') || tag === 'select' ||
      role === 'checkbox' || role === 'radio' || role === 'switch' || role === 'combobox') kind = 'choice';
    else if (tag === 'input' && ['submit', 'button', 'reset', 'image'].includes(type)) kind = 'button';
    else if (tag === 'input' || tag === 'textarea' || role === 'textbox') kind = 'input';
    else if (tag === 'a' || role === 'link') kind = 'link';
    const native = ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag);
    const st = style(cs);
    if (native && tag !== 'a') st.unstyled_native = isPristine(el, cs);
    if (tag === 'input') st.input_type = type || 'text';
    out.push({
      kind, bbox_css: box(r),
      text: (el.getAttribute('aria-label') || el.innerText || (type === 'password' ? '' : el.value) || '').toString().trim().slice(0, 120) || null,
      style: st, dom_ref: path(el), is_native: native,
      is_disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
    });
    seen.add(el);
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent === probe || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(parent.tagName)) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = [];
    for (const rect of range.getClientRects()) {
      if (rect.width < 1 || rect.height < 1) continue;
      const line = lines.find((l) => Math.abs(l.top - rect.top) < 2 && Math.abs(l.bottom - rect.bottom) < 2);
      if (line) {
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
      } else {
        lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
      }
    }
    for (const l of lines) {
      out.push({
        kind: 'text',
        bbox_css: box({ left: l.left, top: l.top, width: l.right - l.left, height: l.bottom - l.top }),
        text: node.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 120),
        style: style(cs), dom_ref: path(parent), is_native: false,
        is_disabled: !!parent.closest('[disabled], [aria-disabled=true]'),
      });
    }
  }

  for (const el of document.querySelectorAll('img, svg, [role=img], canvas, video')) {
    if (el === probe || probe.contains(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!visible(el, cs, r)) continue;
    out.push({
      kind: 'image_icon', bbox_css: box(r),
      text: el.getAttribute('alt') || el.getAttribute('aria-label') || null,
      style: style(cs), dom_ref: path(el), is_native: true, is_disabled: false,
    });
  }

  for (const el of document.querySelectorAll('body *')) {
    if (el === probe || probe.contains(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (!visible(el, cs, r)) continue;
    const st = style(cs);
    st.alpha = r1(alpha(cs.backgroundColor) * parseFloat(cs.opacity) * 100) / 100;
    out.push({
      kind: cs.position === 'fixed' ? 'fixed_region' : 'sticky_region', bbox_css: box(r),
      text: null, style: st, dom_ref: path(el), is_native: false, is_disabled: false,
    });
  }

  probe.remove();
  return out;
}
