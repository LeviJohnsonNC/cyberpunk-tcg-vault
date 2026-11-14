type Quote = { market?: number | null; low?: number | null };
type Snapshot = { date: string; quotes: Record<string, [number | null, number | null]> };

export function weekStart(date: string): string;
export function priceSnapshot(date: string, printings: Record<string, Quote>): Snapshot;
export function retainWeekly(snapshots: Snapshot[], snapshot: Snapshot): Snapshot[];
export function saveWeekly(path: URL | string, snapshot: Snapshot): Promise<void>;
export function archiveQuotes(
  printings: Record<string, { productId?: number; url?: string | null; finish?: string | null }>,
  rows: { productId: number; subTypeName: string; marketPrice: number | null; lowPrice: number | null }[],
): Record<string, Quote>;
