/**
 * webui_proxy_signals.js
 * =======================
 * In-browser proxy-signal detectors for the 8 in-scope WCAG 2.2 success
 * criteria, used by the Stage-2 Playwright capture/select pipeline
 * (capture_and_select.py) to score each real candidate page.
 *
 * These are PROXY signals, not final ground truth -- every selected real
 * page still goes through human annotation per the Annotation Protocol.
 * Their only job here is to (a) tell Stage 2 which of the 200 candidates
 * to spend the final 50 slots on, and (b) give the annotator a head start.
 *
 * The colour math (relativeLuminance / contrastRatio) is a line-for-line
 * port of the Python functions in build_synthetic_corpus.py, so a page's
 * synthetic and real-world contrast numbers are computed identically --
 * this file's own self-test (run with `node webui_proxy_signals.js
 * --selftest`) checks that port against known values from the Python
 * side, plus checks every other detector against small inline DOM fixtures.
 *
 * This file is written in plain, browser-safe JS (no imports, no async
 * top-level) so it can be read as a single string and handed to
 * Playwright's page.evaluate(). The bottom `module.exports` block only
 * runs under Node (for the self-test); it's a no-op inside a browser.
 */

/* eslint-disable no-unused-vars */

// =====================================================================
// 1. COLOUR MATH -- must match build_synthetic_corpus.py exactly
// =====================================================================

function relativeLuminance(r, g, b) {
  function channel(cInt) {
    var c = cInt / 255.0;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(rgb1, rgb2) {
  var l1 = relativeLuminance(rgb1[0], rgb1[1], rgb1[2]);
  var l2 = relativeLuminance(rgb2[0], rgb2[1], rgb2[2]);
  var lighter = Math.max(l1, l2);
  var darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Parses computed-style colour strings: "rgb(r, g, b)" or "rgba(r, g, b, a)".
// getComputedStyle always normalises to one of these two forms in every
// modern browser, so no named-colour lookup table is needed.
function parseColor(str) {
  if (!str) return null;
  var m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (!m) return null;
  return {
    r: parseFloat(m[1]),
    g: parseFloat(m[2]),
    b: parseFloat(m[3]),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1.0,
  };
}

// Composites `fg` (with alpha) over `bg` (assumed opaque) -- standard
// "over" alpha compositing, used when walking up the ancestor chain.
function compositeOver(fg, bg) {
  var a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1.0,
  };
}

// Walks up from `el` compositing every ancestor's background-color until
// a fully opaque result is reached or we run out of ancestors, in which
// case we assume white (the default canvas colour).
function getEffectiveBackgroundColor(el) {
  var stack = [];
  var node = el;
  while (node && node.nodeType === 1) {
    var bg = parseColor(getComputedStyle(node).backgroundColor);
    if (bg && bg.a > 0) stack.push(bg);
    if (bg && bg.a >= 0.999) break;
    node = node.parentElement;
  }
  var result = { r: 255, g: 255, b: 255, a: 1.0 };
  for (var i = stack.length - 1; i >= 0; i--) {
    result = compositeOver(stack[i], result);
  }
  return [Math.round(result.r), Math.round(result.g), Math.round(result.b)];
}

function isLargeText(el) {
  var style = getComputedStyle(el);
  var pxSize = parseFloat(style.fontSize) || 0;
  var weight = parseInt(style.fontWeight, 10) || 400;
  var ptSize = pxSize * 72 / 96; // CSS px -> pt, matches WCAG's 18pt/14pt thresholds
  if (ptSize >= 18) return true;
  if (ptSize >= 14 && weight >= 700) return true;
  return false;
}

// =====================================================================
// 2. ELEMENT DISCOVERY HELPERS
// =====================================================================

function isVisible(el) {
  if (!(el instanceof Element)) return false;
  var rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  var style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (parseFloat(style.opacity) === 0) return false;
  return true;
}

function directTextOf(el) {
  var text = "";
  for (var i = 0; i < el.childNodes.length; i++) {
    var n = el.childNodes[i];
    if (n.nodeType === 3) text += n.textContent;
  }
  return text.trim();
}

function cssPath(el) {
  if (!(el instanceof Element)) return "";
  var parts = [];
  var node = el;
  var depth = 0;
  while (node && node.nodeType === 1 && depth < 6) {
    var part = node.tagName.toLowerCase();
    if (node.id) {
      part += "#" + node.id;
      parts.unshift(part);
      break;
    } else if (node.className && typeof node.className === "string") {
      var firstClass = node.className.trim().split(/\s+/)[0];
      if (firstClass) part += "." + firstClass;
    }
    parts.unshift(part);
    node = node.parentElement;
    depth++;
  }
  return parts.join(" > ");
}

var FOCUSABLE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, ' +
  '[tabindex]:not([tabindex="-1"]), [contenteditable="true"], ' +
  '[role="button"], [role="link"], [role="checkbox"], [role="radio"]';

var INTERACTIVE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, ' +
  '[role="button"], [onclick], [tabindex]:not([tabindex="-1"])';

// =====================================================================
// 3. SC 1.4.3 -- Contrast (Minimum)
// =====================================================================

function collectContrastFindings(maxElements) {
  maxElements = maxElements || 300;
  var findings = [];
  var all = document.querySelectorAll("*");
  var checked = 0;
  for (var i = 0; i < all.length && checked < maxElements; i++) {
    var el = all[i];
    var text = directTextOf(el);
    if (!text || text.length < 2) continue;
    if (!isVisible(el)) continue;
    checked++;

    var style = getComputedStyle(el);
    var fg = parseColor(style.color);
    if (!fg) continue;
    var bg = getEffectiveBackgroundColor(el);

    var ratio = contrastRatio([fg.r, fg.g, fg.b], bg);
    var large = isLargeText(el);
    var threshold = large ? 3.0 : 4.5;
    var isViolation = ratio < threshold;

    findings.push({
      selector: cssPath(el),
      textSample: text.slice(0, 40),
      fgColor: [Math.round(fg.r), Math.round(fg.g), Math.round(fg.b)],
      bgColor: bg,
      ratio: Math.round(ratio * 100) / 100,
      threshold: threshold,
      largeText: large,
      isViolation: isViolation,
      boundary: Math.abs(ratio - threshold) < 0.25,
    });
  }
  return findings;
}

// =====================================================================
// 4. SC 1.4.11 -- Non-text Contrast (form control borders)
// =====================================================================

function collectNonTextContrastFindings(maxElements) {
  maxElements = maxElements || 100;
  var findings = [];
  var controls = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, ' +
      '[role="checkbox"], [role="radio"]'
  );
  var checked = 0;
  for (var i = 0; i < controls.length && checked < maxElements; i++) {
    var el = controls[i];
    if (!isVisible(el)) continue;
    checked++;

    var style = getComputedStyle(el);
    var borderColor = parseColor(style.borderTopColor);
    if (!borderColor || borderColor.a < 0.2) continue; // no visible border to check
    var bg = getEffectiveBackgroundColor(el.parentElement || el);

    var ratio = contrastRatio([borderColor.r, borderColor.g, borderColor.b], bg);
    var threshold = 3.0;
    findings.push({
      selector: cssPath(el),
      borderColor: [Math.round(borderColor.r), Math.round(borderColor.g), Math.round(borderColor.b)],
      bgColor: bg,
      ratio: Math.round(ratio * 100) / 100,
      threshold: threshold,
      isViolation: ratio < threshold,
      boundary: Math.abs(ratio - threshold) < 0.25,
    });
  }
  return findings;
}

// =====================================================================
// 5. SC 2.5.8 -- Target Size (Minimum)
// =====================================================================

function collectTargetSizeFindings(maxElements) {
  maxElements = maxElements || 200;
  var elements = Array.prototype.slice.call(document.querySelectorAll(INTERACTIVE_SELECTOR));
  var rects = elements.map(function (el) {
    return isVisible(el) ? el.getBoundingClientRect() : null;
  });

  var findings = [];
  var checked = 0;
  for (var i = 0; i < elements.length && checked < maxElements; i++) {
    var el = elements[i];
    var rect = rects[i];
    if (!rect) continue;
    checked++;

    var w = rect.width,
      h = rect.height;
    var meetsSize = w >= 24 && h >= 24;

    // Spacing exemption: is there enough centre-to-centre clearance to
    // every other on-screen target (approximated as no overlap within a
    // 24px-diameter circle centred on each target)?
    var spacingExempt = false;
    if (!meetsSize) {
      spacingExempt = true;
      for (var j = 0; j < elements.length; j++) {
        if (j === i || !rects[j]) continue;
        var other = rects[j];
        var dx = (rect.left + rect.right) / 2 - (other.left + other.right) / 2;
        var dy = (rect.top + rect.bottom) / 2 - (other.top + other.bottom) / 2;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 24) {
          spacingExempt = false;
          break;
        }
      }
    }

    // Inline exemption: the target sits within a run of text (e.g. an
    // inline link inside a paragraph), where its size is set by the
    // surrounding text rather than a deliberately small button/control.
    var style = getComputedStyle(el);
    var inlineExempt = !meetsSize && style.display.indexOf("inline") === 0 && !!el.closest("p, li, td, span");

    var isViolation = !meetsSize && !spacingExempt && !inlineExempt;

    findings.push({
      selector: cssPath(el),
      width: Math.round(w),
      height: Math.round(h),
      meetsSize: meetsSize,
      spacingExempt: spacingExempt,
      inlineExempt: inlineExempt,
      isViolation: isViolation,
      boundary: !meetsSize && (Math.abs(w - 24) < 3 || Math.abs(h - 24) < 3),
    });
  }
  return findings;
}

// =====================================================================
// 6. SC 2.4.7 / 2.4.11 / 2.4.12 / 2.4.13 -- Focus-related
// =====================================================================

function styleSnapshot(el) {
  var s = getComputedStyle(el);
  return {
    outlineWidth: parseFloat(s.outlineWidth) || 0,
    outlineStyle: s.outlineStyle,
    outlineColor: parseColor(s.outlineColor),
    boxShadow: s.boxShadow,
  };
}

function hasVisibleIndicator(before, after) {
  if (after.outlineStyle !== "none" && after.outlineWidth > 0) {
    if (before.outlineStyle === "none" || before.outlineWidth === 0) return true;
  }
  if (after.boxShadow !== "none" && after.boxShadow !== before.boxShadow) return true;
  return false;
}

// Samples elementFromPoint around the focused element's rect edges to see
// whether a different, fixed/sticky-positioned element sits on top of it
// -- the DOM signature of a sticky header/footer obscuring focus.
function obscuringInfo(el, rect) {
  var samplePoints = [
    [rect.left + 2, rect.top + 2],
    [rect.right - 2, rect.top + 2],
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
    [rect.left + 2, rect.bottom - 2],
    [rect.right - 2, rect.bottom - 2],
  ];
  var obscuredCount = 0;
  var coveringPositions = [];
  for (var i = 0; i < samplePoints.length; i++) {
    var x = samplePoints[i][0],
      y = samplePoints[i][1];
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      obscuredCount++; // off-screen counts as obscured/not-visible
      continue;
    }
    var top = document.elementFromPoint(x, y);
    if (top && top !== el && !el.contains(top) && !(top.contains && top.contains(el))) {
      obscuredCount++;
      var pos = getComputedStyle(top).position;
      if (pos === "fixed" || pos === "sticky") coveringPositions.push(pos);
    }
  }
  return {
    obscuredSamplePoints: obscuredCount,
    totalSamplePoints: samplePoints.length,
    entirelyObscured: obscuredCount === samplePoints.length,
    partiallyObscured: obscuredCount > 0 && obscuredCount < samplePoints.length,
    coveredBySticky: coveringPositions.length > 0,
  };
}

function collectFocusFindings(maxElements) {
  maxElements = maxElements || 40;
  var elements = Array.prototype.slice.call(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
  var findings = [];
  var activeElBefore = document.activeElement;

  for (var i = 0; i < elements.length && i < maxElements; i++) {
    var el = elements[i];
    var before = styleSnapshot(el);
    try {
      el.scrollIntoView({ block: "center", inline: "center" });
      el.focus({ preventScroll: true });
    } catch (e) {
      continue;
    }
    var after = styleSnapshot(el);
    var focusVisible = hasVisibleIndicator(before, after);

    var rect = el.getBoundingClientRect();
    var obscure = obscuringInfo(el, rect);

    var appearanceOk = null;
    if (focusVisible) {
      var thicknessOk = after.outlineWidth >= 2 || after.boxShadow !== "none";
      var contrastOk = true;
      if (after.outlineColor) {
        var bg = getEffectiveBackgroundColor(el.parentElement || el);
        var ratio = contrastRatio([after.outlineColor.r, after.outlineColor.g, after.outlineColor.b], bg);
        contrastOk = ratio >= 3.0;
      }
      appearanceOk = thicknessOk && contrastOk;
    }

    findings.push({
      selector: cssPath(el),
      focusVisible: focusVisible,
      appearanceOk: appearanceOk, // null if not focusVisible (2.4.13 only applies when a visible indicator exists)
      obscured: obscure,
    });
    el.blur();
  }
  if (activeElBefore && activeElBefore.focus) {
    try {
      activeElBefore.focus({ preventScroll: true });
    } catch (e) {}
  }
  return findings;
}

// =====================================================================
// 7. SC 2.5.7 -- Dragging Movements (best-effort heuristic ONLY)
// =====================================================================
// Automated detection of "dragging is the only way to do X" is unreliable
// from the DOM alone. This flags CANDIDATES for manual review rather than
// asserting a violation -- see Annotation Protocol §6 (ambiguous cases).

function collectDraggingCandidates(maxElements) {
  maxElements = maxElements || 50;
  var candidates = [];
  var draggable = document.querySelectorAll('[draggable="true"]');
  var dragClassPattern = /(sortable|draggable|dnd-|drag-handle|ui-draggable|ui-resizable)/i;
  var classMatches = Array.prototype.slice.call(document.querySelectorAll("[class]")).filter(function (el) {
    return dragClassPattern.test(el.className);
  });

  var seen = new Set();
  function addCandidate(el, reason) {
    if (candidates.length >= maxElements) return;
    var key = cssPath(el);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ selector: key, reason: reason, manualReviewRequired: true });
  }

  for (var i = 0; i < draggable.length; i++) addCandidate(draggable[i], "draggable-attribute");
  for (var j = 0; j < classMatches.length; j++) addCandidate(classMatches[j], "drag-related-class-name");

  return candidates;
}

// =====================================================================
// 8. MASTER ENTRY POINT
// =====================================================================

function runAllProxyChecks() {
  var contrast = collectContrastFindings();
  var nonTextContrast = collectNonTextContrastFindings();
  var targetSize = collectTargetSizeFindings();
  var focus = collectFocusFindings();
  var dragging = collectDraggingCandidates();

  function any(list, pred) {
    for (var i = 0; i < list.length; i++) if (pred(list[i])) return true;
    return false;
  }

  var hasFinding = {
    "1.4.3": any(contrast, function (f) { return f.isViolation; }),
    "1.4.11": any(nonTextContrast, function (f) { return f.isViolation; }),
    "2.4.7": any(focus, function (f) { return !f.focusVisible; }),
    "2.4.11": any(focus, function (f) { return f.obscured.entirelyObscured; }),
    "2.4.12": any(focus, function (f) { return f.obscured.partiallyObscured || f.obscured.entirelyObscured; }),
    "2.4.13": any(focus, function (f) { return f.focusVisible && f.appearanceOk === false; }),
    "2.5.7": dragging.length > 0, // candidate only -- confirm manually
    "2.5.8": any(targetSize, function (f) { return f.isViolation; }),
  };

  return {
    pageUrl: window.location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    contrast: contrast,
    nonTextContrast: nonTextContrast,
    targetSize: targetSize,
    focus: focus,
    dragging: dragging,
    hasFinding: hasFinding,
    counts: {
      contrastChecked: contrast.length,
      contrastViolations: contrast.filter(function (f) { return f.isViolation; }).length,
      nonTextContrastChecked: nonTextContrast.length,
      nonTextContrastViolations: nonTextContrast.filter(function (f) { return f.isViolation; }).length,
      targetSizeChecked: targetSize.length,
      targetSizeViolations: targetSize.filter(function (f) { return f.isViolation; }).length,
      focusChecked: focus.length,
      focusNotVisible: focus.filter(function (f) { return !f.focusVisible; }).length,
      focusObscured: focus.filter(function (f) { return f.obscured.partiallyObscured || f.obscured.entirelyObscured; }).length,
      draggingCandidates: dragging.length,
    },
  };
}

// Node-only export for the self-test harness; inert inside a real browser
// (module is undefined there, so this whole block never executes).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    relativeLuminance: relativeLuminance,
    contrastRatio: contrastRatio,
    parseColor: parseColor,
    compositeOver: compositeOver,
    isLargeText: isLargeText,
    getEffectiveBackgroundColor: getEffectiveBackgroundColor,
    isVisible: isVisible,
    directTextOf: directTextOf,
    cssPath: cssPath,
    collectContrastFindings: collectContrastFindings,
    collectNonTextContrastFindings: collectNonTextContrastFindings,
    collectTargetSizeFindings: collectTargetSizeFindings,
    collectFocusFindings: collectFocusFindings,
    collectDraggingCandidates: collectDraggingCandidates,
    runAllProxyChecks: runAllProxyChecks,
  };
}
