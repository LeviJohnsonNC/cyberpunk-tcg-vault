import archive from '../data/printing-price-history.json';
import { PRICES } from './data';

export interface PriceSnapshot {
  date: string;
  quotes: Record<string, [market: number | null, low: number | null]>;
}

export interface DailyPriceArchive {
  dates: string[];
  quotes: Record<string, [day: number, market: number | null, low: number | null][]>;
}

export const dailyPriceArchive = archive as unknown as DailyPriceArchive;

export const latestPriceSnapshot: PriceSnapshot = {
  date: PRICES.priceDate ?? PRICES.updatedAt.slice(0, 10),
  quotes: Object.fromEntries(Object.entries(PRICES.printings).map(([id, quote]) => [
    id, [quote.market == null ? null : Math.round(quote.market * 100), quote.low == null ? null : Math.round(quote.low * 100)],
  ])),
};
