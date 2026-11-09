// Display currency. Prices are computed internally in CAD (TCGplayer USD x FX); this module
// only decides how to show them. USD is the default since TCGplayer prices are USD at source.
import { FX } from './data';

export type Currency = 'USD' | 'CAD';
export const CURRENCIES: Currency[] = ['USD', 'CAD'];
const KEY = 'cptv.currency.v1';

function read(): Currency {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'CAD' || v === 'USD' ? v : 'USD';
  } catch {
    return 'USD';
  }
}

let current: Currency = typeof localStorage === 'undefined' ? 'USD' : read();

export const getCurrency = (): Currency => current;

export function setCurrency(c: Currency) {
  current = c;
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* storage blocked: lasts for this visit */
  }
}

/** Convert an internal CAD amount to the display currency. */
export const toDisplay = (cadAmount: number, c: Currency = current) => (c === 'CAD' ? cadAmount : cadAmount / FX);

/** Format an internal CAD amount in the display currency. */
export function money(cadAmount: number, c: Currency = current): string {
  return toDisplay(cadAmount, c).toLocaleString(c === 'CAD' ? 'en-CA' : 'en-US', {
    style: 'currency',
    currency: c,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
