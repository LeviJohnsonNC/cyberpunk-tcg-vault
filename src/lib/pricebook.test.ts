import { describe, expect, it } from 'vitest';
import sample from '../../public/imports/levi-collection.json';
import { buildPriceBook, sortLines, toCsv } from './pricebook';
import { BY_SLUG, defaultPrinting, valueHolding } from './data';
import type { Entry } from './store';

const entries = sample.entries as Entry[];
const NOVA_EO = BY_SLUG.get('adam-smasher-ender-of-legends')!.printings.find((p) => p.set === 'Edgerunner Open S 1')!.id;
const JACKIE_RETAIL = BY_SLUG.get('jackie-welles-pour-one-out-for-me')!.printings.find((p) => p.set === 'The Heist — Retail Starter Deck')!.id;

describe('buildPriceBook', () => {
  const pb = buildPriceBook(entries);

  it('counts every copy; the total is the priced subtotal and unpriced copies are counted', () => {
    expect(pb.count).toBe(101);
    expect(pb.lines).toHaveLength(entries.length);
    const priced = pb.lines.filter((l) => l.unit != null);
    const sum = priced.reduce((a, l) => a + l.unit! * l.entry.qty, 0);
    expect(pb.total).toBeCloseTo(sum, 6);
    expect(pb.unpriced).toBe(pb.count - pb.pricedCount);
    expect(pb.average).toBeCloseTo(pb.pricedCount ? pb.total / pb.pricedCount : 0, 6);
  });

  it('picks the most valuable single priced copy for the marquee', () => {
    const maxUnit = Math.max(...pb.lines.filter((l) => l.unit != null).map((l) => l.unit!));
    expect(pb.top?.unit).toBe(maxUnit);
  });

  it('never makes an unpriced holding the most valuable card', () => {
    const nova = buildPriceBook([{ slug: 'adam-smasher-ender-of-legends', printingId: NOVA_EO, qty: 1 }]);
    expect(nova.lines[0].unit).toBeNull();
    expect(nova.top).toBeNull();
    expect(nova.total).toBe(0);
    expect(nova.unpriced).toBe(1);
  });

  it('values a listing-only Retail printing at its verified Beta twin when that is lower', () => {
    // Heist Retail legends only have a $25 USD listing; they must not outrank the Beta market proxy.
    const jackie = pb.lines.find((l) => l.card.slug === 'jackie-welles-pour-one-out-for-me')!;
    expect(jackie.basis).toBe('Beta proxy');
    expect(jackie.unit).toBeLessThan(25);
  });

  it('flags copies beyond the 3-copy deck limit as trade bait', () => {
    for (const x of pb.extras) expect(x.copies).toBeGreaterThan(0);
    const kiroshi = pb.extras.find((x) => x.slug === 'kiroshi-optics');
    expect(kiroshi?.copies).toBe(2); // owns 5
    expect(pb.extrasCopies).toBe(pb.extras.reduce((a, x) => a + x.copies, 0));
  });

  it('breakdowns add back up to the total', () => {
    for (const groups of [pb.byConfidence, pb.byColor, pb.byRarity]) {
      expect(groups.reduce((a, g) => a + g.value, 0)).toBeCloseTo(pb.total, 6);
      expect(groups.reduce((a, g) => a + g.count, 0)).toBe(101);
    }
    const order = ['Market', 'Beta proxy', 'Low listing', 'Unpriced'];
    const keys = pb.byConfidence.map((g) => g.key);
    expect(keys).toEqual([...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it('labels a position by its printing rarity, not the base card', () => {
    const iconic = buildPriceBook([{ slug: 'hanako-arasaka-daughter-of-the-emperor', printingId: '79307857-811d-4436-b1d9-1190d9376ea0', qty: 1 }]);
    expect(iconic.lines[0].rarity).toBe('Iconic Legend');
    expect(iconic.byRarity.map((g) => g.key)).toEqual(['Iconic Legend']);
  });

  it('handles an empty collection', () => {
    const e = buildPriceBook([]);
    expect(e).toMatchObject({ total: 0, count: 0, unpriced: 0, average: 0, top: null, extras: [] });
  });

  it('ignores unknown cards and zero quantities', () => {
    const c = BY_SLUG.get('psycho-squad')!;
    const e = buildPriceBook([
      { slug: 'not-a-card', printingId: 'x', qty: 3 },
      { slug: c.slug, printingId: defaultPrinting(c).id, qty: 0 },
      { slug: c.slug, printingId: defaultPrinting(c).id, qty: 2 },
    ]);
    expect(e.count).toBe(2);
    expect(e.total).toBeCloseTo((valueHolding(defaultPrinting(c).id)?.cad ?? 0) * 2, 6);
  });
});

describe('sortLines + toCsv', () => {
  const { lines } = buildPriceBook(entries);
  it('sorts by total, unit and name', () => {
    const t = sortLines(lines, 'total');
    for (let i = 1; i < t.length; i++) expect(t[i - 1].total ?? -1).toBeGreaterThanOrEqual(t[i].total ?? -1);
    const u = sortLines(lines, 'unit');
    for (let i = 1; i < u.length; i++) expect(u[i - 1].unit ?? -1).toBeGreaterThanOrEqual(u[i].unit ?? -1);
    const n = sortLines(lines, 'name').map((l) => l.card.display);
    expect(n).toEqual([...n].sort((a, b) => a.localeCompare(b)));
  });
  it('exports a header plus one escaped row per position', () => {
    const csv = toCsv(lines).split('\n');
    expect(csv[0]).toContain('"Price basis"');
    expect(csv).toHaveLength(lines.length + 1);
    expect(toCsv(lines)).toContain('"Three Mouths, One Desire"'); // comma survives quoting
  });
  it('leaves unknown amounts blank in CSV and names the basis and proxy source', () => {
    const csv = toCsv(buildPriceBook([
      { slug: 'adam-smasher-ender-of-legends', printingId: NOVA_EO, qty: 1 },
      { slug: 'jackie-welles-pour-one-out-for-me', printingId: JACKIE_RETAIL, qty: 1 },
    ]).lines).split('\n');
    const nova = csv.find((r) => r.includes('Adam Smasher'))!;
    expect(nova).toContain('"","","Unpriced"');
    const jackie = csv.find((r) => r.includes('Jackie'))!;
    expect(jackie).toContain('"Beta proxy"');
    expect(jackie).toMatch(/Heist Beta SD #β011/);
  });
});
