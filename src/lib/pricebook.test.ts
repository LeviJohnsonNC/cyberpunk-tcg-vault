import { describe, expect, it } from 'vitest';
import sample from '../../public/imports/levi-collection.json';
import { buildPriceBook, sortLines, toCsv } from './pricebook';
import { BY_SLUG, defaultPrinting, priceFor } from './data';
import type { Entry } from './store';

const entries = sample.entries as Entry[];

describe('buildPriceBook', () => {
  const pb = buildPriceBook(entries);

  it('counts every copy and prices the whole collection', () => {
    expect(pb.count).toBe(101);
    expect(pb.lines).toHaveLength(entries.length);
    const sum = pb.lines.reduce((a, l) => a + l.unit * l.entry.qty, 0);
    expect(pb.total).toBeCloseTo(sum, 6);
    expect(pb.average).toBeCloseTo(pb.total / 101, 6);
  });

  it('picks the most valuable single copy for the marquee', () => {
    const maxUnit = Math.max(...pb.lines.map((l) => l.unit));
    expect(pb.top?.unit).toBe(maxUnit);
  });

  it('caps listing-only printings at the reference market price', () => {
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
    expect(pb.byConfidence.map((g) => g.key)).toEqual(['Market', 'Beta proxy', 'Low listing']);
  });

  it('labels a position by its printing rarity, not the base card', () => {
    const iconic = buildPriceBook([{ slug: 'hanako-arasaka-daughter-of-the-emperor', printingId: '79307857-811d-4436-b1d9-1190d9376ea0', qty: 1 }]);
    expect(iconic.lines[0].rarity).toBe('Iconic Legend');
    expect(iconic.byRarity.map((g) => g.key)).toEqual(['Iconic Legend']);
  });

  it('handles an empty collection', () => {
    const e = buildPriceBook([]);
    expect(e).toMatchObject({ total: 0, count: 0, average: 0, top: null, extras: [] });
  });

  it('ignores unknown cards and zero quantities', () => {
    const c = BY_SLUG.get('psycho-squad')!;
    const e = buildPriceBook([
      { slug: 'not-a-card', printingId: 'x', qty: 3 },
      { slug: c.slug, printingId: defaultPrinting(c).id, qty: 0 },
      { slug: c.slug, printingId: defaultPrinting(c).id, qty: 2 },
    ]);
    expect(e.count).toBe(2);
    expect(e.total).toBeCloseTo((priceFor(c.slug, defaultPrinting(c).id)?.cad ?? 0) * 2, 6);
  });
});

describe('sortLines + toCsv', () => {
  const { lines } = buildPriceBook(entries);
  it('sorts by total, unit and name', () => {
    const t = sortLines(lines, 'total');
    for (let i = 1; i < t.length; i++) expect(t[i - 1].total).toBeGreaterThanOrEqual(t[i].total);
    const u = sortLines(lines, 'unit');
    for (let i = 1; i < u.length; i++) expect(u[i - 1].unit).toBeGreaterThanOrEqual(u[i].unit);
    const n = sortLines(lines, 'name').map((l) => l.card.display);
    expect(n).toEqual([...n].sort((a, b) => a.localeCompare(b)));
  });
  it('exports a header plus one escaped row per position', () => {
    const csv = toCsv(lines).split('\n');
    expect(csv[0]).toContain('"Price basis"');
    expect(csv).toHaveLength(lines.length + 1);
    expect(toCsv(lines)).toContain('"Three Mouths, One Desire"'); // comma survives quoting
  });
});
