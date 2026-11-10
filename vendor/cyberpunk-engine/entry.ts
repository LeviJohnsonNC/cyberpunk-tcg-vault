import { runResolver } from "@tcg/cyberpunk-engine/automation/ai-player";
import { createGreedyStrategy } from "@tcg/cyberpunk-engine/automation/strategies/greedy";
import type { DecisionContext } from "@tcg/cyberpunk-engine/automation/types";

export { createCardCatalog } from "@tcg/cyberpunk-cards";
export { createMatchState, LocalEngine, SeededRNG } from "@tcg/cyberpunk-engine";
export { projectRevealedCardView } from "@tcg/cyberpunk-engine/view/filter";

const strategy = createGreedyStrategy();

export function chooseMove(view: DecisionContext["view"], rng: () => number, playerId: DecisionContext["playerId"]) {
  // Supply only the seat's projection, including its own legal prompt. The upstream
  // AIPlayer helper also passes an engine reference, which is unnecessary here.
  const { prompt } = view;
  const context = { view, prompt, playerId, rng };
  const decision = prompt.status === "choice" && prompt.choice
    ? runResolver(prompt.choice, strategy, context)
    : strategy.decideAction(context);
  return decision.kind === "command" ? { move: decision.move, args: decision.args } : undefined;
}
