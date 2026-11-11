import { CIRCUIT_CONTRACTS, contractUnlocked, skillLevel, type CircuitProgress } from './circuit';
import recommended from '../../data/decks.json';
import type { MatchSetup } from './protocol';

/** Validate the actual rival list, not just an editable name or a caller's contract label. */
export function validateCircuitSetup(setup: MatchSetup, progress: CircuitProgress) {
  if (!setup.circuit?.contractId) return;
  const contract = CIRCUIT_CONTRACTS.find(item => item.id === setup.circuit?.contractId);
  if (!contract || !contractUnlocked(progress, contract.id)) throw new Error('Clear the previous contract to open this table.');
  if (skillLevel(setup.rivalSkill ?? 'standard') < skillLevel(contract.skill)) throw new Error('This contract requires a higher rival skill.');
  const rival = recommended.find(item => item.id === contract.rival);
  if (!rival) throw new Error('This contract’s rival is unavailable. Try a practice match.');
  const expected = { legends: rival.legends, mainDeck: Object.entries(rival.cards).flatMap(([slug, count]) => Array<string>(count).fill(slug)) };
  const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (!same(setup.rival.legends, expected.legends) || !same(setup.rival.mainDeck, expected.mainDeck)) throw new Error('This rival list does not match the contract. Reopen the Circuit and try again.');
}
