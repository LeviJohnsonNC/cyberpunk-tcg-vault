import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CARD_BACK, CardImg, Pip, Rules } from '../components/bits';
import { CARDS, BY_SLUG } from '../lib/data';
import { isReady, matchActions, type MatchActionForm, type Picks } from '../lib/play/matchActions';
import { zoneCards, zoneCount } from '../lib/play/matchView';
import type { CardView, MatchSnapshot, Move, Seat } from '../lib/play/protocol';

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

type CardTile = (card: CardView, label?: string) => ReactNode;

function SeatLane({ seat, snapshot, name, active, renderCard, onPick, targetIds, chosenIds }: {
  seat: Seat; snapshot: MatchSnapshot; name: string; active: boolean; renderCard: CardTile; onPick: (id: string) => void; targetIds: Set<string>; chosenIds: Set<string>;
}) {
  const view = snapshot.view.players[seat];
  const own = seat === 'player';
  const gigs = zoneCards(view, 'gigArea');
  const fixer = zoneCards(view, 'fixerArea');
  const legends = zoneCards(view, 'legendArea');
  const field = zoneCards(view, 'field');
  const trash = zoneCards(view, 'trash');
  const removed = zoneCards(view, 'removedFromGame');
  return (
    <section className="play-seat" data-seat={seat} data-active={active} aria-label={own ? 'Your board' : 'Rival board'}>
      <div className="play-seat-meta">
        <span className="play-eyebrow">{own ? 'Your crew' : 'Rival crew'} {active && <span aria-hidden="true">◆</span>}</span>
        <h2>{name}</h2>
        <dl className="play-stats">
          <div><dt>Gigs</dt><dd>{view.gigCount}</dd></div>
          <div><dt>Cred</dt><dd>{view.streetCred}</dd></div>
          <div><dt>Ready €$</dt><dd>{view.availableEddies}</dd></div>
        </dl>
        <p className="play-zone-count">{zoneCount(view, 'hand')} in hand · {zoneCount(view, 'deck')} in deck</p>
      </div>
      <div className="play-seat-zones">
        <div className="play-dice-line">
          <div className="play-dice" aria-label={own ? 'Your Gigs' : 'Rival Gigs'}>
            <span className="play-eyebrow">Gigs</span>
            {gigs.length ? gigs.map((card) => <button key={card.instanceId} type="button" className="play-die" aria-label={`${card.definitionId} Gig · ${card.power}`}
              data-card-id={card.instanceId} data-target={targetIds.has(card.instanceId)} disabled={!targetIds.has(card.instanceId)}
              aria-pressed={targetIds.has(card.instanceId) ? chosenIds.has(card.instanceId) : undefined} onClick={() => onPick(card.instanceId)}><small>{card.definitionId}</small><b>{card.power}</b></button>)
              : <span className="play-empty">—</span>}
          </div>
          <div className="play-dice" aria-label={own ? 'Your Fixer dice' : 'Rival Fixer dice'}>
            <span className="play-eyebrow">Fixer</span>
            {fixer.length ? fixer.map((card) => <button key={card.instanceId} type="button" className="play-die play-die-fixer"
              aria-label={`Roll ${card.definitionId}`} data-card-id={card.instanceId} data-target={targetIds.has(card.instanceId)} disabled={!targetIds.has(card.instanceId)}
              aria-pressed={targetIds.has(card.instanceId) ? chosenIds.has(card.instanceId) : undefined} onClick={() => onPick(card.instanceId)}>{card.definitionId}</button>)
              : <span className="play-empty">—</span>}
          </div>
        </div>
        <div className="play-zones">
          <section aria-label="Legend slots">
            <h3 className="play-eyebrow">Legends</h3>
            <div className="play-card-row">{legends.map((card, index) => renderCard(card, `Slot ${index + 1}`))}</div>
          </section>
          <section aria-label="Field">
            <h3 className="play-eyebrow">Field <span>{field.length}</span></h3>
            <div className="play-card-row">{field.length ? field.map((card) => renderCard(card)) : <span className="play-empty">Field is clear</span>}</div>
          </section>
        </div>
        {(trash.length > 0 || removed.length > 0) && <details className="play-discard">
          <summary>Trash {trash.length}{removed.length ? ` · Removed ${removed.length}` : ''}</summary>
          <div className="play-card-row">{[...trash, ...removed].map((card) => renderCard(card))}</div>
        </details>}
      </div>
    </section>
  );
}

export function PlayTable({ snapshot, names, busy, error, send, rematch, edit }: {
  snapshot: MatchSnapshot; names: Record<Seat, string>; busy: boolean; error?: string;
  send: (move: Move) => void; rematch: () => void; edit: () => void;
}) {
  const { view } = snapshot;
  const actions = matchActions(view);
  const [selection, setSelection] = useState<number | undefined>(actions.length === 1 && actions[0].fields({}).length ? 0 : undefined);
  const [picks, setPicks] = useState<Picks>({});
  const [inspected, setInspected] = useState<CardView>();
  const title = useRef<HTMLHeadingElement>(null);
  const selected = selection === undefined ? undefined : actions[selection];
  const fields = selected?.fields(picks) ?? [];
  const targetIds = new Set(fields.flatMap((field) => field.options.flatMap((option) => option.cardId ? [option.cardId] : [])));
  const chosenIds = new Set(fields.flatMap((field) => field.options.filter((option) => picks[field.id]?.includes(option.id)).flatMap((option) => option.cardId ? [option.cardId] : [])));
  const reveal = view.prompt.choice?.payload as { revealedCards?: CardView[]; cards?: CardView[] } | undefined;
  const presented = reveal?.revealedCards ?? (view.prompt.choice?.type === 'chooseCardToMove' || view.prompt.choice?.type === 'chooseCardToPlay' ? reveal?.cards : undefined);
  const active = view.activePlayerId;
  const combat = view.attackState;
  const combatCard = combat && Object.values(view.players).flatMap((seat) => zoneCards(seat, 'field')).find((card) => card.instanceId === combat.attackerId);
  const decisionTitle = view.gameEnded ? view.winnerId === 'player' ? 'You win' : view.winnerId === 'rival' ? 'Rival wins' : 'Match complete'
    : view.prompt.choice?.type === 'chooseFirstPlayer' ? 'Choose turn order'
    : view.gamePhase === 'setup' ? 'Opening hand'
    : combat ? 'Combat decision' : view.prompt.choice ? actions[0]?.label ?? 'Resolve a choice' : 'Your action';
  const reason: Record<string, string> = { gig_victory: 'Seven Gigs secured', overtime_majority: 'Majority of Gigs in overtime', deck_out_victory: 'Deck-out', concede: 'Concession', concession: 'Concession' };

  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);

  function chooseValue(fieldId: string, id: string) {
    if (busy) return;
    const index = fields.findIndex((field) => field.id === fieldId);
    const target = fields[index];
    if (!target || !target.options.some((option) => option.id === id)) return;
    const values = picks[fieldId] ?? [];
    if (!values.includes(id) && target.max > 1 && values.length >= target.max) return;
    const next = values.includes(id) ? values.filter((value) => value !== id) : target.max === 1 ? [id] : [...values, id];
    const resetFollowing = target.id === 'card' || target.id === 'ability' || target.id === 'attacker' || target.id === 'from' || target.id === 'die';
    setPicks(resetFollowing ? { ...Object.fromEntries(fields.slice(0, index).map((field) => [field.id, picks[field.id] ?? []])), [fieldId]: next } : { ...picks, [fieldId]: next });
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
    else {
      setSelection(selection === index ? undefined : index);
      setPicks({});
    }
  }

  function renderCard(card: CardView, fallback = 'Face-down card') {
    const printing = vaultCard(card);
    const name = printing?.name ?? card.cardName ?? fallback;
    const target = targetIds.has(card.instanceId);
    const known = snapshot.knownLegends.some((legend) => legend.instanceId === card.instanceId);
    const attacking = combat?.attackerId === card.instanceId || combat?.defenderId === card.instanceId;
    return <button key={card.instanceId} type="button" className="play-card" data-card-id={card.instanceId} data-target={target}
      data-spent={card.spent} data-combat={attacking} data-color={printing?.color} aria-pressed={target ? chosenIds.has(card.instanceId) : undefined}
      aria-label={`${name}${card.spent ? ', spent' : ''}${target ? ', selectable' : ''}`} onClick={() => {
        if (!pickOnBoard(card.instanceId)) setInspected(card);
      }}>
      <span className="play-card-art"><CardFace card={card} />
        {printing && <span className="play-art-fallback" aria-hidden="true">{printing.type}</span>}
        {(card.zone === 'field' && card.type !== 'gear') && <span className="play-power">{card.effectivePower}</span>}
      </span>
      <span className="play-card-name">{name}</span>
      {card.spent || card.hasLag || known || !!card.damage ? <small>{[card.spent && 'Spent', card.hasLag && 'Lag', known && 'Known', !!card.damage && `${card.damage} dmg`].filter(Boolean).join(' · ')}</small> : null}
    </button>;
  }

  const log = snapshot.log;
  const inspectCard = inspected && vaultCard(inspected);
  const hand = zoneCards(view.players.player, 'hand');
  return (
    <div className="play-grid" data-match-id={snapshot.matchId} data-state-id={view.stateID}>
      <div className="play-table">
        <SeatLane seat="rival" snapshot={snapshot} name={names.rival} active={active === 'rival' && !view.gameEnded} renderCard={renderCard} onPick={pickOnBoard} targetIds={targetIds} chosenIds={chosenIds} />
        <div className="play-table-strip">
          <span>{view.gamePhase === 'setup' ? 'Opening protocol' : `Turn ${view.turnNumber} · ${active === 'player' ? 'Your turn' : 'Rival turn'}`}</span>
          <span>{view.overtimeActive ? 'Overtime' : combat ? 'Combat' : 'Best of one'}</span>
        </div>
        <SeatLane seat="player" snapshot={snapshot} name={names.player} active={active === 'player' && !view.gameEnded} renderCard={renderCard} onPick={pickOnBoard} targetIds={targetIds} chosenIds={chosenIds} />
        <section className="play-hand" aria-label="Your hand">
          <h2 className="play-eyebrow">Your hand <span>{hand.length}</span></h2>
          <div className="play-card-row">{hand.length ? hand.map((card) => renderCard(card)) : <span className="play-empty">No cards in hand</span>}</div>
        </section>
      </div>
      <aside className="play-rail" aria-label="Match controls">
        <section className="panel play-decision" aria-label="Current decision">
          <div className="play-decision-heading">
            <span className="play-eyebrow">{view.gameEnded ? 'Match report' : busy ? 'Resolving' : 'Decision window'}</span>
            <h2 ref={title} tabIndex={-1} aria-live="polite">{decisionTitle}</h2>
            {combatCard?.cardName && !view.gameEnded && <p className="play-combat-caption">{combatCard.cardName} is attacking.</p>}
          </div>
          {error && <p className="play-error" role="alert">{error}</p>}
          {view.gameEnded ? <>
            <p>{reason[view.winReason ?? ''] ?? 'Match ended'} · Turn {view.turnNumber}</p>
            <p className="play-result-line"><b>{view.players.player.gigCount}</b> your Gigs <span>◆</span> <b>{view.players.rival.gigCount}</b> rival Gigs</p>
            <div className="play-actions">
              <button type="button" className="btn" disabled={busy} onClick={rematch}>Rematch</button>
              <button type="button" className="btn quiet" disabled={busy} onClick={edit}>Edit draft</button>
            </div>
          </> : <>
            <div className="play-actions">
              {actions.map((action, i) => (actions.length > 1 || !selected || !action.fields({}).length) &&
                <button key={`${action.id}:${action.label}`} type="button" className={`btn ${selection === i ? '' : 'quiet'}`}
                  data-move={action.id} data-action-index={i} aria-pressed={action.fields({}).length ? selection === i : undefined}
                  title={action.detail} disabled={busy} onClick={() => startAction(action, i)}>{action.label}</button>)}
            </div>
            {!actions.length && <p className="play-error" role="status">This decision has no available controls. Return to your draft to start again.</p>}
            {selected && <form className="play-picks" onSubmit={(event) => {
              event.preventDefault();
              if (!busy && isReady(fields, picks)) send(selected.move(picks));
            }}>
              {selected.detail && <p className="play-choice-detail">{selected.detail}</p>}
              {fields.map((field) => <fieldset key={field.id} data-pick-field={field.id} disabled={busy}>
                <legend>{field.label}{field.max > 1 ? ` · ${field.min === field.max ? field.min : `${field.min}–${field.max}`}` : ''}</legend>
                <div className="play-pick-list">
                  {field.options.map((option) => {
                    const rank = picks[field.id]?.indexOf(option.id) ?? -1;
                    return <button key={option.id} type="button" className="play-option" data-pick-option={option.id} aria-pressed={rank >= 0} onClick={() => chooseValue(field.id, option.id)}>
                      <span>{field.ordered && rank >= 0 ? `${rank + 1}. ` : ''}{option.label}</span>
                      {option.note && <small>{option.note}</small>}
                    </button>;
                  })}
                  {!field.options.length && <small className="muted">No eligible options</small>}
                </div>
              </fieldset>)}
              <button className="btn" data-confirm-move={selected.id} disabled={busy || !isReady(fields, picks)}>Confirm</button>
            </form>}
            {presented?.length ? <div className="play-reveal"><span className="play-eyebrow">Revealed cards</span>
              <div className="play-card-row">{presented.map((card) => renderCard(card))}</div>
            </div> : null}
            {snapshot.peeks.length > 0 && <div className="play-reveal"><span className="play-eyebrow">Private Legend peek</span>
              <div className="play-card-row">{snapshot.peeks.map((card) => renderCard(card))}</div>
            </div>}
            {busy && <p className="play-working" role="status">Resolving the move…</p>}
          </>}
        </section>
        {inspected && <section className="panel play-inspect" aria-label="Card details">
          <div className="play-inspect-head"><h3>{inspectCard?.display ?? inspected.cardName ?? 'Face-down card'}</h3>
            <button type="button" className="btn quiet sm" onClick={() => setInspected(undefined)}>Close</button>
          </div>
          {inspectCard ? <>
            <p className="play-eyebrow"><Pip color={inspectCard.color} /> {inspectCard.type}</p>
            <p><Rules text={inspectCard.text} /></p>
            {selection === undefined && actions.map((action, index) => {
              const first = action.fields({})[0];
              const options = first?.options.filter((option) => option.cardId === inspected.instanceId);
              return options?.length === 1 ? <button key={action.id} type="button" className="btn ghost sm" onClick={() => {
                setSelection(index);
                setPicks({ [first.id]: [options[0].id] });
              }}>{action.label}</button> : null;
            })}
          </> : <p>This card’s identity is concealed.</p>}
        </section>}
        <section className="panel play-log" aria-label="Action log">
          <h3>Action log</h3>
          {log.length ? <ol>{log.slice().reverse().map((entry) => <li key={entry.id}>
            <small>{entry.turn ? `T${entry.turn} · ` : ''}{entry.seat === 'player' ? 'You' : 'Rival'}</small><span>{entry.text}</span>
          </li>)}</ol> : <p className="play-empty">Match events appear here.</p>}
        </section>
      </aside>
    </div>
  );
}
