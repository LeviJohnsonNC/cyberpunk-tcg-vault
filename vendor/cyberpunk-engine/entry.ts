import { runResolver } from "@tcg/cyberpunk-engine/automation/ai-player";
import { abilityAwareTacticalStrategy, tacticalStrategy } from "@tcg/cyberpunk-engine/automation/search/tactical";
import { createGreedyStrategy } from "@tcg/cyberpunk-engine/automation/strategies/greedy";
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

export function chooseMove(view: DecisionContext["view"], rng: () => number, playerId: DecisionContext["playerId"],
  options: { strategy?: string; engine?: EngineHandle } = {}) {
  // Supply only the seat's projection, including its own legal prompt. Greedy needs nothing
  // more. The tactical strategies look ahead, so they also take a boundary-safe engine handle
  // to try their own moves on a fork; they stop searching wherever hidden information changes.
  const strategy = strategies[options.strategy ?? "greedy"] ?? strategies.greedy;
  const { prompt } = view;
  const context = { view, prompt, playerId, rng, ...(options.engine && { engine: options.engine }) };
  const decision = prompt.status === "choice" && prompt.choice
    ? runResolver(prompt.choice, strategy, context)
    : strategy.decideAction(context);
  return decision.kind === "command" ? { move: decision.move, args: decision.args } : undefined;
}
