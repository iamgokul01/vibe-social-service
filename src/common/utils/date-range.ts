export type AnalyticsRange = 'today' | '7d' | '30d' | '90d';

export interface DateWindow {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  days: number;
}

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const resolveWindow = (range: AnalyticsRange): DateWindow => {
  const days = RANGE_DAYS[range] ?? 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const previousEnd = new Date(start.getTime());
  const previousStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);

  return { start, end, previousStart, previousEnd, days };
};

export const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

export const buildDayBuckets = (window: DateWindow): string[] => {
  const buckets: string[] = [];
  const cursor = new Date(window.start);

  while (cursor.getTime() <= window.end.getTime()) {
    buckets.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
};

export const percentChange = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

export const safeRate = (numerator: number, denominator: number): number => {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
};
