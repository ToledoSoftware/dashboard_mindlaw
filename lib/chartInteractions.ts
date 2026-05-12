import type { ChartOptions } from "chart.js";

/** Cursor pointer quando há elemento sob o rato (gráficos clicáveis). */
export function withHoverPointer<T extends "bar" | "doughnut" | "line">(
  opts?: ChartOptions<T>
): ChartOptions<T> {
  const cfg = (opts ? { ...opts } : {}) as ChartOptions<T>;
  const prev = cfg!.onHover;
  return {
    ...cfg!,
    onHover: (event, elements, chart) => {
      prev?.(event, elements, chart);
      const target = event.native?.target as HTMLElement | undefined;
      if (target?.style) target.style.cursor = elements.length ? "pointer" : "default";
    }
  };
}
