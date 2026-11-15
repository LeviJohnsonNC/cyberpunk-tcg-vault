import history from '../data/price-history.json';
import { PRICES } from './data';
import type { PriceSnapshot } from './priceTrend';

export const weeklyPriceSnapshots = history.snapshots as unknown as PriceSnapshot[];

export const latestPriceSnapshot: PriceSnapshot = {
  date: PRICES.priceDate ?? PRICES.updatedAt.slice(0, 10),
  quotes: Object.fromEntries(Object.entries(PRICES.printings).map(([id, quote]) => [
    id, [quote.market == null ? null : Math.round(quote.market * 100), quote.low == null ? null : Math.round(quote.low * 100)],
  ])),
};
