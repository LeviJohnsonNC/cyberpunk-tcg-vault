import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { chooseMove, SeededRNG } from '../../../vendor/cyberpunk-engine/engine.mjs';
import { createEngineSession } from './engineSession';
import { prepareMatchDeck } from './matchDeck';
import { curatedOpponents } from './opponents';
import { equipTableFinish, readCircuitProgress, updateSavedMatch } from './matchStorage';
import { createMatchController, type StoredMatch } from './workerController';
import type { MatchSetup } from './protocol';

it('plays a real contract through a win, saves its promotion, equips the reward, and resumes without paying twice', async () => {
  const deck = prepareMatchDeck(curatedOpponents.find(item => item.key === 'curated:heist-reloaded')!.deck);
  const setup: MatchSetup = { player: deck, rival: deck, rivalSkill: 'standard', circuit: { version: 1, contractId: 'first-call', rivalKey: 'curated:heist-reloaded' } };
  const session = createEngineSession(setup, { shuffle: 'circuit-qa-1', bot: 'circuit-rival' });
  const rng = new SeededRNG('circuit-player');
  let snapshot = session.start();
  for (let step = 0; !snapshot.view.gameEnded && step < 350; step++) {
    const move = chooseMove(snapshot.view, () => rng.next(), 'player');
    expect(move?.move).not.toBe('concede');
    expect(move).toBeDefined();
    snapshot = session.move(snapshot.view.stateID, move!);
  }
  expect(snapshot.view).toMatchObject({ gameEnded: true, winnerId: 'player', turnNumber: 15 });
  expect(snapshot.report!.played).toBe(12);
  const saved: StoredMatch = { version: 1, setup, checkpoint: session.checkpoint(), summary: { matchId: snapshot.matchId, ended: true } };
  const first = await updateSavedMatch('journey', () => ({ saved, response: { id: 1, snapshot } }));
  expect('snapshot' in first && first.snapshot.circuit?.receipt).toMatchObject({ earned: 225, marks: ['clear', 'bonus'], unlocks: ['ghost'] });
  await equipTableFinish('journey', 'ghost');
  const progress = await readCircuitProgress('journey');
  expect(progress).toMatchObject({ rep: 225, matches: 1, wins: 1, finish: 'ghost' });
  await updateSavedMatch('journey', previous => ({ response: createMatchController(previous).respond({ id: 2, action: { type: 'resume' } }) }));
  expect(await readCircuitProgress('journey')).toEqual(progress);
  await updateSavedMatch('journey', previous => {
    const controller = createMatchController(previous);
    const response = controller.respond({ id: 3, action: { type: 'rematch', matchId: snapshot.matchId, stateID: snapshot.view.stateID } });
    if (!('snapshot' in response)) throw new Error(response.error);
    expect(response.snapshot.view.gameEnded).toBe(false);
    expect(response.snapshot.matchId).not.toBe(snapshot.matchId);
    return { response, saved: controller.save(response.snapshot) };
  });
  expect(await readCircuitProgress('journey')).toEqual(progress);
}, 30_000);
