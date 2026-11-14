import { runResolver } from "@tcg/cyberpunk-engine/automation/ai-player";
import { abilityAwareTacticalStrategy, createTacticalStrategy, tacticalStrategy } from "@tcg/cyberpunk-engine/automation/search/tactical";
import { createGreedyStrategy } from "@tcg/cyberpunk-engine/automation/strategies/greedy";
import type { DeckStrategyProfile } from "@tcg/cyberpunk-engine/automation/deck-profile";
import type { AIStrategy, DecisionContext, EngineHandle } from "@tcg/cyberpunk-engine/automation/types";

export { createCardCatalog } from "@tcg/cyberpunk-cards";
export { createMatchState, LocalEngine, SeededRNG } from "@tcg/cyberpunk-engine";
export { projectRevealedCardView } from "@tcg/cyberpunk-engine/view/filter";

// Every strategy here is one upstream labels "public": it decides from the seat's own
// filtered view. The full-information "oracle" strategies are deliberately left out.
const strategies: Record<string, AIStrategy> = {
  greedy: createGreedyStrategy(),
  tactical: tacticalStrategy,
  "tactical-ability-aware": abilityAwareTacticalStrategy,
};

type VaultDeckProfile = DeckStrategyProfile & {
  preferSecond?: boolean;
  developLegends?: boolean;
  planCombatSetup?: boolean;
  detonateForGigDefense?: boolean;
};
const profiledStrategies = new WeakMap<VaultDeckProfile, Record<string, AIStrategy>>();

function strategyFor(name: string, profile?: VaultDeckProfile) {
  if (!profile) return strategies[name] ?? strategies.greedy;
  let configured = profiledStrategies.get(profile);
  if (!configured) {
    configured = {
      tactical: createTacticalStrategy({ deckProfile: profile }),
      "tactical-ability-aware": createTacticalStrategy({
        deckProfile: profile, abilityAware: true, maxNodes: 80, maxDepth: 4,
        disabledHeuristics: profile.planCombatSetup ? ["safe-steal"] : [],
      }),
    };
    profiledStrategies.set(profile, configured);
  }
  return configured[name] ?? strategies.greedy;
}

/** Remove Gear that enables a multi-Gig steal while the lead is in play. */
function protectGigs({ view, prompt, playerId }: DecisionContext) {
  const attack = view.attackState;
  const defender = view.players[playerId];
  if (attack?.kind !== "direct" || attack.step !== "react" || attack.rivalId !== playerId
      || !defender || defender.gigCount < 4) return undefined;
  const rival = view.players[view.activePlayerId];
  const field = rival?.zones.field;
  if (!Array.isArray(field)) return undefined;
  const attacker = field.find(card => card.instanceId === attack.attackerId);
  if (!attacker || attacker.effectivePower <= 0 || attacker.grantedRules.includes("stealsOneFewerGig")) return undefined;
  const gear = field.filter(card => card.type === "gear" && card.attachedToId === attacker.instanceId
    && card.effectivePower <= 2
    && Math.floor(attacker.effectivePower / 10) > Math.floor((attacker.effectivePower - card.effectivePower) / 10));
  if (gear.length === 0) return undefined;

  if (prompt.choice?.type === "chooseTarget") {
    const { source, eligibleIds } = prompt.choice.payload;
    if (source?.displayName !== "Detonate") return undefined;
    const target = gear.find(card => eligibleIds?.includes(card.instanceId));
    return target ? { move: "resolveEffectTarget", args: { targetIds: [target.instanceId] } } : undefined;
  }
  const play = prompt.availableMoves.find(move => move.moveId === "playCard");
  const hand = defender.zones.hand;
  if (prompt.status !== "action" || play?.inputSpec.type !== "playCard" || !Array.isArray(hand)) return undefined;
  const candidates = play.inputSpec.candidates;
  const answer = hand.find(card => card.cardName === "Detonate"
    && candidates.some(candidate => candidate.cardId === card.instanceId));
  return answer ? { move: "playCard", args: { cardId: answer.instanceId } } : undefined;
}

export function chooseMove(view: DecisionContext["view"], rng: () => number, playerId: DecisionContext["playerId"],
  options: { strategy?: string; engine?: EngineHandle; profile?: VaultDeckProfile } = {}) {
  // Supply only the seat's projection, including its own legal prompt. Greedy needs nothing
  // more. The tactical strategies look ahead, so they also take a boundary-safe engine handle
  // to try their own moves on a fork; they stop searching wherever hidden information changes.
  const { prompt } = view;
  const context = { view, prompt, playerId, rng, ...(options.engine && { engine: options.engine }) };
  // The house list uses the extra opening resources of the second seat to develop.
  if (options.profile?.preferSecond && prompt.choice?.type === "chooseFirstPlayer") {
    return { move: "resolveFirstPlayer", args: { goFirst: false } };
  }
  // Calling reveals a shuffled slot. Value the development opportunity from
  // the visible board, without evaluating the card that a search fork reveals.
  if (options.profile?.developLegends && prompt.status === "action"
      && view.activePlayerId === playerId && !view.attackState && view.turnNumber <= 6) {
    const call = prompt.availableMoves.find(move => move.moveId === "callLegend");
    const play = prompt.availableMoves.find(move => move.moveId === "playCard");
    const field = view.players[playerId]?.zones.field;
    const hasUnits = Array.isArray(field) && field.some(card => card.type === "unit");
    const hand = view.players[playerId]?.zones.hand;
    const canDevelop = play?.inputSpec.type === "playCard" && Array.isArray(hand)
      && play.inputSpec.candidates.some(candidate => hand.some(card => card.instanceId === candidate.cardId && card.type === "unit"));
    if (!hasUnits && !canDevelop && call?.inputSpec.type === "selectCard") {
      const slots = view.players[playerId]?.zones.legendArea;
      const candidates = call.inputSpec.candidates;
      const ready = Array.isArray(slots) && slots.find(card => !card.spent && candidates.includes(card.instanceId));
      const legendId = ready ? ready.instanceId : candidates[0];
      if (legendId) return { move: "callLegend", args: { legendId } };
    }
  }
  const defense = options.profile?.detonateForGigDefense && protectGigs(context);
  if (defense) return defense;
  const strategy = strategyFor(options.strategy ?? "greedy", options.profile);
  const decision = prompt.status === "choice" && prompt.choice
    ? runResolver(prompt.choice, strategy, context)
    : strategy.decideAction(context);
  return decision.kind === "command" ? { move: decision.move, args: decision.args } : undefined;
}
