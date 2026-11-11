import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MatchResult } from './PlayResult';
import { CircuitPayout } from './CircuitHub';
import type { CircuitReceipt } from '../lib/play/circuit';
import type { PlayerView } from '../lib/play/protocol';

const receipt: CircuitReceipt = { matchId: 'completed', earned: 350, baseRep: 125, contractRep: 100, markRep: 125, repBefore: 2200, repAfter: 2550, rankBefore: 4, rankAfter: 5, contractId: 'last-call', marks: ['clear', 'bonus', 'masterful'], unlocks: ['gold', 'chrome'] };

it('shows the saved top-rank promotion and both completion rewards', () => {
  const html = renderToStaticMarkup(<CircuitPayout receipt={receipt} />);
  for (const label of ['Afterlife Legend', '+350', 'Contract cleared', 'Bonus objective', 'Masterful win', 'House gold', 'Black chrome', 'Top rank']) expect(html).toContain(label);
  expect(html).not.toContain('undefined');
});
it('returns the final contract to the Circuit without promising another job', () => {
  const seat = { zones: {}, firstPlayer: false, eddies: 0, availableEddies: 0, gigCount: 7, streetCred: 40 };
  const view: PlayerView = { players: { player: seat, rival: { ...seat, gigCount: 3 } }, gamePhase: 'main', turnNumber: 15, activePlayerId: 'player', overtimeActive: false, gameEnded: true, winnerId: 'player', winReason: 'gig_victory', stateID: 99, prompt: { status: 'idle', choice: null, availableMoves: [] } };
  const html = renderToStaticMarkup(<MatchResult view={view} receipt={receipt} title="You win" reason="Seven Gigs secured" busy={false} rematch={() => {}} edit={() => {}} circuit={() => {}} />);
  expect(html).toContain('Back to Circuit');
  expect(html).not.toContain('Next contract');
});
