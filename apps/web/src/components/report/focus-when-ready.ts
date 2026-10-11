export function focusWhenReady(
  find: () => HTMLElement | SVGElement | null | undefined,
  done?: () => void,
) {
  let tries = 0;
  let frame = 0;
  const attempt = () => {
    const el = find();
    if (el) {
      el.focus({ preventScroll: true });
      if (document.activeElement === el) {
        done?.();
        return;
      }
    }
    if (tries++ < 30) frame = requestAnimationFrame(attempt);
    else done?.();
  };
  attempt();
  return () => cancelAnimationFrame(frame);
}
