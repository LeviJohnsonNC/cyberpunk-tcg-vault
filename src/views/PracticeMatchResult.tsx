import { freePlayRoster } from '../lib/play/freePlayRoster';
import type { MatchSnapshot } from '../lib/play/protocol';
import { CircuitPayout } from './CircuitHub';
import { FreePlayRivalPortrait } from './FreePlayRivalPortrait';
import { MatchOutcome } from './MatchOutcome';

export function PracticeMatchResult({ snapshot, busy, error, rematch, lobby, edit, quote }: {
  snapshot: MatchSnapshot; busy: boolean; error?: string; quote?: string;
  rematch: () => void; lobby: () => void; edit: () => void;
}) {
  const rosterRival = freePlayRoster.find(entry => entry.key === snapshot.circuit?.rivalKey);
  const portrait = rosterRival?.portrait;
  const artKey = portrait && ('encounter' in portrait ? portrait.encounter : portrait.art);
  const name = portrait ? `${portrait.alias} · ${snapshot.names.rival}` : snapshot.names.rival;
  const receipt = snapshot.circuit?.receipt;

  return <MatchOutcome snapshot={snapshot} busy={busy} error={error} label="Free Play" kind="Free Play" rival={name}
    artKey={artKey} portrait={portrait && <FreePlayRivalPortrait portrait={portrait} priority />} quote={quote}
    continueLabel="Rematch" onContinue={rematch}
    secondaryActions={<>
      <button type="button" className="btn quiet" disabled={busy} onClick={edit}>Edit draft</button>
      <button type="button" className="btn quiet" disabled={busy} onClick={lobby}>Free Play lobby</button>
    </>}
    rewards={receipt && <details className="practice-result-rewards">
      <summary>Circuit rewards <strong>+{receipt.earned} REP</strong></summary>
      <CircuitPayout receipt={receipt} />
    </details>} />;
}
