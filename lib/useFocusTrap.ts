import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape?: () => void
) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const root = containerRef.current;
    const prev = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    const first = () => focusables()[0];
    const last = () => focusables()[focusables().length - 1];

    queueMicrotask(() => {
      const f = first();
      if (f) f.focus();
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape?.();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const firstEl = nodes[0];
      const lastEl = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        }
      } else if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl?.focus();
      }
    }

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      prev?.focus?.();
    };
  }, [active, containerRef, onEscape]);
}
