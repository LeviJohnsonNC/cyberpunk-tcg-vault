import { describe, expect, it } from 'vitest';
import { communityCrewMatches } from '../communityPopularity';
import { campaignChapters } from './campaignStory';
import { freePlayRivalProfile } from './freePlayDialogue';
import { browseRivals, freePlayRoster } from './freePlayRoster';
import { curatedOpponents } from './opponents';
import { advanceRivalDialogue, rivalDialogueLine, rivalResult } from './rivalDialogue';

const tournamentDecks = new Set(['jackie-padre-streetkid', 'smasher-muamar-streetkid']);

describe('Free Play rival browser', () => {
  it('features the six intended portrait matches without removing or changing curated decks', () => {
    const { rows, counts } = browseRivals('', 'all', 'recommended');
    expect(rows.slice(0, 6).map(row => [row.id, row.portrait && 'encounter' in row.portrait ? row.portrait.encounter : undefined, row.portrait?.alias])).toEqual([
      ['heist-reloaded', 'dead-drop', 'Latch'],
      ['chrome-syndicate', 'chrome-debt', 'Ledger'],
      ['nomad-convoy', 'night-drive', 'Switchback'],
      ['lowball-netrun-plus', 'dead-air', 'Hush'],
      ['mosh-pit', 'mosh-pit', 'Feedback'],
      ['smasher-surge', 'red-line', 'Brake'],
    ]);
    const assets = import.meta.glob('../../assets/play/free-play-rivals/*.webp');
    const authored = rows.filter(row => !tournamentDecks.has(row.id));
    const mapped = authored.slice(6).map(({ portrait }) => portrait && 'art' in portrait ? portrait.art : '');
    expect(new Set(mapped).size).toBe(mapped.length);
    for (const art of mapped) expect(assets).toHaveProperty([`../../assets/play/free-play-rivals/${art}.webp`]);
    expect(new Set(authored.map(row => row.portrait?.alias)).size).toBe(authored.length);
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
    expect(browseRivals('Aftercare', 'meta', 'recommended').rows.map(row => row.id)).toEqual(['baby-girl-bbg']);
  });

  it('has distinct win and loss artwork for the authored rivals', () => {
    const assets = import.meta.glob('../../assets/play/results/*.webp');
    for (const { id, portrait } of freePlayRoster) {
      if (tournamentDecks.has(id)) continue;
      expect(portrait, id).toBeDefined();
      if (!portrait) continue;
      const artKey = 'encounter' in portrait ? portrait.encounter : portrait.art;
      for (const outcome of ['win', 'loss']) {
        expect(assets, `${id} ${outcome}`).toHaveProperty([`../../assets/play/results/${artKey}-${outcome}.webp`]);
      }
    }
  });

  it('gives every curated portrait its own voice and keeps Campaign plot lines out of Free Play endings', () => {
    const moments = Object.keys(campaignChapters['first-call'].lines).sort();
    const intros = new Set<string>();
    const authored = freePlayRoster.filter(row => !tournamentDecks.has(row.id));
    for (const { key, deck, portrait } of authored) {
      const profile = freePlayRivalProfile(key, deck.name);
      expect(profile.name).toBe(portrait?.alias);
      expect(Object.keys(profile.lines).sort()).toEqual(moments);
      for (const lines of Object.values(profile.lines)) {
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.every(line => line.trim().length > 0)).toBe(true);
      }
      intros.add(profile.lines.intro[0]);
      if (portrait && 'encounter' in portrait) {
        expect(profile.lines.playerWon).not.toEqual(campaignChapters[portrait.encounter].lines.playerWon);
        expect(profile.lines.rivalWon).not.toEqual(campaignChapters[portrait.encounter].lines.rivalWon);
      }
    }
    expect(intros.size).toBe(authored.length);
  });

  it.each([...tournamentDecks])('offers %s as a playable tournament list with the neutral rival profile', (id) => {
    const entry = freePlayRoster.find(row => row.id === id)!;
    expect(entry.kind).toBe('meta');
    expect(freePlayRivalProfile(entry.key, entry.deck.name)).toMatchObject({ name: entry.deck.name, portrait: undefined });
  });

  it('uses a neutral identity for custom and older saved rivals and resolves the same outcome line on resume', () => {
    const name = 'Smasher Surge';
    for (const key of ['saved:123', 'mirror', 'import', 'external', undefined]) {
      expect(freePlayRivalProfile(key, name)).toMatchObject({ name, portrait: undefined });
    }
    const { lines } = freePlayRivalProfile('curated:smasher-surge', name);
    const frame = { matchId: 'new-match', batch: 1, beats: [], now: 0 };
    expect(advanceRivalDialogue(undefined, { ...frame, opening: 'intro' }, lines).line?.text).toBe(lines.intro[0]);
    expect(advanceRivalDialogue(undefined, frame, lines).line).toBeUndefined();
    const result = rivalResult({ gameEnded: true, winnerId: 'rival' })!;
    expect(advanceRivalDialogue(undefined, { ...frame, result }, lines).line?.text).toBe(rivalDialogueLine(lines, result, frame.matchId));
    expect(lines.retry[0]).not.toBe(lines.intro[0]);
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
