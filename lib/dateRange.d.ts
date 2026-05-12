export type DateRange = { start: Date; end: Date };

export function getRangeFromQuery(
  query: Record<string, string | string[] | undefined> | null
): DateRange | null;
