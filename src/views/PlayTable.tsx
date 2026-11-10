import { useEffect, useId, useRef, useState } from 'react';
import { CARD_BACK, CardImg, Pip, Rules } from '../components/bits';
import { CARDS, BY_SLUG } from '../lib/data';
import { isReady, matchActions, type MatchActionForm, type Picks } from '../lib/play/matchActions';
import { visibleCards, zoneCards } from '../lib/play/matchView';
import type { CardView, MatchSnapshot, Move, Seat } from '../lib/play/protocol';
import { DieFace, GigRollDisplay } from './PlayDice';
import { GigZones, PlayMat } from './PlayMat';

const byId = new Map(CARDS.map((card) => [card.id, card]));
const byDisplay = new Map(CARDS.map((card) => [card.display, card]));
byDisplay.set('Lucyna Kushinada', BY_SLUG.get('lucyna-kushinada-fresh-beginnings')!);

function vaultCard(card: CardView) {
  if (!card.definitionId) return;
  return byId.get(card.definitionId) ?? byDisplay.get(card.cardName ?? '');
}

function CardFace({ card }: { card: CardView }) {
  const printing = vaultCard(card);
  return printing ? <CardImg slug={printing.slug} alt="" priority /> : <img className="card-art" src={CARD_BACK} alt="" />;
}

function CardInspection({ card, hostName, shortcuts, onClose }: {
  card: CardView; hostName?: string; shortcuts: { label: string; select: () => void }[]; onClose: () => void;
}) {
  const title = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const printing = vaultCard(card);
  useEffect(() => { ref.current?.showModal(); }, []);

  function dismiss() {
    ref.current?.close();
    onClose();
  }

  const known = !!card.definitionId;
  const cost = card.effectiveCost ?? card.cost;
  return <dialog ref={ref} className="al-dialog play-inspect" aria-labelledby={title} onCancel={(event) => {
    event.preventDefault();
    dismiss();
  }} onClick={(event) => { if (event.target === ref.current) dismiss(); }}>
    <div className="al-dialog-body play-inspect-body">
      <div className="play-inspect-head">
        <div><p className="play-eyebrow">Card details</p><h2 id={title}>{printing?.display ?? card.cardName ?? 'Face-down card'}</h2></div>
        <button type="button" className="btn quiet" onClick={dismiss}>Close</button>
      </div>
      <div className="play-inspect-content">
        <span className="play-inspect-art"><CardFace card={card} /></span>
        <div>
          {known ? <>
            <p className="play-eyebrow">{printing && <Pip color={printing.color} bare />} {printing?.type ?? card.type}</p>
            <dl className="play-inspect-stats">
              {cost != null && <div><dt>Cost</dt><dd>{cost} €$</dd></div>}
              {card.zone === 'field' && card.type !== 'gear' && <div><dt>Power</dt><dd>{card.effectivePower}</dd></div>}
              {!!card.damage && <div><dt>Damage</dt><dd>{card.damage}</dd></div>}
            </dl>
            {(card.spent || card.hasLag || hostName) && <p className="play-inspect-status">{[
              card.spent && 'Spent', card.hasLag && 'Lag', hostName && `Attached to ${hostName}`,
            ].filter(Boolean).join(' · ')}</p>}
            {printing && <p className="play-inspect-rules"><Rules text={printing.text} /></p>}
            {shortcuts.length > 0 && <div className="play-actions">{shortcuts.map(({ label, select }) =>
              <button key={label} type="button" className="btn ghost" onClick={() => {
                dismiss();
                select();
              }}>{label}</button>)}</div>}
          </> : <p className="play-choice-detail">This card’s identity is concealed.</p>}
        </div>
      </div>
    </div>
  </dialog>;
}

const combatSteps: Record<string, string> = {
  attack: 'Attack', react: 'React', fight: 'Fight', fightResult: 'Fight result', steal: 'Steal',
};
const winReasons: Record<string, string> = {
  gig_victory: 'Seven Gigs secured', overtime_majority: 'Majority of Gigs in overtime',
  deck_out_victory: 'Deck-out', concede: 'Concession', concession: 'Concession',
};

type SavedDecision = { matchId: string; state: number; selection?: number; picks: Picks };

function readDecision(key: string, snapshot: MatchSnapshot): SavedDecision | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as SavedDecision | null;
    if (saved?.matchId === snapshot.matchId && saved.state === snapshot.view.stateID
      && (saved.selection === undefined || Number.isInteger(saved.selection))
      && saved.picks && Object.values(saved.picks).every((values) =>
        Array.isArray(values) && values.every((value) => typeof value === 'string'))) return saved;
  } catch { /* The committed match still resumes when local storage is unavailable. */ }
}

export function PlayTable({ scope, snapshot, names, busy, error, send, rematch, edit }: {
  scope: string; snapshot: MatchSnapshot; names: Record<Seat, string>; busy: boolean; error?: string;
  send: (move: Move) => void; rematch: () => void; edit: () => void;
}) {
  const { view } = snapshot;
  const actions = matchActions(view);
  const decisionKey = `cptv.playDecision.v1:${scope}`;
  const [decision, setDecision] = useState(() => readDecision(decisionKey, snapshot));
  const [inspection, setInspection] = useState<{ state: number; card: CardView }>();
  const title = useRef<HTMLHeadingElement>(null);
  const choice = view.prompt.choice;
  const forms = actions.map((action, index) => action.fields({}).length ? index : -1).filter((index) => index >= 0);
  const defaultSelection = (choice || actions.length === 1) && forms.length === 1 ? forms[0] : undefined;
  const current = decision?.state === view.stateID ? decision : undefined;
  const selection = current ? current.selection : defaultSelection;
  const picks = current?.picks ?? {};
  const inspected = inspection?.state === view.stateID ? inspection.card : undefined;
  const selected = selection === undefined ? undefined : actions[selection];
  const fields = selected?.fields(picks) ?? [];
  const targetIds = new Set(fields.flatMap((field) => field.options.flatMap((option) => option.cardId ? [option.cardId] : [])));
  const chosenIds = new Set(fields.flatMap((field) => field.options.filter((option) => picks[field.id]?.includes(option.id)).flatMap((option) => option.cardId ? [option.cardId] : [])));
  const reveal = choice?.payload as { revealedCards?: CardView[]; cards?: CardView[] } | undefined;
  const presented = reveal?.revealedCards ?? (choice?.type === 'chooseCardToMove' || choice?.type === 'chooseCardToPlay' ? reveal?.cards : undefined);
  const active = view.activePlayerId;
  const combat = view.attackState;
  const combatStep = combat && combatSteps[combat.step];
  const hand = zoneCards(view.players.player, 'hand');
  const handIds = new Set(hand.map((card) => card.instanceId));
  const showPlayability = view.gamePhase === 'main' && view.prompt.status === 'action'
    && (combat ? combat.step === 'react' : active === 'player');
  const playOptions = actions.find((action) => action.id === 'playCard')?.fields({})[0]?.options ?? [];
  const playableIds = new Set(playOptions.map((option) => option.id));
  const cards = visibleCards(view);
  const dice = new Map(cards.filter((card) => card.zone === 'gigArea' || card.zone === 'fixerArea').map((card) => [card.instanceId, card]));
  const attacker = cards.find((card) => card.instanceId === combat?.attackerId);
  const defender = cards.find((card) => card.instanceId === combat?.defenderId);
  const waiting = !actions.length && view.prompt.status === 'waiting';
  const decisionTitle = view.gameEnded ? view.winnerId === 'player' ? 'You win' : view.winnerId === 'rival' ? 'Rival wins' : 'Match complete'
    : waiting ? 'Rival is deciding'
    : choice?.type === 'chooseFirstPlayer' ? 'Choose turn order'
    : view.gamePhase === 'setup' ? 'Opening hand'
    : choice ? actions[0]?.label ?? 'Resolve a choice'
    : combatStep === 'React' ? 'Reaction window'
    : combatStep ?? 'Choose an action';
  const attackingPlayer = zoneCards(view.players.player, 'field').some((card) => card.instanceId === combat?.attackerId);
  const combatTarget = defender?.cardName ?? (attackingPlayer ? 'the rival’s Gigs' : 'your Gigs');
  const combatCaption = attacker?.cardName && `${attacker.cardName} attacks ${combatTarget}.`;

  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [view.stateID]);

  function setChoice(selection: number | undefined, picks: Picks) {
    const next = { matchId: snapshot.matchId, state: view.stateID, selection, picks };
    setDecision(next);
    try { localStorage.setItem(decisionKey, JSON.stringify(next)); } catch { /* Optional UI state. */ }
  }

  function chooseValue(fieldId: string, id: string) {
    if (busy) return;
    const index = fields.findIndex((field) => field.id === fieldId);
    const target = fields[index];
    if (!target || !target.options.some((option) => option.id === id)) return;
    const values = picks[fieldId] ?? [];
    if (!values.includes(id) && target.max > 1 && values.length >= target.max) return;
    const next = values.includes(id) ? values.filter((value) => value !== id) : target.max === 1 ? [id] : [...values, id];
    const resetFollowing = target.id === 'card' || target.id === 'ability' || target.id === 'attacker' || target.id === 'from' || target.id === 'die';
    setChoice(selection, resetFollowing
      ? { ...Object.fromEntries(fields.slice(0, index).map((field) => [field.id, picks[field.id] ?? []])), [fieldId]: next }
      : { ...picks, [fieldId]: next });
  }

  function pickOnBoard(id: string) {
    if (busy) return false;
    const candidates = fields.filter((field) => field.options.some((option) => option.cardId === id));
    if (candidates.length !== 1) return false;
    const [field] = candidates;
    const option = field.options.filter((item) => item.cardId === id);
    if (option.length !== 1) return false;
    chooseValue(field.id, option[0].id);
    return true;
  }

  function startAction(action: MatchActionForm, index: number) {
    if (!action.fields({}).length) send(action.move({}));
    else setChoice(selection === index && index !== defaultSelection ? undefined : index, {});
  }

  function renderCard(card: CardView, fallback = 'Face-down card') {
    const printing = vaultCard(card);
    const name = printing?.name ?? card.cardName ?? fallback;
    const target = targetIds.has(card.instanceId);
    const unavailable = showPlayability && handIds.has(card.instanceId) && !playableIds.has(card.instanceId) && !target;
    const known = snapshot.knownLegends.some((legend) => legend.instanceId === card.instanceId);
    const combatRole = combat?.attackerId === card.instanceId ? 'Attacking' : combat?.defenderId === card.instanceId ? 'Defending' : undefined;
    const power = card.zone === 'field' && card.type !== 'gear' ? card.effectivePower : undefined;
    const state = [combatRole, card.spent && 'Spent', card.hasLag && 'Lag', known && 'Known', !!card.damage && `${card.damage} dmg`].filter(Boolean).join(' · ');
    const status = [state, unavailable && 'Cannot play now'].filter(Boolean).join(' · ');
    return <button key={card.instanceId} type="button" className="play-card" data-card-id={card.instanceId} data-target={target}
      data-unplayable={unavailable || undefined}
      data-spent={card.spent} data-combat={!!combatRole} data-color={printing?.color} aria-pressed={target ? chosenIds.has(card.instanceId) : undefined}
      title={status ? `${name} · ${status}` : name} aria-label={[name, status, power != null && `power ${power}`, target && 'selectable'].filter(Boolean).join(', ')}
      onClick={() => { if (!pickOnBoard(card.instanceId)) setInspection({ state: view.stateID, card }); }}>
      <span className="play-card-art"><CardFace card={card} />
        {printing && <span className="play-art-fallback" aria-hidden="true">{printing.type}</span>}
        {power != null && <span className="play-power" aria-hidden="true">{power}</span>}
      </span>
      <span className="play-card-name">{name}</span>
      {state && <small>{combatRole ?? state}</small>}
    </button>;
  }

  const log = snapshot.log;
  const latest = log.at(-1);
  const isSetup = view.gamePhase === 'setup';
  const choiceHelp = cards.some((card) => targetIds.has(card.instanceId))
    ? 'Choose a highlighted card or use the options below.'
    : 'Choose an option to continue.';
  const shortcuts = inspected && selection === undefined && !busy ? actions.flatMap((action, index) => {
    const first = action.fields({})[0];
    const options = first?.options.filter((option) => option.cardId === inspected.instanceId);
    return options?.length === 1 ? [{ label: action.label, select: () => {
      setChoice(index, { [first.id]: [options[0].id] });
      title.current?.focus({ preventScroll: true });
    } }] : [];
  }) : [];
  return (
    <div className="play-grid" data-match-id={snapshot.matchId} data-state-id={view.stateID}>
      <aside className="play-rail" aria-label="Match controls">
        <section className="panel play-decision" aria-label="Current decision" data-result={view.gameEnded ? view.winnerId ?? 'draw' : undefined}>
          <div className="play-decision-heading">
            <span className="play-eyebrow"><i aria-hidden="true" />{view.gameEnded ? 'Match report' : busy ? 'Resolving move' : waiting ? 'Rival decision' : 'Your decision'}</span>
            <h2 ref={title} tabIndex={-1} aria-live="polite">{decisionTitle}</h2>
            {!view.gameEnded && <p className="play-combat-caption">{combatCaption ?? (isSetup
              ? choice?.type === 'chooseFirstPlayer' ? 'Decide which crew takes the first turn.' : 'Keep these cards or draw a new opening hand.'
              : choice || selected ? choiceHelp : 'Choose a move or inspect a card on the table.')}</p>}
          </div>
          {error && <p className="play-error" role="alert">{error}</p>}
          {view.gameEnded ? <>
            <p className="play-result-reason">{winReasons[view.winReason ?? ''] ?? 'Match ended'} · Turn {view.turnNumber}</p>
            <dl className="play-result-score">
              <div><dt>Your Gigs</dt><dd>{view.players.player.gigCount}</dd></div>
              <div><dt>Rival Gigs</dt><dd>{view.players.rival.gigCount}</dd></div>
            </dl>
            <div className="play-actions">
              <button type="button" className="btn" disabled={busy} onClick={rematch}>Rematch</button>
              <button type="button" className="btn quiet" disabled={busy} onClick={edit}>Edit draft</button>
            </div>
          </> : <>
            <div className="play-actions play-moves">
              {actions.map((action, i) => (actions.length > 1 || !selected || !action.fields({}).length) &&
                <button key={`${action.id}:${action.label}`} type="button" className={`btn ${selection === i ? 'ghost' : action.id === 'keepHand' || (!selected && actions.length === 1) ? '' : 'quiet'}`}
                  data-move={action.id} data-action-index={i} aria-pressed={action.fields({}).length ? selection === i : undefined}
                  title={action.detail} disabled={busy} onClick={() => startAction(action, i)}>{action.label}</button>)}
            </div>
            {!actions.length && !waiting && !busy && <p className="play-error" role="status">This decision has no available controls. Return to your draft to start again.</p>}
            {selected && <form className="play-picks" onSubmit={(event) => {
              event.preventDefault();
              if (!busy && isReady(fields, picks)) send(selected.move(picks));
            }}>
              <div className="play-pick-fields" key={selection}>
                {selected.detail && <p className="play-choice-detail">{selected.detail}</p>}
                {fields.map((field) => <fieldset key={field.id} data-pick-field={field.id} disabled={busy}>
                  <legend>{field.label}{field.max > 1 ? ` · ${picks[field.id]?.length ?? 0}/${field.min === field.max ? field.min : `${field.min}–${field.max}`}` : ''}</legend>
                  <div className="play-pick-list">
                    {field.options.map((option) => {
                      const rank = picks[field.id]?.indexOf(option.id) ?? -1;
                      const die = option.cardId && dice.get(option.cardId);
                      return <button key={option.id} type="button" className={`play-option${die ? ' play-option-die' : ''}`} data-pick-option={option.id} aria-pressed={rank >= 0} onClick={() => chooseValue(field.id, option.id)}>
                        {die && <DieFace type={die.definitionId} value={die.zone === 'gigArea' ? die.power : undefined} />}
                        <span>{field.ordered && rank >= 0 ? `${rank + 1}. ` : ''}{option.label}</span>
                        {option.note && <small>{option.note}</small>}
                      </button>;
                    })}
                    {!field.options.length && <small className="muted">No eligible options</small>}
                  </div>
                </fieldset>)}
              </div>
              <button className="btn play-confirm" data-confirm-move={selected.id} disabled={busy || !isReady(fields, picks)}>
                {selected.id === 'gainGig' ? 'Roll die' : 'Confirm'}
              </button>
            </form>}
            {presented?.length ? <section className="play-reveal" aria-label="Revealed cards"><h3 className="play-eyebrow">Revealed cards</h3>
              <div className="play-card-row">{presented.map((card) => renderCard(card))}</div>
            </section> : null}
            {snapshot.peeks.length > 0 && <section className="play-reveal" aria-label="Private Legend peek"><h3 className="play-eyebrow">Private Legend peek</h3>
              <div className="play-card-row">{snapshot.peeks.map((card) => renderCard(card))}</div>
            </section>}
            {busy && <p className="sr-only" role="status">Resolving the move…</p>}
          </>}
        </section>
        <section className="panel play-log" aria-label="Match activity">
          <div className="play-log-heading"><h3>Last move</h3>{latest?.turn ? <span className="play-eyebrow">Turn {latest.turn}</span> : null}</div>
          {latest ? <>
            <p className="play-latest"><b>{latest.seat === 'player' ? 'You' : 'Rival'}</b><span>{latest.text}</span></p>
            <details className="play-history">
              <summary>Action log <span>{log.length}</span></summary>
              <ol>{log.slice().reverse().map((entry) => <li key={entry.id}>
                <small>{entry.turn ? `T${entry.turn} · ` : ''}{entry.seat === 'player' ? 'You' : 'Rival'}</small><span>{entry.text}</span>
              </li>)}</ol>
            </details>
          </> : <p className="play-empty">Match events appear here.</p>}
        </section>
      </aside>
      <div className="play-table">
        <GigRollDisplay rolls={snapshot.gigRolls} stateID={view.stateID} />
        <PlayMat seat="rival" snapshot={snapshot} name={names.rival} active={active === 'rival' && !isSetup && !view.gameEnded} renderCard={renderCard} renderFace={(card) => <CardFace card={card} />} onPick={pickOnBoard} targetIds={targetIds} chosenIds={chosenIds} />
        <GigZones snapshot={snapshot} onPick={pickOnBoard} targetIds={targetIds} chosenIds={chosenIds} />
        <div className="play-table-strip" data-combat={!!combat}>
          <span>{view.gameEnded ? `Final board · Turn ${view.turnNumber}` : isSetup ? 'Opening setup'
            : `Turn ${view.turnNumber} · ${active === 'player' ? 'Your turn' : 'Rival turn'}`}</span>
          <span>{view.gameEnded ? 'Match complete' : [view.overtimeActive && 'Overtime', combatStep].filter(Boolean).join(' · ') || 'Best of one'}</span>
        </div>
        <PlayMat seat="player" snapshot={snapshot} name={names.player} active={active === 'player' && !isSetup && !view.gameEnded} renderCard={renderCard} renderFace={(card) => <CardFace card={card} />} onPick={pickOnBoard} targetIds={targetIds} chosenIds={chosenIds} />
        <section className="play-hand" aria-label="Your hand">
          <div className="play-hand-heading">
            <h2 className="play-eyebrow">Your hand <span>{hand.length}</span></h2>
            <span className="play-eyebrow">Private</span>
          </div>
          <div className="play-card-row">{hand.length ? hand.map((card) => renderCard(card)) : <span className="play-empty">No cards in hand</span>}</div>
        </section>
      </div>
      {inspected && <CardInspection card={inspected} shortcuts={shortcuts} onClose={() => setInspection(undefined)}
        hostName={cards.find((card) => card.instanceId === inspected.attachedToId)?.cardName ?? undefined} />}
    </div>
  );
}
