() => {
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  window.scrollTo(0, 0);
  const root = document.body || document.documentElement;
  const s = document.createElement('span');
  s.id = '__a11y_start'; s.tabIndex = -1;
  s.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
  root.insertBefore(s, root.firstChild);
  s.focus({ preventScroll: true });
  return document.activeElement === s;
}
