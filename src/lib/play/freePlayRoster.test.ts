import { describe, expect, it } from 'vitest';
import { communityCrewMatches } from '../communityPopularity';
import { browseRivals, freePlayRoster } from './freePlayRoster';
import { curatedOpponents } from './opponents';

describe('Free Play rival browser', () => {
  it('features the six intended portrait matches without removing or changing curated decks', () => {
    const { rows, counts } = browseRivals('', 'all', 'recommended');
    expect(rows.slice(0, 6).map(row => [row.id, row.portrait?.encounter, row.portrait?.alias])).toEqual([
      ['heist-reloaded', 'dead-drop', 'Latch'],
      ['chrome-syndicate', 'chrome-debt', 'Ledger'],
      ['nomad-convoy', 'night-drive', 'Switchback'],
      ['lowball-netrun-plus', 'dead-air', 'Hush'],
      ['mosh-pit', 'mosh-pit', 'Feedback'],
      ['smasher-surge', 'red-line', 'Brake'],
    ]);
    expect(rows.slice(6).every(row => !row.portrait)).toBe(true);
    expect(new Set(rows.map(row => row.deck))).toEqual(new Set(curatedOpponents.map(row => row.deck)));
    expect(counts.all).toBe(curatedOpponents.length);
    expect(counts.meta + counts.budget + counts.brew).toBe(counts.all);
  });

  it('combines categories and case- and accent-insensitive search with live counts', () => {
    const labelSearch = browseRivals('  brAKE ', 'meta', 'recommended');
    expect(labelSearch.rows.map(row => row.id)).toEqual(['smasher-surge']);
    expect(labelSearch.counts).toEqual({ all: 1, meta: 1, budget: 0, brew: 0 });
    expect(browseRivals('brake', 'budget', 'recommended').rows).toEqual([]);
    expect(browseRivals('Judy Alvarez', 'all', 'recommended').rows.map(row => row.id)).toContain('lowball-netrun-plus');
    expect(browseRivals('BBG', 'meta', 'recommended').rows.map(row => row.id)).toEqual(['baby-girl-bbg']);
  });

  it('sorts alphabetically in either direction and ranks popularity by exact Legend crews', () => {
    const names = browseRivals('', 'all', 'nameAsc').rows.map(row => row.deck.name);
    expect(names).toEqual(names.slice().sort((a, b) => a.localeCompare(b)));
    expect(browseRivals('', 'all', 'nameDesc').rows.map(row => row.deck.name)).toEqual(names.slice().reverse());
    const popular = browseRivals('', 'all', 'popularity').rows;
    expect(popular.map(row => row.crewMatches)).toEqual(freePlayRoster.map(row => communityCrewMatches(row.deck.legends)).sort((a, b) => b - a));
    const bbg = popular.find(row => row.id === 'baby-girl-bbg')!;
    expect(bbg.crewMatches).toBeGreaterThan(0);
    expect(communityCrewMatches([...bbg.deck.legends].reverse())).toBe(bbg.crewMatches);
  });
});
