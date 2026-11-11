import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardInspection } from './PlayCard';
import { PlayTable } from './PlayTable';
import type { CardView, MatchSnapshot } from '../lib/play/protocol';

const unit: CardView = { instanceId: 'unit', definitionId: 'known', cardName: 'Test attacker', type: 'unit', zone: 'field', faceDown: false, spent: true, power: 4, effectivePower: 7, cost: 3, damage: 2 };
const defender = { ...unit, instanceId: 'defender', cardName: 'Test defender' };
const noop = () => {};

describe('tactical information rendering', () => {
  it('keeps combat participants and the current choice together during a mandatory effect', () => {
    const seat = { firstPlayer: true, zones: {}, eddies: 0, availableEddies: 0, gigCount: 0, streetCred: 0 };
    const snapshot: MatchSnapshot = { matchId: 'test', names: { player: 'You', rival: 'Rival' }, peeks: [], log: [], gigRolls: [], knownLegends: [], view: {
      players: { player: { ...seat, zones: { field: [unit] } }, rival: { ...seat, zones: { field: [defender] } } },
      gamePhase: 'main', turnNumber: 3, activePlayerId: 'player', overtimeActive: false, gameEnded: false, winnerId: null, winReason: null, stateID: 7,
      attackState: { attackerId: 'unit', defenderId: 'defender', rivalId: 'rival', step: 'react' },
      prompt: { status: 'choice', availableMoves: [{ moveId: 'resolveEffectTarget', inputSpec: { type: 'none' } }], choice: { type: 'chooseTarget', payload: { eligibleIds: ['defender'], min: 1, max: 1, source: { cardId: 'unit', displayName: 'Test attacker', rulesText: 'Choose a target.' } } } },
    } };
    const html = renderToStaticMarkup(<PlayTable scope="test" snapshot={snapshot} names={snapshot.names} busy={false} send={noop} rematch={noop} edit={noop} reduced />);
    expect(html).toContain('aria-label="Combat"');
    expect(html).toContain('Effect choice');
    expect(html).toContain('Inspect Attacker: Test attacker, current power 7');
    expect(html).toContain('Inspect Defender: Test defender, current power 7');
    expect(html).toContain('aria-label="Table decision"');
    expect(html).not.toContain('data-move="resolveAttack"');
  });
  it('shows real effects separately from printed text and conceals unknown identities', () => {
    const gear = { ...unit, instanceId: 'gear', type: 'gear', cardName: 'Test equipment', power: 3, attachedToId: 'unit' };
    const html = renderToStaticMarkup(<CardInspection card={{ ...unit, activeEffects: [{ id: 'end', sourceName: 'Public source', effectKind: 'delayedDefeat', label: 'End defeat', detail: 'Public source: defeated at end of turn.', tone: 'debuff', defeatsAtEndOfTurn: true }] }} cards={[gear]} shortcuts={[]} onClose={noop} />);
    expect(html).toContain('Base 4 + 3 Gear = 7');
    expect(html).toContain('Current power');
    expect(html).toContain('Damage');
    expect(html).toContain('Defeated at end of turn');
    expect(html).toContain('Printed rules unavailable');
    const hidden = renderToStaticMarkup(<CardInspection card={{ ...unit, definitionId: '', cardName: null, faceDown: true }} cards={[gear]} shortcuts={[]} onClose={noop} />);
    expect(hidden).toContain('This card’s identity is concealed.');
    expect(hidden).not.toContain('Current power');
    expect(hidden).not.toContain('Test equipment');
  });
});
