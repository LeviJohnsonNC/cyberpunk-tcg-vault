import { describe, expect, it, vi } from 'vitest';
import { chooseMove, LocalEngine, SeededRNG } from '../../../vendor/cyberpunk-engine/engine.mjs';
import type { EngineState } from '../../../vendor/cyberpunk-engine/engine.mjs';
import starters from '../../curated/starter-decks.json';
import { CARDS } from '../data';
import { deckFromRecommended } from '../decks';
import { botDecision, createEngineSession, engineCardId, initialEngineState, recordLegendPeeks } from './engineSession';
import { isReady, matchActions } from './matchActions';
import { prepareMatchDeck } from './matchDeck';
import { hideConcealedTargets } from './matchView';
import type { CardView, MatchSetup, Seat } from './protocol';
import { createMatchController } from './workerController';

const player = prepareMatchDeck({ ...starters.decks['the-heist'], sideboard: {} });
const setup = (id: string): MatchSetup => ({ player, rival: prepareMatchDeck(deckFromRecommended(id)!) });

function afterSetup(config: MatchSetup) {
  const engine = new LocalEngine(initialEngineState(config, 'vault-test-setup', 'test'));
  const preview = engine.getFilteredView('player');
  for (let n = 0; n < 12; n++) {
    if (engine.getFilteredView('player').gamePhase === 'main') return { engine, preview };
    const seats: Seat[] = ['player', 'rival'];
    const seat = seats.find((s) => ['action', 'choice'].includes(engine.getFilteredView(s).prompt.status));
    if (!seat) break;
    const move = botDecision(engine, seat, () => 0.3);
    if (!move) break;
    const result = engine.processCommand({
      commandID: `setup-${n}`, move: move.move, input: move.args ? { args: move.args } : undefined,
    }, seat);
    if (!result.success) throw new Error(result.error);
  }
  throw new Error('Expected both players to finish setup.');
}

describe('play engine', () => {
  it('maps every currently legal Vault card to a distinct playable engine definition', () => {
    const cards = CARDS.filter((card) => card.legal === 'legal');
    const mapped = cards.map((card) => engineCardId(card.slug));
    expect(new Set(mapped).size).toBe(cards.length);
    expect(() => engineCardId('not-in-the-catalog')).toThrow('No playable engine card');
  });

  it.each(['smasher-surge', 'chrome-syndicate', 'lowball-netrun-plus', 'nomad-convoy'])('finishes a real draft matchup against %s', (rivalId) => {
    const session = createEngineSession(setup(rivalId), { shuffle: `vault-match-${rivalId}`, bot: 'rival-test' });
    const rng = new SeededRNG('player-test');
    let snapshot = session.start();
    for (let step = 0; !snapshot.view.gameEnded && step < 200; step++) {
      const move = chooseMove(snapshot.view, () => rng.next(), 'player');
      expect(move?.move).toBeTruthy();
      expect(move?.move).not.toBe('concede');
      snapshot = session.move(snapshot.view.stateID, move!);
    }
    expect(snapshot.view.gameEnded).toBe(true);
    expect(snapshot.view.winReason).toMatch(/^(gig_victory|overtime_majority|deck_out_victory)$/);
  });

  it('delivers public rolls from both seats once, with the engine’s landed values', () => {
    const session = createEngineSession(setup('chrome-syndicate'), { shuffle: 'vault-rolls', bot: 'vault-rolls' });
    let snapshot = session.start();
    const seats = new Set<Seat>();
    for (let i = 0; i < 24 && seats.size < 2; i++) {
      const move = chooseMove(snapshot.view, () => 0.3, 'player')!;
      snapshot = session.move(snapshot.view.stateID, move);
      for (const roll of snapshot.gigRolls) {
        expect(roll.origin).toBe('gainGig');
        expect(snapshot.log).toContainEqual(expect.objectContaining({
          seat: roll.seat, text: `Gained a ${roll.dieType} Gig · rolled ${roll.result}.`,
        }));
        if (roll.seat === 'player') {
          const landed = (snapshot.view.players.player.zones.gigArea as CardView[]).find((die) => die.instanceId === roll.dieId);
          expect(landed).toMatchObject({ definitionId: roll.dieType, power: roll.result });
        }
        seats.add(roll.seat);
      }
      expect(session.start().gigRolls).toEqual([]);
    }
    expect(seats).toEqual(new Set(['player', 'rival']));
  });

  it('keeps hidden card identities and pre-shuffle Legend IDs out of both seat projections', () => {
    const { engine, preview } = afterSetup(setup('chrome-syndicate'));
    const presented = new Set(Object.values(preview.players).flatMap(({ zones }) =>
      (zones.legendArea as CardView[]).map((card) => card.instanceId)));
    for (const seat of ['player', 'rival'] as const) {
      const other = seat === 'player' ? 'rival' : 'player';
      const view = engine.getFilteredView(seat);
      expect(typeof view.players[other].zones.hand).toBe('number');
      for (const owner of [seat, other] as const) {
        expect(typeof view.players[owner].zones.deck).toBe('number');
        const legends = view.players[owner].zones.legendArea as CardView[];
        expect(legends).toHaveLength(3);
        expect(legends.every((card) => card.faceDown && card.cardName === null && !card.definitionId && !presented.has(card.instanceId))).toBe(true);
      }
      const altered = structuredClone(engine.getState());
      changeHiddenCards(altered, other);
      const alternate = new LocalEngine(altered);
      expect(alternate.getFilteredView(seat)).toEqual(view);
      expect(botDecision(alternate, seat, () => 0.3)).toEqual(botDecision(engine, seat, () => 0.3));
    }
  });

  it('sends a private Legend peek only to its authorized viewer and marks the known slot', () => {
    const { engine } = afterSetup(setup('lowball-netrun-plus'));
    const state = engine.getState();
    const [slot] = state.G.players.player.zones.legendArea;
    const known = new Map<string, Set<Seat>>();
    const reveal = { type: 'cardsRevealed', audience: 'private', fromZone: 'legendArea', cardIds: [slot] } as const;
    const event = { ...reveal, cardIds: [...reveal.cardIds] };
    expect(recordLegendPeeks(state, [{ ...event, playerId: 'rival' }], known)).toEqual([]);
    expect([...known.get(slot)!]).toEqual(['rival']);
    expect(recordLegendPeeks(state, [{ ...event, playerId: 'rival', viewers: ['player'] }], known)[0]).toMatchObject({
      instanceId: slot, definitionId: state.G.cardIndex[slot].definitionId,
    });
    expect([...known.get(slot)!]).toEqual(['rival', 'player']);
    expect((engine.getFilteredView('player').players.player.zones.legendArea as CardView[])[0].definitionId).toBe('');
  });

  it('retains Sell for Turn after Bootleg Black Sapphire Show sells a deck card', () => {
    const { state, active } = rulesFixture();
    const show = placeCard(state, active, 'bootleg-black-sapphire-show', 'hand');
    const handSale = placeCard(state, active, 'floor-it', 'hand');
    const account = state.G.players[active];
    for (let i = 0; i < 6; i++) {
      const id = placeCard(state, active, 'floor-it', 'eddieArea');
      account.eddieCardIds.push(id);
    }
    account.eddies = 6;
    const engine = new LocalEngine(state);
    const previousDeck = engine.getFilteredView(active).players[active].zones.deck as number;
    issue(engine, active, 'playCard', { cardId: show });
    expect(engine.getFilteredView(active).players[active].zones.deck).toBe(previousDeck - 1);
    expect(engine.getFilteredView(active).prompt.availableMoves.find(({ moveId }) => moveId === 'sellCard')?.inputSpec.candidates)
      .toContain(handSale);
    issue(engine, active, 'sellCard', { cardId: handSale });
    expect(engine.getFilteredView(active).prompt.availableMoves.some(({ moveId }) => moveId === 'sellCard')).toBe(false);
  });

  it('keeps a chosen Legend ready when calling with a different source', () => {
    const { state, active, other } = paymentFixture();
    const [called, source, third] = state.G.players[active].zones.legendArea;
    const eddie = placeEddie(state, active);
    const engine = new LocalEngine(state);
    const view = engine.getFilteredView(active);
    expect(view.prompt.payment).toMatchObject({ legendIds: [called, source, third], eddieIds: [eddie] });
    expect(engine.getFilteredView(other).prompt.payment).toBeUndefined();
    const action = matchActions(view).find(({ id }) => id === 'callLegend')!;
    expect(isReady(action.fields({ card: [called] }), { card: [called] })).toBe(false);
    const picks = { card: [called], payment: [source] };
    expect(isReady(action.fields(picks), picks)).toBe(true);
    const move = action.move(picks);
    const { state: paid } = issue(engine, active, move.move, move.args);
    const cards = (paid as FixtureState).G.cardIndex;
    expect(cards[called].meta).toMatchObject({ faceDown: false, spent: false });
    expect(cards[source].meta).toMatchObject({ faceDown: true, spent: true });
    expect(cards[eddie].meta.spent).toBe(false);
  });

  it('distinguishes ordinary Legend play from Go Solo and honours selected payments', () => {
    const { state, active } = paymentFixture();
    const solo = placeCard(state, active, 'v-corporate-exile', 'legendArea', true);
    const sources = Array.from({ length: 5 }, () => placeEddie(state, active));
    const ordinary = new LocalEngine(structuredClone(state));
    const ordinaryView = ordinary.getFilteredView(active);
    const play = matchActions(ordinaryView).find(({ id }) => id === 'playCard')!;
    const ordinaryPicks = { card: [solo], payment: sources };
    expect(isReady(play.fields(ordinaryPicks), ordinaryPicks)).toBe(true);
    const ordinaryMove = play.move(ordinaryPicks);
    const ordinaryState = issue(ordinary, active, ordinaryMove.move, ordinaryMove.args).state as FixtureState;
    expect(ordinaryState.G.cardIndex[solo]).toMatchObject({ zone: 'field', meta: { spent: true, hasLag: true } });

    const engine = new LocalEngine(state);
    const view = engine.getFilteredView(active);
    const action = matchActions(view).find(({ id }) => id === 'goSolo')!;
    const picks = { card: [solo], payment: sources };
    expect(isReady(action.fields(picks), picks)).toBe(true);
    const move = action.move(picks);
    const paid = issue(engine, active, move.move, move.args).state as FixtureState;
    expect(paid.G.cardIndex[solo]).toMatchObject({ zone: 'field', meta: { spent: false, hasLag: false } });
    expect(sources.every((id) => paid.G.cardIndex[id].meta.spent)).toBe(true);
  });

  it('pays separately for Alt Cunningham and the trash Program', () => {
    const { state, active } = paymentFixture();
    const alt = placeCard(state, active, 'alt-cunningham-soulkiller-architect', 'legendArea');
    const program = placeCard(state, active, 'floor-it', 'trash');
    const [drawn] = state.G.players[active].zones.deck;
    const [first, second, spare] = state.G.players[active].zones.legendArea;
    const engine = new LocalEngine(state);
    const view = engine.getFilteredView(active);
    const action = matchActions(view).find(({ id }) => id === 'activateAbility')!;
    const ability = action.fields({})[0].options.find(({ cardId, note }) => cardId === alt && note?.includes('Ability 2'))!;
    const activate = { ability: [ability.id], payment: [first] };
    expect(action.fields(activate).at(-1)?.options.map(({ id }) => id)).not.toContain(alt);
    const selected = action.move(activate);
    const rejected = engine.processCommand({ commandID: 'invalid-payment', move: selected.move,
      input: { args: { ...selected.args, paymentSourceIds: [alt] } } }, active);
    expect(rejected.success).toBe(false);
    expect(engine.getFilteredView(active).stateID).toBe(view.stateID);
    issue(engine, active, selected.move, selected.args);
    issue(engine, active, 'resolveEffectTarget', { targetIds: [program] });
    const pending = engine.getFilteredView(active);
    expect(pending.prompt.choice?.type).toBe('chooseCardToPlay');
    const effect = matchActions(pending).find((candidate) => candidate.fields({}).some(({ id }) => id === 'payment'))!;
    const pay = { payment: [second] };
    expect(isReady(effect.fields(pay), pay)).toBe(true);
    const move = effect.move(pay);
    issue(engine, active, move.move, move.args);
    const paid = engine.getState() as FixtureState;
    expect(paid.G.players[active].zones.deck.at(-1)).toBe(program);
    expect(paid.G.players[active].zones.hand).toContain(drawn);
    expect(paid.G.cardIndex[alt].meta.spent).toBe(true);
    expect(paid.G.cardIndex[first].meta.spent).toBe(true);
    expect(paid.G.cardIndex[second].meta.spent).toBe(true);
    expect(paid.G.cardIndex[spare].meta.spent).toBe(false);
  });

  it('resolves a Program before its payment Rippler and keeps the search private', () => {
    const { state, active, other } = paymentFixture();
    const host = placeCard(state, active, 'jackie-welles-mama-s-favorite', 'legendArea');
    const gear = placeCard(state, active, 'tetratronic-rippler', 'legendArea');
    state.G.cardIndex[host].meta.attachedGearIds.push(gear);
    state.G.cardIndex[gear].meta.attachedToId = host;
    const program = placeCard(state, active, 'floor-it', 'hand');
    const [drawn, next] = state.G.players[active].zones.deck;
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: program, paymentSourceIds: [host] });
    const view = engine.getFilteredView(active);
    expect((view.players[active].zones.hand as CardView[]).some(({ instanceId }) => instanceId === drawn)).toBe(true);
    expect(view.prompt.choice).toMatchObject({ type: 'scry', payload: { revealedCardIds: [next] } });
    const rivalView = engine.getFilteredView(other);
    expect(rivalView.prompt.choice).toBeNull();
    expect(rivalView.players[active].zones.deck).toBe(state.G.players[active].zones.deck.length - 1);
    expect(JSON.stringify(rivalView)).not.toContain(next);
    issue(engine, active, 'resolveScry', { destinations: [{ zone: 'trash', cardIds: [] }] });
    expect(engine.getState().G.players[active].zones.deck.at(0)).toBe(next);
  });

  it.each(['hand', 'trash'])('resolves Lizzy’s Program from %s and bottom-decks it before the older trigger', (origin) => {
    const { state, active, other } = paymentFixture();
    const lizzy = placeCard(state, active, 'lizzy-wizzy-delicate-weapon', 'hand');
    const program = placeCard(state, active, 'floor-it', origin);
    const host = placeCard(state, active, 'jackie-welles-mama-s-favorite', 'legendArea');
    const gear = placeCard(state, active, 'tetratronic-rippler', 'legendArea');
    state.G.cardIndex[host].meta.attachedGearIds.push(gear);
    state.G.cardIndex[gear].meta.attachedToId = host;
    const target = placeCard(state, other, 'corpo-security', 'field');
    const sources = [host, ...Array.from({ length: 4 }, () => placeEddie(state, active))];
    const [drawn, next] = state.G.players[active].zones.deck;
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: lizzy, paymentSourceIds: sources });
    issue(engine, active, 'resolveEffectTarget', { targetIds: [program] });
    expect(engine.getFilteredView(active).prompt.choice).toMatchObject({
      type: 'chooseTarget', payload: { eligibleIds: [target] },
    });
    for (const viewer of [active, other]) {
      expect(engine.getFilteredView(viewer).players[active].zones.resolvingProgram).toMatchObject([{ instanceId: program }]);
    }
    expect(engine.getState().G.players[active].zones.trash).not.toContain(program);
    const result = issue(engine, active, 'resolveEffectTarget', { targetIds: [target] });
    expect(result.gameEvents).toContainEqual(expect.objectContaining({
      type: 'cardMoved', cardId: program, fromZone: 'resolvingProgram', toZone: 'deck', deckPlacement: 'bottom',
    }));
    expect(engine.getState().G.players[active].zones.hand).toContain(drawn);
    expect(engine.getState().G.players[active].zones.deck.at(-1)).toBe(program);
    expect(engine.getFilteredView(active).prompt.choice).toMatchObject({
      type: 'scry', payload: { revealedCardIds: [next] },
    });
    issue(engine, active, 'resolveScry', { destinations: [{ zone: 'trash', cardIds: [] }] });
    expect(engine.getState().G.players[active].zones.deck.at(-1)).toBe(program);
  });

  it('offers explicit payment when reacting with a QUICK Program', () => {
    const { state, active, other } = rulesFixture();
    state.G.manualPaymentPlayerId = other;
    const attacker = placeCard(state, active, 'psycho-squad', 'field');
    const program = placeCard(state, other, 'floor-it', 'hand');
    const source = placeEddie(state, other);
    giveGig(state, other);
    const engine = new LocalEngine(state);
    issue(engine, active, 'attackRival', { attackerId: attacker });
    const view = engine.getFilteredView(other);
    expect(view.attackState?.step).toBe('react');
    const action = matchActions(view).find(({ id }) => id === 'playCard')!;
    const pay = { card: [program], payment: [source] };
    expect(isReady(action.fields(pay), pay)).toBe(true);
    const move = action.move(pay);
    issue(engine, other, move.move, move.args);
    let paid = engine.getState() as FixtureState;
    expect(paid.G.cardIndex[source].meta.spent).toBe(true);
    expect(paid.G.players[other].zones.resolvingProgram).toContain(program);
    expect(paid.G.players[other].zones.trash).not.toContain(program);
    issue(engine, other, 'resolveEffectTarget', { targetIds: [attacker] });
    paid = engine.getState() as FixtureState;
    expect(paid.G.players[other].zones.trash).toContain(program);
  });

  it('charges the chosen source when Jackie replaces a fight defeat', () => {
    const { state, active, other } = rulesFixture();
    state.G.manualPaymentPlayerId = other;
    const attacker = placeCard(state, active, 'field-operator', 'field');
    const defender = placeCard(state, other, 'corpo-security', 'field', true);
    const jackie = placeCard(state, other, 'jackie-welles-mama-s-favorite', 'legendArea');
    const source = placeEddie(state, other);
    const engine = new LocalEngine(state);
    issue(engine, active, 'attackUnit', { attackerId: attacker, defenderId: defender });
    let view = engine.getFilteredView(other);
    if (view.attackState?.step === 'react') {
      issue(engine, other, 'resolveAttack', { pass: true });
      view = engine.getFilteredView(other);
    }
    expect(view.prompt.choice?.type).toBe('redirectDefeat');
    const protect = matchActions(view).find(({ label }) => label.startsWith('Protect'))!;
    const pay = { payment: [source] };
    expect(isReady(protect.fields(pay), pay)).toBe(true);
    const move = protect.move(pay);
    issue(engine, other, move.move, move.args);
    const paid = engine.getState() as FixtureState;
    expect(paid.G.cardIndex[source].meta.spent).toBe(true);
    expect(paid.G.players[other].zones.field).toContain(defender);
    expect(paid.G.players[other].zones.removedFromGame).toContain(jackie);
  });

  it('lets Jackie save the chosen Unit when he is also in a mass defeat', () => {
    const { state, active, other } = paymentFixture();
    state.G.manualPaymentPlayerId = other;
    const jackie = placeCard(state, other, 'jackie-welles-mama-s-favorite', 'field');
    const first = placeCard(state, other, 'corpo-security', 'field');
    const second = placeCard(state, other, 'field-operator', 'field');
    const source = placeEddie(state, other);
    const smasher = placeCard(state, active, 'adam-smasher-metal-over-meat', 'hand');
    for (let i = 0; i < 9; i++) placeEddie(state, active);
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: smasher });
    const view = engine.getFilteredView(other);
    expect(view.prompt.choice).toMatchObject({ type: 'redirectDefeat', payload: { replacementCardId: jackie, protectedCardId: first } });
    const protect = matchActions(view).find(({ label }) => label === 'Protect a Unit')!;
    const picks = { protected: [second], payment: [source] };
    expect(isReady(protect.fields(picks), picks)).toBe(true);
    const move = protect.move(picks);
    issue(engine, other, move.move, move.args);
    const zones = engine.getState().G.players[other].zones;
    expect(zones.field).toEqual([second]);
    expect(zones.trash).toContain(first);
    expect(zones.removedFromGame).toContain(jackie);
  });

  it('advances the turn after Jackie replaces Cyberpsychosis’s delayed defeat', () => {
    const { state, active, other } = paymentFixture();
    const jackie = placeCard(state, active, 'jackie-welles-mama-s-favorite', 'legendArea');
    const nomad = placeCard(state, active, 'riding-nomad', 'field');
    equipFixture(state, nomad, placeCard(state, active, 'mantis-blades', 'field'));
    const target = placeCard(state, other, 'field-operator', 'field', true);
    const program = placeCard(state, active, 'cyberpsychosis', 'hand');
    for (const id of state.G.players[other].zones.legendArea) state.G.cardIndex[id].meta.spent = true;
    state.G.players[other].zones.hand = [];
    for (let i = 0; i < 4; i++) placeEddie(state, active);
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: program });
    issue(engine, active, 'resolveEffectTarget', { targetIds: [nomad] });
    issue(engine, active, 'attackUnit', { attackerId: nomad, defenderId: target });
    issue(engine, active, 'passPhase');
    expect(engine.getFilteredView(active).prompt.choice).toMatchObject({
      type: 'redirectDefeat', payload: { replacementCardId: jackie, protectedCardId: nomad },
    });
    issue(engine, active, 'resolveRedirectDefeat');
    expect(engine.getFilteredView(active).activePlayerId).toBe(other);
    expect(engine.getState().G.players[active].zones.field).toContain(nomad);
    expect(engine.getState().G.players[active].zones.removedFromGame).toContain(jackie);
  });

  it.each([
    'afterparty-at-lizzie-s', 'bonnie-and-clyde', 'industrial-assembly', 'memory-relapse', 'peace-offering', 'trust-no-one',
  ])('allows %s to be played with no target for its effect', (slug) => {
    const { state, active, other } = paymentFixture();
    for (const seat of [active, other]) {
      const player = state.G.players[seat];
      for (const id of player.gigArea.splice(0)) {
        state.G.gigDice[id].location = 'fixerArea';
        player.fixerArea.push(id);
      }
    }
    const program = placeCard(state, active, slug, 'hand');
    for (let i = 0; i < 5; i++) placeEddie(state, active);
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: program });
    expect(engine.getState().G.players[active].zones.trash).toContain(program);
    expect(engine.getFilteredView(active).prompt.choice).toBeNull();
  });

  it.each(['player', 'rival'] as const)('requires a Three Mouths choice and hides the search from the other seat when %s plays it', (seat) => {
    const { state, other } = rulesFixture(seat);
    const program = placeCard(state, seat, 'three-mouths-one-desire', 'hand');
    for (let i = 0; i < 2; i++) placeEddie(state, seat);
    const [kept, ...rest] = state.G.players[seat].zones.deck.slice(0, 3);
    const engine = new LocalEngine(state);
    issue(engine, seat, 'playCard', { cardId: program });
    const ownerView = engine.getFilteredView(seat);
    const rivalView = engine.getFilteredView(other);
    expect(ownerView.prompt.choice).toMatchObject({ type: 'scry', payload: { revealedCardIds: [kept, ...rest] } });
    expect(rivalView.prompt.choice).toBeNull();
    expect(rivalView.players[seat].zones.resolvingProgram).toMatchObject([{ instanceId: program }]);
    for (const id of [kept, ...rest]) expect(JSON.stringify(rivalView)).not.toContain(id);
    const search = matchActions(ownerView)[0];
    expect(isReady(search.fields({}), {})).toBe(false);
    const picks = { '0': [kept] };
    const move = search.move(picks);
    issue(engine, seat, move.move, move.args);
    expect(engine.getState().G.players[seat].zones.hand).toContain(kept);
    expect(engine.getState().G.players[seat].zones.deck.slice(-2).sort()).toEqual(rest.sort());
    for (const id of [kept, ...rest]) expect(JSON.stringify(engine.getFilteredView(other))).not.toContain(id);
  });

  it('projects Three Mouths through the worker without exposing the rival’s search', () => {
    const rival = prepareMatchDeck(deckFromRecommended('lowball-netrun-plus')!);
    let sequence = 0;
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `worker-private-12-${sequence++}` as ReturnType<typeof crypto.randomUUID>,
    );
    try {
      const respond = createMatchController();
      let response = respond({ id: 0, action: { type: 'start', setup: { player: rival, rival } } });
      const rng = new SeededRNG('worker-player');
      let playerSearch = false;
      let rivalSearch = false;
      for (let id = 1; id <= 100 && !(playerSearch && rivalSearch); id++) {
        if (!('snapshot' in response)) throw new Error(response.error);
        const { view, log, matchId } = response.snapshot;
        const payload = view.prompt.choice?.payload as { source?: { displayName?: string }; revealedCardIds?: string[] } | undefined;
        expect(typeof view.players.rival.zones.hand).toBe('number');
        expect(typeof view.players.rival.zones.deck).toBe('number');
        if (view.prompt.choice?.type === 'scry' && payload?.source?.displayName?.includes('Three Mouths')) {
          expect(payload.revealedCardIds).toHaveLength(3);
          expect(view.prompt.choice.chooserId).toBe('player');
          playerSearch = true;
        }
        rivalSearch ||= log.some(({ seat, text }) => seat === 'rival' && text.includes('Three Mouths'));
        const move = chooseMove(view, () => rng.next(), 'player');
        if (view.gameEnded || !move) break;
        response = respond({ id, action: { type: 'move', matchId, stateID: view.stateID, move } });
      }
      expect({ playerSearch, rivalSearch }).toEqual({ playerSearch: true, rivalSearch: true });
    } finally {
      uuid.mockRestore();
    }
  });

  it('lets Floor It select a Unit with zero power', () => {
    const { state, active, other } = paymentFixture();
    const program = placeCard(state, active, 'floor-it', 'hand');
    const misty = placeCard(state, other, 'misty-olszewski-mender-of-broken-spirits', 'field');
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: program });
    expect(engine.getFilteredView(active).prompt.choice).toMatchObject({ type: 'chooseTarget', payload: { eligibleIds: [misty] } });
    issue(engine, active, 'resolveEffectTarget', { targetIds: [misty] });
    expect(engine.getState().G.players[active].zones.trash).toContain(program);
  });

  it('triggers Gorilla Arms once for a simultaneous two-Gig steal', () => {
    const { state, active, other } = paymentFixture();
    const unit = placeCard(state, active, 'modded-kusanagi', 'field');
    const gear = placeCard(state, active, 'gorilla-arms', 'field');
    state.G.cardIndex[unit].meta.attachedGearIds.push(gear);
    state.G.cardIndex[gear].meta.attachedToId = unit;
    const rival = state.G.players[other];
    for (const id of rival.zones.legendArea) state.G.cardIndex[id].meta.spent = true;
    rival.zones.hand = [];
    const dice = rival.fixerArea.splice(0, 4);
    for (const [index, id] of dice.entries()) {
      state.G.gigDice[id].location = 'gigArea';
      state.G.gigDice[id].faceValue = index + 1;
      rival.gigArea.push(id);
    }
    const engine = new LocalEngine(state);
    issue(engine, active, 'attackRival', { attackerId: unit });
    expect(engine.getFilteredView(active).prompt.choice).toMatchObject({ type: 'chooseGigsToSteal', payload: { count: 2 } });
    issue(engine, active, 'resolveStealGigs', { dieIds: dice.slice(0, 2) });
    const followup = engine.getFilteredView(active).prompt.choice;
    expect(followup?.type).toBe('chooseTarget');
    const { eligibleIds } = followup!.payload as { eligibleIds: string[] };
    issue(engine, active, 'resolveEffectTarget', { targetIds: [eligibleIds[0]] });
    expect(engine.getFilteredView(active).prompt.choice).toBeNull();
    expect((engine.getState() as FixtureState).G.players[other].gigArea).toHaveLength(1);
  });

  it('keeps the Fixer d20 outside Over the Edge’s eligible Gigs', () => {
    const { state, active, other } = paymentFixture();
    const program = placeCard(state, active, 'over-the-edge', 'hand');
    const target = placeCard(state, other, 'corpo-security', 'field');
    const engine = new LocalEngine(state);
    expect((engine.getFilteredView(active).players[active].zones.fixerArea as CardView[])
      .some(({ definitionId }) => definitionId === 'd20')).toBe(true);
    issue(engine, active, 'playCard', { cardId: program });
    expect(engine.getFilteredView(active).prompt.choice).toBeNull();
    expect(engine.getState().G.players[other].zones.field).toContain(target);
  });

  it('discounts Viktor’s first Cyberware payment without changing its printed cost', () => {
    const { state, active } = paymentFixture();
    const viktor = placeCard(state, active, 'viktor-vektor-drop-your-illusions', 'hand');
    const gear = placeCard(state, active, 'zetatech-berserk', 'hand');
    for (let i = 0; i < 8; i++) placeEddie(state, active);
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: viktor });
    const view = engine.getFilteredView(active);
    expect(view.prompt.payment?.costs.playCard[gear]).toEqual({ amount: 3 });
    expect((view.players[active].zones.hand as CardView[]).find(({ instanceId }) => instanceId === gear))
      .toMatchObject({ cost: 6, effectiveCost: 3 });
    issue(engine, active, 'playCard', { cardId: gear, attachToId: viktor });
    expect((engine.getFilteredView(active).players[active].zones.field as CardView[]).find(({ instanceId }) => instanceId === gear)?.cost).toBe(6);
  });

  it.each(['return-first', 'defeat-first', 'fight-first'])('resolves Cyberpsychosis and Kusanagi in order %s', (order) => {
    const { state, active, other } = paymentFixture();
    const affected = order !== 'fight-first';
    const unit = placeCard(state, active, affected ? 'modded-kusanagi' : 'field-operator', 'field');
    const gear = placeCard(state, active, 'zetatech-berserk', 'field');
    state.G.cardIndex[unit].meta.attachedGearIds.push(gear);
    state.G.cardIndex[gear].meta.attachedToId = unit;
    const defender = placeCard(state, other, 'corpo-security', 'field', true);
    for (const id of state.G.players[other].zones.legendArea) state.G.cardIndex[id].meta.spent = true;
    state.G.players[other].zones.hand = [];
    const program = placeCard(state, active, 'cyberpsychosis', 'hand');
    const engine = new LocalEngine(state);
    const applyProgram = () => {
      issue(engine, active, 'playCard', { cardId: program });
      issue(engine, active, 'resolveEffectTarget', { targetIds: [unit] });
    };
    if (affected) applyProgram();
    issue(engine, active, 'attackUnit', { attackerId: unit, defenderId: defender });
    if (!affected) applyProgram();
    issue(engine, active, 'passPhase');
    if (affected) {
      const choice = engine.getFilteredView(active).prompt.choice;
      expect(choice?.type).toBe('chooseTrigger');
      const { options } = choice!.payload as { options: { triggerId: string; sourceCardId: string }[] };
      const first = options.find(({ sourceCardId }) => sourceCardId === (order === 'return-first' ? unit : program))!;
      issue(engine, active, 'resolveTrigger', { triggerId: first.triggerId });
      const zones = engine.getState().G.players[active].zones;
      expect(order === 'return-first' ? zones.hand : zones.trash).toEqual(expect.arrayContaining([unit, gear]));
    } else {
      expect(engine.getState().G.players[active].zones.field).toContain(unit);
      expect(engine.getState().G.players[active].zones.trash).not.toContain(unit);
    }
  });

  it('checks deck-out at the draw rather than before the turn starts', () => {
    const { state, active, other } = rulesFixture();
    const zones = state.G.players[other].zones;
    for (const id of zones.deck.splice(0)) {
      state.G.cardIndex[id].zone = 'trash';
      zones.trash.push(id);
    }
    const engine = new LocalEngine(state);
    const result = issue(engine, active, 'passPhase');
    const eventTypes = result.gameEvents.map(({ type }) => type as string);
    expect(eventTypes).toContain('turnStarted');
    expect(eventTypes.indexOf('gameEnded')).toBeGreaterThan(eventTypes.indexOf('turnStarted'));
    expect(engine.getFilteredView(active)).toMatchObject({ gameEnded: true, winnerId: active, winReason: 'deck_out_victory' });
  });

  it('ends an attack when a pending Yorinobu draw would draw from an empty deck', () => {
    const { state, active, other } = rulesFixture();
    const legend = placeCard(state, active, 'yorinobu-arasaka-embracing-destruction', 'legendArea');
    const attacker = placeCard(state, active, 'goro-takemura-losing-his-way', 'field');
    const zones = state.G.players[active].zones;
    for (const id of zones.deck.splice(0)) {
      state.G.cardIndex[id].zone = 'trash';
      zones.trash.push(id);
    }
    giveGig(state, other);
    const engine = new LocalEngine(state);
    issue(engine, active, 'attackRival', { attackerId: attacker });
    const choice = engine.getFilteredView(active).prompt.choice;
    if (choice?.type === 'chooseTrigger') {
      const { options } = choice.payload as { options: { triggerId: string; sourceCardId: string }[] };
      const trigger = options.find(({ sourceCardId }) => sourceCardId === legend)!;
      issue(engine, active, 'resolveTrigger', { triggerId: trigger.triggerId });
    }
    expect(engine.getFilteredView(active)).toMatchObject({ gameEnded: true, winnerId: other, winReason: 'deck_out_victory' });
    expect(engine.getFilteredView(other).prompt.availableMoves).toHaveLength(0);
  });

  it.each(['kerry-eurodyne-the-last-rockerboy', 'field-operator'])('stacks Johnny and Gunpoint on a newly played %s', (slug) => {
    const { state, active, other } = paymentFixture();
    state.G.players[active].zones.hand = [];
    const johnny = placeCard(state, active, 'johnny-silverhand-rocking-renegade', 'legendArea');
    const unit = placeCard(state, active, slug, 'hand');
    const gunpoint = placeCard(state, active, 'gunpoint-diplomacy', 'hand');
    const defender = placeCard(state, other, 'corpo-security', 'field');
    const gear = placeCard(state, other, 'zetatech-berserk', 'field');
    equipFixture(state, defender, gear);
    equipFixture(state, johnny, placeCard(state, active, 'tetratronic-rippler', 'legendArea'));
    for (let i = 0; i < 14; i++) placeEddie(state, active);
    giveGig(state, other);
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: unit });
    issue(engine, active, 'activateAbility', { cardId: johnny, abilityIndex: 0 });
    if (engine.getFilteredView(active).prompt.choice?.type === 'chooseTarget') {
      issue(engine, active, 'resolveEffectTarget', { targetIds: [unit] });
    }
    expect((engine.getFilteredView(active).players[active].zones.field as CardView[])
      .find(({ instanceId }) => instanceId === unit)?.grantedRules).toContain('canAttackOnPlayedTurnAgainstUnits');
    expect(engine.getFilteredView(active).prompt.choice?.type).toBe('scry');
    issue(engine, active, 'resolveScry', { destinations: [{ zone: 'trash', cardIds: [] }] });
    expect(rejectedMove(engine, active, 'attackUnit', { attackerId: unit, defenderId: defender })).toBe(true);
    issue(engine, active, 'playCard', { cardId: gunpoint });
    if (engine.getFilteredView(active).prompt.choice?.type === 'chooseTarget') {
      issue(engine, active, 'resolveEffectTarget', { targetIds: [unit] });
    }
    const effect = engine.getFilteredView(active).prompt.choice;
    if (effect?.type === 'chooseEffect') {
      const { options } = effect.payload as { options: { id: string }[] };
      const ready = options.find(({ id }) => id === 'both' || id === 'ready-attack')!;
      issue(engine, effect.chooserId as Seat, 'resolveChooseEffect', { optionId: ready.id });
    }
    const { prompt } = engine.getFilteredView(active);
    const attack = prompt.availableMoves.find(({ moveId }) => moveId === 'attackUnit')!;
    expect(attack.inputSpec.fromCandidates).toContain(unit);
    expect(attack.inputSpec.toCandidates).toContain(defender);
    expect(attack.inputSpec.toCandidates).not.toContain(gear);
    expect(rejectedMove(engine, active, 'attackUnit', { attackerId: unit, defenderId: gear })).toBe(true);
    expect(rejectedMove(engine, active, 'attackRival', { attackerId: unit })).toBe(true);
    issue(engine, active, 'attackUnit', { attackerId: unit, defenderId: defender });
    expect((engine.getFilteredView(active).players[active].zones.field as CardView[])
      .find(({ instanceId }) => instanceId === unit)?.grantedRules).not.toContain('canAttackReadyUnits');
  });

  it('lets a pending Faceplate effect resolve after Panam moves the Gear', () => {
    const { state, active } = paymentFixture();
    const panam = placeCard(state, active, 'panam-palmer-nomad-cavalry', 'legendArea');
    const faceplate = placeCard(state, active, 'zetatech-faceplate', 'legendArea');
    const host = placeCard(state, active, 'field-operator', 'field', true);
    equipFixture(state, panam, faceplate);
    const [die] = state.G.players[active].gigArea;
    state.G.gigDice[die].faceValue = 2;
    const engine = new LocalEngine(state);
    issue(engine, active, 'activateAbility', { cardId: panam, abilityIndex: 0 });
    expect(engine.getFilteredView(active).prompt.choice).toMatchObject({
      type: 'chooseTarget', payload: { eligibleIds: [faceplate] },
    });
    issue(engine, active, 'resolveEffectTarget', { targetIds: [faceplate] });
    const moved = engine.getState() as FixtureState;
    expect(moved.G.cardIndex[faceplate].meta.attachedToId).toBe(host);
    expect(moved.G.cardIndex[host].meta.spent).toBe(false);
    expect(engine.getFilteredView(active).prompt.choice).toMatchObject({ type: 'chooseTarget' });
    issue(engine, active, 'resolveAdjustGig', { kind: 'adjust', dieId: die, value: 3 });
    expect((engine.getState() as FixtureState).G.gigDice[die].faceValue).toBe(3);
  });

  it('finishes the Overwatch activation before the Faceplate it triggered', () => {
    const { state, active, other } = paymentFixture();
    state.G.players[active].zones.hand = [];
    const discard = placeCard(state, active, 'bonnie-and-clyde', 'hand');
    const host = placeCard(state, active, 'field-operator', 'field');
    const overwatch = placeCard(state, active, 'overwatch-panam-s-gift', 'field');
    const faceplate = placeCard(state, active, 'zetatech-faceplate', 'field');
    const defender = placeCard(state, other, 'corpo-security', 'field', true);
    equipFixture(state, host, overwatch);
    equipFixture(state, host, faceplate);
    const [die] = state.G.players[active].gigArea;
    state.G.gigDice[die].faceValue = 2;
    const engine = new LocalEngine(state);
    issue(engine, active, 'activateAbility', { cardId: overwatch, abilityIndex: 1 });
    let choice = engine.getFilteredView(active).prompt.choice;
    if (choice?.type === 'chooseTarget' && (choice.payload as { eligibleIds?: string[] }).eligibleIds?.includes(discard)) {
      issue(engine, active, 'resolveEffectTarget', { targetIds: [discard] });
      choice = engine.getFilteredView(active).prompt.choice;
    }
    if (choice?.type === 'chooseTarget' && (choice.payload as { eligibleIds?: string[] }).eligibleIds?.includes(defender)) {
      issue(engine, active, 'resolveEffectTarget', { targetIds: [defender] });
    }
    expect(engine.getState().G.players[active].zones.trash).toContain(discard);
    expect(engine.getState().G.players[other].zones.trash).toContain(defender);
    expect(engine.getFilteredView(active).prompt.availableMoves.some(({ moveId }) => moveId === 'resolveAdjustGig')).toBe(true);
    issue(engine, active, 'resolveAdjustGig', { kind: 'adjust', dieId: die, value: 3 });
    expect((engine.getState() as FixtureState).G.gigDice[die].faceValue).toBe(3);
  });

  it.each([false, true])('keeps Muamar’s fight protection separate from effect defeat (effect %s)', (effect) => {
    const { state, active, other } = paymentFixture();
    const muamar = placeCard(state, active, 'muamar-reyes-el-capita-n', 'legendArea');
    state.G.cardIndex[muamar].meta.faceDown = true;
    const unit = placeCard(state, active, effect ? 'field-operator' : 'offduty-malfini', 'field');
    const defender = placeCard(state, other, effect ? 'maelstrom-zealots' : 'field-operator', 'field', true);
    if (!effect) equipFixture(state, defender, placeCard(state, other, 'zetatech-berserk', 'field'));
    for (const id of state.G.players[other].zones.legendArea) state.G.cardIndex[id].meta.spent = true;
    state.G.players[other].zones.hand = [];
    const engine = new LocalEngine(state);
    issue(engine, active, 'callLegend', { legendId: muamar });
    issue(engine, active, 'resolveChooseEffect', { optionId: 'protect' });
    issue(engine, active, 'resolveEffectTarget', { targetIds: [unit] });
    expect((engine.getFilteredView(active).players[active].zones.field as CardView[])
      .find(({ instanceId }) => instanceId === unit)?.grantedRules).toContain('cantBeDefeatedInFight');
    issue(engine, active, 'attackUnit', { attackerId: unit, defenderId: defender });
    expect(engine.getState().G.players[active].zones[effect ? 'trash' : 'field']).toContain(unit);
  });

  it.each(['up', 'down', 'none'])('evaluates Goro’s Legend condition once at resolution (%s)', (orientation) => {
    const { state, active, other } = paymentFixture();
    const account = state.G.players[active];
    const goro = placeCard(state, active, 'goro-takemura-losing-his-way', 'field');
    for (const id of account.zones.legendArea) state.G.cardIndex[id].meta.faceDown = orientation === 'down';
    if (orientation === 'none') {
      for (const id of account.zones.legendArea.splice(0)) {
        state.G.cardIndex[id].zone = 'removedFromGame';
        account.zones.removedFromGame.push(id);
      }
    }
    giveGig(state, other);
    const engine = new LocalEngine(state);
    issue(engine, active, 'attackRival', { attackerId: goro });
    const expected = orientation === 'up' ? 9 : 4;
    const power = (match: LocalEngine) => (match.getFilteredView(active).players[active].zones.field as CardView[])
      .find(({ instanceId }) => instanceId === goro)?.effectivePower;
    expect(power(engine)).toBe(expected);
    const after = structuredClone(engine.getState()) as FixtureState;
    for (const id of after.G.players[active].zones.legendArea) {
      after.G.cardIndex[id].meta.faceDown = orientation === 'up';
    }
    expect(power(new LocalEngine(after))).toBe(expected);
  });

  it('lets Nadia attack when the Gig count changes after she was played', () => {
    const { state, active, other } = paymentFixture();
    const nadia = placeCard(state, active, 'nadia-fighting-through-grief', 'hand');
    const sale = placeCard(state, active, 'floor-it', 'hand');
    for (let i = 0; i < 6; i++) placeEddie(state, active);
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: nadia });
    expect(rejectedMove(engine, active, 'attackRival', { attackerId: nadia })).toBe(true);
    const changed = structuredClone(engine.getState()) as FixtureState;
    const [gig] = changed.G.players[active].gigArea.splice(0, 1);
    changed.G.players[other].gigArea.push(gig);
    changed.G.gigDice[gig].ownerId = other;
    const later = new LocalEngine(changed);
    issue(later, active, 'sellCard', { cardId: sale });
    expect(later.getFilteredView(active).prompt.availableMoves.find(({ moveId }) => moveId === 'attackRival')
      ?.inputSpec.candidates).toContain(nadia);
    issue(later, active, 'attackRival', { attackerId: nadia });
  });

  it.each([0, 1])('readies five equipped friendlies for Panam, including %s Legend', (legendCount) => {
    const { state, active } = paymentFixture();
    const panam = placeCard(state, active, 'panam-palmer-nomad-cavalry', 'legendArea', true);
    const units = Array.from({ length: 5 - legendCount }, () => placeCard(state, active, 'field-operator', 'field', true));
    const hosts = legendCount ? [panam, ...units] : units;
    for (const id of hosts) equipFixture(state, id, placeCard(state, active, 'zetatech-berserk', state.G.cardIndex[id].zone));
    const engine = new LocalEngine(state);
    issue(engine, active, 'passPhase');
    const after = engine.getState() as FixtureState;
    expect(hosts.every((id) => !after.G.cardIndex[id].meta.spent)).toBe(true);
  });

  it('counts Panam’s face-up Legends in the crew and on the field', () => {
    const { state, active, other } = paymentFixture();
    state.G.players[active].zones.hand = [];
    const panam = placeCard(state, active, 'panam-palmer-strength-through-family', 'field');
    placeCard(state, active, 'v-corporate-exile', 'field');
    placeCard(state, active, 'jackie-welles-mama-s-favorite', 'legendArea');
    const discard = placeCard(state, active, 'floor-it', 'hand');
    const [top, next, third] = state.G.players[active].zones.deck;
    giveGig(state, other);
    const engine = new LocalEngine(state);
    issue(engine, active, 'attackRival', { attackerId: panam });
    const choice = engine.getFilteredView(active).prompt.choice;
    if (choice?.type === 'chooseTarget') issue(engine, active, 'resolveDiscardFromHand', { cardIds: [discard] });
    const zones = engine.getState().G.players[active].zones;
    expect(zones.hand).toEqual([top, next]);
    expect(zones.deck[0]).toBe(third);
    expect(zones.trash).toContain(discard);
  });

  it('lets Rippler resolve before React and lets the player order it alongside an Attack effect', () => {
    const { state, active, other } = paymentFixture();
    const goro = placeCard(state, active, 'goro-takemura-losing-his-way', 'field');
    const rippler = placeCard(state, active, 'tetratronic-rippler', 'field');
    equipFixture(state, goro, rippler);
    for (const id of state.G.players[active].zones.legendArea) state.G.cardIndex[id].meta.faceDown = false;
    const [top] = state.G.players[active].zones.deck;
    giveGig(state, other);
    const engine = new LocalEngine(state);
    issue(engine, active, 'attackRival', { attackerId: goro });
    const pending = engine.getFilteredView(active);
    expect(pending.attackState?.step).toBe('attack');
    expect(pending.prompt.choice?.type).toBe('chooseTrigger');
    const { options } = pending.prompt.choice!.payload as { options: { triggerId: string; sourceCardId: string }[] };
    expect(options.map(({ sourceCardId }) => sourceCardId)).toEqual(expect.arrayContaining([goro, rippler]));
    const first = options.find(({ sourceCardId }) => sourceCardId === rippler)!;
    issue(engine, active, 'resolveTrigger', { triggerId: first.triggerId });
    expect(engine.getFilteredView(active).prompt.choice).toMatchObject({ type: 'scry', payload: { revealedCardIds: [top] } });
    expect(engine.getFilteredView(other).prompt.choice).toBeNull();
    expect(engine.getFilteredView(active).attackState?.step).toBe('attack');
    issue(engine, active, 'resolveScry', { destinations: [{ zone: 'trash', cardIds: [top] }] });
    expect(engine.getState().G.players[active].zones.trash).toContain(top);
    expect((engine.getFilteredView(active).players[active].zones.field as CardView[])
      .find(({ instanceId }) => instanceId === goro)?.effectivePower).toBe(10);
  });

  it('cannot force Misty to attack even when Mox Inciters marks her', () => {
    const { state, active, other } = paymentFixture();
    const misty = placeCard(state, other, 'misty-olszewski-mender-of-broken-spirits', 'field');
    const mox = placeCard(state, active, 'mox-inciters', 'hand');
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: mox });
    if (engine.getFilteredView(active).prompt.choice?.type === 'chooseTarget') {
      issue(engine, active, 'resolveEffectTarget', { targetIds: [misty] });
    }
    issue(engine, active, 'passPhase');
    const gig = engine.getFilteredView(other).prompt.choice;
    if (gig?.type === 'gainGig') {
      const { allowedDieIds } = gig.payload as { allowedDieIds: string[] };
      issue(engine, other, 'gainGig', { dieId: allowedDieIds[0] });
    }
    const view = engine.getFilteredView(other);
    expect((view.players[other].zones.field as CardView[]).find(({ instanceId }) => instanceId === misty)?.grantedRules)
      .toEqual(expect.arrayContaining(['mustAttack', 'cantAttack']));
    expect(rejectedMove(engine, other, 'attackRival', { attackerId: misty })).toBe(true);
    expect(view.prompt.availableMoves.some(({ moveId }) => moveId === 'passPhase')).toBe(true);
  });

  it('leaves an empty rival Gig area out of attack targets and must-attack obligations', () => {
    const { state, active, other } = paymentFixture();
    const unit = placeCard(state, other, 'field-operator', 'field');
    const mox = placeCard(state, active, 'mox-inciters', 'hand');
    const turn = new LocalEngine(state);
    issue(turn, active, 'playCard', { cardId: mox });
    if (turn.getFilteredView(active).prompt.choice?.type === 'chooseTarget') {
      issue(turn, active, 'resolveEffectTarget', { targetIds: [unit] });
    }
    issue(turn, active, 'passPhase');
    const gig = turn.getFilteredView(other).prompt.choice;
    if (gig?.type === 'gainGig') {
      const { allowedDieIds } = gig.payload as { allowedDieIds: string[] };
      issue(turn, other, 'gainGig', { dieId: allowedDieIds[0] });
    }
    const noGigs = structuredClone(turn.getState()) as FixtureState;
    const opponent = noGigs.G.players[active];
    for (const id of opponent.gigArea.splice(0)) {
      noGigs.G.gigDice[id].location = 'fixerArea';
      opponent.fixerArea.push(id);
    }
    const engine = new LocalEngine(noGigs);
    const { availableMoves } = engine.getFilteredView(other).prompt;
    expect(availableMoves.some(({ moveId }) => moveId === 'attackRival')).toBe(false);
    expect(availableMoves.some(({ moveId }) => moveId === 'passPhase')).toBe(true);
    expect(rejectedMove(engine, other, 'attackRival', { attackerId: unit })).toBe(true);
  });

  it.each([
    'adrenaline-converter', 'arasaka-emergency-radioport', 'deadman-transmitter',
    'dying-night-v-s-pistol', 'mantis-blades', 'zetatech-berserk',
  ])('keeps %s tags on the Gear when equipped to a Unit or Legend', (slug) => {
    const { state, active } = paymentFixture();
    const hosts = [
      placeCard(state, active, 'field-operator', 'field'),
      placeCard(state, active, 'v-corporate-exile', 'legendArea'),
    ];
    const gears = hosts.map(() => placeCard(state, active, slug, 'hand'));
    for (let i = 0; i < 14; i++) placeEddie(state, active);
    const engine = new LocalEngine(state);
    const projected = () => Object.values(engine.getFilteredView(active).players[active].zones)
      .flatMap((zone) => Array.isArray(zone) ? zone : []);
    for (const [i, host] of hosts.entries()) {
      const before = projected().find(({ instanceId }) => instanceId === host)! as CardView & { classifications: string[] };
      const gear = projected().find(({ instanceId }) => instanceId === gears[i])! as CardView & { classifications: string[] };
      expect(gear.classifications.some((tag) => !before.classifications.includes(tag))).toBe(true);
      issue(engine, active, 'playCard', { cardId: gears[i], attachToId: host });
      expect(projected().find(({ instanceId }) => instanceId === host)).toMatchObject({ classifications: before.classifications });
      expect(projected().find(({ instanceId }) => instanceId === gears[i])).toMatchObject({
        classifications: gear.classifications, attachedToId: host,
      });
    }
  });

  it.each(['rogue-amendiares-preem-solo', 'royce-psycho-on-the-edge'])('leaves Gear in trash when the defeated Legend %s is removed', (slug) => {
    const { state, active, other } = paymentFixture();
    const legend = placeCard(state, other, slug, 'field');
    const gear = placeCard(state, other, 'zetatech-berserk', 'field');
    equipFixture(state, legend, gear);
    const smasher = placeCard(state, active, 'adam-smasher-metal-over-meat', 'hand');
    for (let i = 0; i < 9; i++) placeEddie(state, active);
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: smasher });
    const after = engine.getState() as FixtureState;
    expect(after.G.players[other].zones.removedFromGame).toContain(legend);
    expect(after.G.players[other].zones.trash).toContain(gear);
    expect(after.G.cardIndex[gear].meta.attachedToId).toBeNull();
  });

  it('lets a Voodoo Boy with Adrenaline attack after a Program once MaxTac leaves', () => {
    const { state, active, other } = paymentFixture();
    const boy = placeCard(state, active, 'jacked-in-voodoo-boy', 'hand');
    const first = placeCard(state, active, 'bonnie-and-clyde', 'hand');
    const defeat = placeCard(state, active, 'wild-in-the-streets', 'hand');
    const converter = placeCard(state, active, 'adrenaline-converter', 'hand');
    const maxTac = placeCard(state, other, 'maxtac-suppression-team', 'field', true);
    const rival = state.G.players[other];
    for (const id of rival.fixerArea.splice(0, 3)) {
      state.G.gigDice[id].location = 'gigArea';
      state.G.gigDice[id].faceValue = 1;
      rival.gigArea.push(id);
    }
    for (let i = 0; i < 14; i++) placeEddie(state, active);
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: first });
    issue(engine, active, 'playCard', { cardId: boy });
    issue(engine, active, 'playCard', { cardId: converter, attachToId: boy });
    expect(rejectedMove(engine, active, 'attackRival', { attackerId: boy })).toBe(true);
    issue(engine, active, 'playCard', { cardId: defeat });
    if (engine.getFilteredView(active).prompt.choice?.type === 'chooseTarget') {
      issue(engine, active, 'resolveEffectTarget', { targetIds: [maxTac] });
    }
    expect(engine.getState().G.players[other].zones.trash).toContain(maxTac);
    issue(engine, active, 'attackRival', { attackerId: boy });
  });

  it.each(['oda', 'steel-dragon'])('allows played-turn Unit attacks only against spent targets for %s', (source) => {
    const { state, active, other } = paymentFixture();
    state.G.players[active].zones.hand = [];
    const card = placeCard(state, active, source === 'oda' ? 'sandayu-oda-hanako-s-guardian' : 'yorinobu-arasaka-steel-dragon', 'hand');
    const attacker = source === 'oda' ? card : placeCard(state, active, 'delamain-cab', 'hand');
    const ready = placeCard(state, other, 'corpo-security', 'field');
    const spent = placeCard(state, other, 'field-operator', 'field', true);
    for (let i = 0; i < 7; i++) placeEddie(state, active);
    const engine = new LocalEngine(state);
    issue(engine, active, 'playCard', { cardId: card });
    if (source === 'steel-dragon') issue(engine, active, 'resolveEffectTarget', { targetIds: [attacker] });
    expect(rejectedMove(engine, active, 'attackUnit', { attackerId: attacker, defenderId: ready })).toBe(true);
    issue(engine, active, 'attackUnit', { attackerId: attacker, defenderId: spent });
  });

  it('applies fight defeat before a fight-loss ability defeats the opposing Unit', () => {
    const { state, active, other } = rulesFixture();
    const attacker = placeCard(state, active, 'maelstrom-zealots', 'field');
    const defender = placeCard(state, other, 'corpo-security', 'field', true);
    for (const id of state.G.players[other].zones.legendArea) state.G.cardIndex[id].meta.spent = true;
    state.G.players[other].zones.hand = [];
    const engine = new LocalEngine(state);
    const result = issue(engine, active, 'attackUnit', { attackerId: attacker, defenderId: defender });
    const defeated = result.gameEvents.filter((event) => (event.type as string) === 'cardDefeated')
      .map((event) => (event as unknown as { cardId: string }).cardId);
    expect(defeated).toEqual([attacker, defender]);
    expect(engine.getFilteredView(active).attackState).toBeNull();
    expect(engine.getState().G.players[active].zones.trash).toContain(attacker);
    expect(engine.getState().G.players[other].zones.trash).toContain(defender);
  });

  it('keeps the chosen Legend private through an actual Kiroshi Optics attack', () => {
    const { state, active, other } = rulesFixture();
    const attacker = placeCard(state, active, 'psycho-squad', 'field');
    const gear = placeCard(state, active, 'kiroshi-optics', 'field');
    state.G.cardIndex[attacker].meta.attachedGearIds.push(gear);
    state.G.cardIndex[gear].meta.attachedToId = attacker;
    giveGig(state, other);
    const engine = new LocalEngine(state);
    issue(engine, active, 'attackRival', { attackerId: attacker });
    const prompt = hideConcealedTargets(engine.getFilteredView(active)).prompt;
    expect(prompt.choice).toMatchObject({ type: 'chooseTarget' });
    const payload = prompt.choice?.payload as { eligibleIds: string[]; cards: CardView[] };
    expect(payload.eligibleIds).toHaveLength(3);
    expect(payload.cards.every((target) => target.definitionId === '')).toBe(true);
    expect(engine.getFilteredView(other).prompt.choice).toBeNull();
    const [slot] = payload.eligibleIds;
    const result = issue(engine, active, 'resolveEffectTarget', { targetIds: [slot] });
    const known = new Map<string, Set<Seat>>();
    const peeks = recordLegendPeeks(result.state, result.gameEvents, known);
    expect([...known.get(slot)!]).toEqual([active]);
    expect(peeks.length).toBe(active === 'player' ? 1 : 0);
    expect((engine.getFilteredView(other).players[active].zones.legendArea as CardView[]).find((card) => card.instanceId === slot)?.definitionId).toBe('');
  });

  it('does not give a later Rogue the first qualifying steal even if that die changes value', () => {
    const { state, active, other } = rulesFixture();
    const first = placeCard(state, active, 'psycho-squad', 'field');
    const second = placeCard(state, active, 'psycho-squad', 'field');
    for (const id of state.G.players[other].zones.legendArea) state.G.cardIndex[id].meta.spent = true;
    state.G.players[other].zones.hand = [];
    const rival = state.G.players[other];
    const dice = rival.fixerArea.splice(0, 2);
    for (const id of dice) {
      state.G.gigDice[id].location = 'gigArea';
      state.G.gigDice[id].faceValue = 1;
      rival.gigArea.push(id);
    }
    const before = new LocalEngine(state);
    issue(before, active, 'attackRival', { attackerId: first });
    const choice = before.getFilteredView(active).prompt.choice?.payload as { eligibleDice: { dieId: string }[] };
    const stolen = choice.eligibleDice[0].dieId;
    issue(before, active, 'resolveStealGigs', { dieIds: [stolen] });

    const after = structuredClone(before.getState()) as FixtureState;
    after.G.gigDice[stolen].faceValue = 6;
    placeCard(after, active, 'rogue-amendiares-queen-of-the-afterlife', 'field');
    const account = after.G.players[active];
    for (let i = 0; i < 2; i++) {
      const id = placeCard(after, active, 'floor-it', 'eddieArea', true);
      account.eddieCardIds.push(id);
    }
    account.spentEddies = 2;
    const engine = new LocalEngine(after);
    const eddies = engine.getFilteredView(active).players[active].eddies;
    issue(engine, active, 'attackRival', { attackerId: second });
    expect(engine.getFilteredView(active).players[active].eddies).toBe(eddies);
  });

  it('rejects an invalid draft before creating an engine match', () => {
    const draft = deckFromRecommended('heist-reloaded')!;
    const invalid = { ...draft, cards: { ...draft.cards, [draft.legends[0]]: 1 } };
    expect(() => prepareMatchDeck(invalid)).toThrow('Legends belong in the crew');
  });

  it('keeps the starting draft for rematch and rejects moves from an earlier match', () => {
    const respond = createMatchController();
    const original = structuredClone(setup('chrome-syndicate'));
    const opening = respond({ id: 1, action: { type: 'start', setup: original } });
    if (!('snapshot' in opening)) throw new Error(opening.error);
    original.player.legends.length = 0;
    original.player.mainDeck.length = 0;
    const firstId = opening.snapshot.matchId;
    const rematch = respond({ id: 2, action: { type: 'rematch', matchId: firstId } });
    if (!('snapshot' in rematch)) throw new Error(rematch.error);
    expect(rematch.snapshot.matchId).not.toBe(firstId);
    expect(rematch.snapshot.view.gameEnded).toBe(false);
    expect(rematch.snapshot.view.players.player.zones.legendArea).toHaveLength(3);
    expect(respond({ id: 3, action: { type: 'move', matchId: firstId, stateID: 0, move: { move: 'concede' } } })).toEqual({
      id: 3, error: 'That match is no longer active.',
    });
  });
});

function changeHiddenCards(state: EngineState, rival: Seat) {
  const { deck, hand } = state.G.players[rival].zones;
  const hiddenHandCard = state.G.cardIndex[hand[0]];
  const hiddenDeckCard = deck.map((id) => state.G.cardIndex[id]).find((card) => card.definitionId !== hiddenHandCard.definitionId)!;
  [hiddenHandCard.definitionId, hiddenDeckCard.definitionId] = [hiddenDeckCard.definitionId, hiddenHandCard.definitionId];
  for (const { zones } of Object.values(state.G.players)) {
    zones.deck.reverse();
    const cards = zones.legendArea.map((id) => state.G.cardIndex[id]);
    const last = cards.at(-1)!.definitionId;
    for (let i = cards.length - 1; i > 0; i--) cards[i].definitionId = cards[i - 1].definitionId;
    cards[0].definitionId = last;
  }
}


type FixtureState = EngineState & { G: {
  manualPaymentPlayerId?: Seat;
  turnMetadata: { activePlayerId: Seat };
  players: Record<Seat, { eddies: number; spentEddies: number; eddieCardIds: string[]; fixerArea: string[]; gigArea: string[] }>;
  gigDice: Record<string, { location: string; faceValue: number; ownerId: Seat }>;
  cardIndex: Record<string, { zone: string; meta: { faceDown: boolean; spent: boolean; hasLag: boolean; attachedGearIds: string[]; attachedToId: string | null } }>;
} };

function rulesFixture(desiredSeat?: Seat) {
  const { engine } = afterSetup(setup('chrome-syndicate'));
  const active = engine.getFilteredView('player').activePlayerId;
  const other: Seat = active === 'player' ? 'rival' : 'player';
  const state = structuredClone(engine.getState()) as FixtureState;
  if (!desiredSeat || desiredSeat === active) return { state, active, other };
  state.G.turnMetadata.activePlayerId = desiredSeat;
  return { state, active: desiredSeat, other: active };
}

function paymentFixture() {
  const fixture = rulesFixture();
  fixture.state.G.manualPaymentPlayerId = fixture.active;
  for (const id of fixture.state.G.players[fixture.active].zones.legendArea) fixture.state.G.cardIndex[id].meta.spent = false;
  fixture.state.G.players[fixture.active].eddies = 0;
  return fixture;
}

function placeEddie(state: FixtureState, seat: Seat) {
  const id = placeCard(state, seat, 'floor-it', 'eddieArea');
  state.G.players[seat].eddieCardIds.push(id);
  state.G.players[seat].eddies++;
  return id;
}

function equipFixture(state: FixtureState, host: string, gear: string) {
  state.G.cardIndex[host].meta.attachedGearIds.push(gear);
  state.G.cardIndex[gear].meta.attachedToId = host;
}

function giveGig(state: FixtureState, seat: Seat) {
  const { fixerArea, gigArea } = state.G.players[seat];
  const id = fixerArea.shift()!;
  Object.assign(state.G.gigDice[id], { location: 'gigArea', faceValue: 1 });
  gigArea.push(id);
}

function rejectedMove(engine: LocalEngine, seat: Seat, move: string, args: Record<string, unknown>) {
  return !engine.processCommand({ commandID: `reject-${move}`, move, input: { args } }, seat).success;
}

function placeCard(state: FixtureState, seat: Seat, slug: string, zone: string, spent = false) {
  const { zones } = state.G.players[seat];
  const id = zones.deck.shift()!;
  const card = state.G.cardIndex[id];
  card.definitionId = engineCardId(slug);
  card.zone = zone;
  Object.assign(card.meta, { faceDown: zone === 'eddieArea', spent, hasLag: false });
  zones[zone].push(id);
  return id;
}

function issue(engine: LocalEngine, seat: Seat, move: string, args: Record<string, unknown> = {}) {
  const result = engine.processCommand({ commandID: move, move, input: { args } }, seat);
  if (!result.success) throw new Error(result.error);
  return result;
}
