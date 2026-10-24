import { useEffect, useState, type RefObject } from "react";

/** Below this width the workspace lays itself out for one hand and a thumb. */
export const COMPACT_MAX_WIDTH = 640;

/**
 * Whether the workspace's own box is narrow. The box, not the window: the
 * calendar can sit beside a sidebar on a wide screen and still be narrow.
 * Server rendering and the first client paint assume a wide layout, then the
 * measurement corrects it before anything the user could have touched.
 */
export function useCompact(ref: RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setCompact(element.getBoundingClientRect().width < COMPACT_MAX_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return compact;
}
