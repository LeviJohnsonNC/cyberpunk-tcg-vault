import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isReady, matchActions, type Picks } from '../lib/play/matchActions';
import { activeStep, cardIntents, dropIntents, intentLabel, reorderPick, updatePick, type Destination, type Intent } from '../lib/play/matchInteraction';
import { visibleCards, zoneCards } from '../lib/play/matchView';
import type { CardView, MatchBeat, MatchSnapshot, Move, Seat } from '../lib/play/protocol';
import { CardFace, CardInspection } from './PlayCard';
import { vaultCard } from '../lib/play/cardDisplay';
import { GigRollAnnouncement } from './PlayDice';
import { PlayGigRoll } from './PlayGigRoll';
import { GigZones, PlayMat } from './PlayMat';
import { PlayChoices } from './PlayChoices';
import { useTableDrag } from './useTableDrag';
import { Rules } from '../components/bits';
import { CombatArrow, CombatBanner } from './PlayCombat';
import { PlayPresentation, type MatchPlayback } from './PlayPresentation';
import './play-interaction.css';
import './play-presentation.css';

const combatSteps: Record<string, string> = { attack: 'Attack', react: 'React', fight: 'Fight', fightResult: 'Fight result', steal: 'Steal' };
const winReasons: Record<string, string> = { gig_victory: 'Seven Gigs secured', overtime_majority: 'Majority of Gigs in overtime', deck_out_victory: 'Deck-out', concede: 'Concession', concession: 'Concession' };
type SavedDecision = { matchId: string; state: number; selection?: number; picks: Picks; step?: string };
type Context = { state: string; card: CardView; intents: Intent[]; x: number; y: number; trigger?: HTMLElement };
type Preview = { state: string; card: CardView; x: number; y: number };

function readDecision(key: string, snapshot: MatchSnapshot): SavedDecision | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as SavedDecision | null;
    if (saved?.matchId === snapshot.matchId && saved.state === snapshot.view.stateID
      && (saved.selection === undefined || Number.isInteger(saved.selection))
      && saved.picks && Object.values(saved.picks).every((values) => Array.isArray(values) && values.every((value) => typeof value === 'string'))) return saved;
  } catch { /* The engine checkpoint remains usable without optional UI storage. */ }
}

function ContextMenu({ context, children, close }: { context: Context; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    function outside(event: PointerEvent) { if (event.target instanceof Node && !ref.current?.contains(event.target)) closeRef.current(); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); } }
    function reposition(event: Event) { if (event.type === 'resize' || !(event.target instanceof Node) || !ref.current?.contains(event.target)) closeRef.current(); }
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { window.removeEventListener('resize', reposition); document.removeEventListener('scroll', reposition, true); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  return createPortal(<div ref={ref} className="play-card-menu" role="dialog" aria-label={`Actions for ${context.card.cardName ?? 'Legend slot'}`}
    style={{ left: Math.max(10, Math.min(context.x, innerWidth - 290)), top: Math.max(10, Math.min(context.y, innerHeight - 300)), maxHeight: innerHeight - Math.max(10, Math.min(context.y, innerHeight - 300)) - 12 }}>
    <div className="play-card-menu-title"><strong>{context.card.cardName ?? 'Face-down Legend'}</strong><button type="button" className="btn quiet" aria-label="Close card actions" onClick={close}>×</button></div>
    {children}
  </div>, document.body);
}

export function PlayTable({ scope, snapshot, names, busy, error, send, rematch, edit, playback, feedback, diceImpact }: {
  diceImpact?: (type: string, soft: boolean) => (() => void) | undefined;
  playback?: MatchPlayback; feedback?: MatchBeat; scope: string; snapshot: MatchSnapshot; names: Record<Seat, string>; busy: boolean; error?: string;
  send: (move: Move) => void; rematch: () => void; edit: () => void;
}) {
  const { view } = snapshot;
  const actions = matchActions(view);
  // Keep the established key so a valid, uncommitted selection survives this UI update.
  const decisionKey = `cptv.playDecision.v1:${scope}`;
  const [decision, setDecision] = useState(() => readDecision(decisionKey, snapshot));
  const [inspection, setInspection] = useState<{ state: string; card: CardView }>();
  const [context, setContext] = useState<Context>();
  const [preview, setPreview] = useState<Preview>();
  const [arrow, setArrow] = useState<{ state: string; x1: number; y1: number; x2: number; y2: number }>();
  const [notice, setNotice] = useState('');
  const [allActions, setAllActions] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const grid = useRef<HTMLDivElement>(null);
  const rolls = playback?.beat.gigRolls;
  const rolling = !!rolls?.length;
  const submitLock = useRef<string | undefined>(undefined);
  const focusAfter = useRef(false);
  const focusReturn = useRef<HTMLElement | undefined>(undefined);
  const stateKey = `${snapshot.matchId}:${view.stateID}`;
  const choice = view.prompt.choice;
  const forms = actions.map((action, index) => action.fields({}).length ? index : -1).filter((index) => index >= 0);
  const defaultSelection = (choice || actions.length === 1) && forms.length === 1 ? forms[0] : undefined;
  const current = decision?.matchId === snapshot.matchId && decision.state === view.stateID ? decision : undefined;
  const candidate = current?.selection ?? (current ? undefined : defaultSelection);
  const selection = candidate !== undefined && actions[candidate] ? candidate : undefined;
  const picks = current?.picks ?? {};
  const selected = selection === undefined ? undefined : actions[selection];
  const fields = selected?.fields(picks) ?? [];
  const step = activeStep(fields, picks, current?.step);
  const targetIds = new Set(step?.options.flatMap((option) => option.cardId ? [option.cardId] : []) ?? []);
  const chosenIds = new Set(step?.options.filter((option) => picks[step.id]?.includes(option.id)).flatMap((option) => option.cardId ? [option.cardId] : []) ?? []);
  const reveal = choice?.payload as { revealedCards?: CardView[]; cards?: CardView[]; source?: { cardId?: string } } | undefined;
  const cards = [...visibleCards(view), ...(reveal?.revealedCards ?? reveal?.cards ?? []), ...snapshot.peeks];
  const hand = zoneCards(view.players.player, 'hand');
  const handIds = new Set(hand.map((card) => card.instanceId));
  const combat = view.attackState;
  const combatStep = combat && combatSteps[combat.step];
  const waiting = !actions.length && view.prompt.status === 'waiting';
  const inspected = inspection?.state === stateKey ? inspection.card : undefined;
  const menu = context?.state === stateKey ? context : undefined;
  const hovered = preview?.state === stateKey ? preview : undefined;
  const sourceId = picks.attacker?.[0] ?? picks.card?.[0] ?? reveal?.source?.cardId;
  const attacker = cards.find((card) => card.instanceId === combat?.attackerId);
  const defender = cards.find((card) => card.instanceId === combat?.defenderId);
  const attackingPlayer = zoneCards(view.players.player, 'field').some((card) => card.instanceId === combat?.attackerId);
  const combatCaption = attacker?.cardName && `${attacker.cardName} attacks ${defender?.cardName ?? (attackingPlayer ? 'the rival’s Gigs' : 'your Gigs')}.`;
  const decisionTitle = rolling ? 'Rolling Gigs' : playback ? 'Watching moves' : view.gameEnded ? view.winnerId === 'player' ? 'You win' : view.winnerId === 'rival' ? 'Rival wins' : 'Match complete'
    : waiting ? 'Rival is deciding' : choice?.type === 'chooseFirstPlayer' ? 'Choose turn order'
    : view.gamePhase === 'setup' ? 'Opening hand' : choice ? actions[0]?.label ?? 'Resolve a choice'
    : combatStep === 'React' ? 'Reaction window' : combatStep ?? 'Your move';

  useEffect(() => {
    if (focusAfter.current) { grid.current?.querySelector<HTMLElement>('.play-decision-tray [data-step][aria-pressed=true],.play-decision-tray button:not(:disabled),.play-table-strip')?.focus({ preventScroll: true }); focusAfter.current = false; }
  }, [stateKey, selection, current?.step]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  function clearHover() { clearTimeout(hoverTimer.current); setPreview(undefined); setArrow(undefined); }
  function setChoice(selection: number | undefined, picks: Picks, step?: string) {
    const next = { matchId: snapshot.matchId, state: view.stateID, selection, picks, step };
    setDecision(next);
    try { localStorage.setItem(decisionKey, JSON.stringify(next)); } catch { /* Optional UI state. */ }
  }
  function commit(intent: Intent) {
    const action = actions[intent.action];
    if (busy || submitLock.current === stateKey || !action || !isReady(action.fields(intent.picks), intent.picks)) return;
    submitLock.current = stateKey;
    clearHover(); setContext(undefined); setNotice('');
    send(action.move(intent.picks));
  }
  // A rejected command is safe to retry, without permitting a double submission while pending.
  useEffect(() => { if (!busy) submitLock.current = undefined; }, [busy, error, stateKey]);

  function beginIntent(intent: Intent, immediate = false) {
    const action = actions[intent.action];
    if (!action || busy) return;
    clearHover(); setContext(undefined); setNotice('');
    focusAfter.current = true;
    if (immediate && (!choice || !action.fields({}).length) && !action.fields(intent.picks).some((field) => field.id === 'payment') && isReady(action.fields(intent.picks), intent.picks)) commit(intent);
    else setChoice(intent.action, intent.picks);
  }
  function chooseValue(fieldId: string, value: string) {
    if (busy || !selected || selection === undefined) return;
    const next = updatePick(selected, picks, fieldId, value);
    if (!next) return;
    const field = fields.find((field) => field.id === fieldId);
    const nextFields = selected.fields(next);
    const nextStep = field?.max === 1 && (next[fieldId]?.length ?? 0) === 1 ? activeStep(nextFields, next)?.id : fieldId;
    if (document.activeElement?.closest('[data-pick-field]')) focusAfter.current = true;
    setChoice(selection, next, nextStep);
    setArrow(undefined);
  }
  function pickOnBoard(id: string) {
    if (busy) return false;
    const options = step?.options.filter((option) => option.cardId === id) ?? [];
    if (step && options.length === 1) { chooseValue(step.id, options[0].id); return true; }
    return false;
  }
  function availableIntents(card: CardView) {
    return view.gameEnded || busy || choice || selected ? [] : cardIntents(actions, card.instanceId);
  }
  function showMenu(card: CardView, trigger: HTMLElement, intents = availableIntents(card), point?: { x: number; y: number }) {
    clearHover();
    const rect = trigger.getBoundingClientRect();
    setContext({ state: stateKey, card, intents, x: point?.x ?? rect.right + 7, y: point?.y ?? rect.top, trigger });
  }
  function inspect(card: CardView, trigger?: HTMLElement) {
    clearHover(); setContext(undefined); focusReturn.current = trigger; setInspection({ state: stateKey, card });
  }
  function closeMenu() { context?.trigger?.focus({ preventScroll: true }); setContext(undefined); }
  function handleDrop(card: CardView, destination: Destination) {
    const intents = dropIntents(actions, card, destination);
    if (intents.length === 1) beginIntent(intents[0], true);
    else if (intents.length > 1) {
      const trigger = grid.current?.querySelector<HTMLElement>(`[data-board-card="${CSS.escape(card.instanceId)}"]`);
      if (trigger) showMenu(card, trigger, intents);
    }
  }
  const spatial = new Set(['playCard', 'sellCard', 'goSolo', 'attackUnit', 'attackRival', 'useBlocker']);
  const canDrag = (card: CardView) => cardIntents(actions, card.instanceId).some((intent) => spatial.has(actions[intent.action].id));
  const dragControl = useTableDrag({ stateKey, enabled: !busy && !view.gameEnded && !selected,
    eligible: canDrag,
    accept: (card, destination) => dropIntents(actions, card, destination).length > 0,
    drop: handleDrop, begin: () => { clearHover(); setContext(undefined); setNotice(''); },
    rejected: () => setNotice('Card returned. Drop onto a highlighted destination.'),
  });
  const drag = dragControl.drag;
  const zoneKeys = ['field:player', 'eddies:player', 'program', 'gigs:rival'];
  const dropZones = new Set(drag ? zoneKeys.filter((key) => dropIntents(actions, drag.card, { key }).length) : []);
  const dropOver = drag?.destination?.key;
  function enterCard(card: CardView, element: HTMLElement) {
    if (drag || menu || inspected || busy) return;
    clearTimeout(hoverTimer.current);
    if (sourceId && targetIds.has(card.instanceId) && sourceId !== card.instanceId && step?.id !== 'payment') {
      const source = grid.current?.querySelector<HTMLElement>(`[data-board-card="${CSS.escape(sourceId)}"]`);
      if (source) { const a = source.getBoundingClientRect(), b = element.getBoundingClientRect();
        setArrow({ state: stateKey, x1: a.x + a.width / 2, y1: a.y + a.height / 2, x2: b.x + b.width / 2, y2: b.y + b.height / 2 }); }
    }
    if (selected) return; // The board and decision tray take priority over enlargement.
    const rect = element.getBoundingClientRect();
    hoverTimer.current = setTimeout(() => setPreview({ state: stateKey, card,
      x: rect.left > innerWidth / 2 ? Math.max(10, rect.left - 285) : Math.min(innerWidth - 280, rect.right + 12),
      y: Math.max(10, Math.min(rect.top, innerHeight - 420)) }), 450);
  }
  function renderCard(card: CardView, fallback = 'Face-down card') {
    const printing = vaultCard(card);
    const name = printing?.name ?? card.cardName ?? fallback;
    const target = !busy && targetIds.has(card.instanceId);
    const dragLegal = !selected && canDrag(card) && !busy;
    const dropLegal = drag && dropIntents(actions, drag.card, { key: card.instanceId === combat?.attackerId ? 'attacker' : 'card', cardId: card.instanceId }).length > 0;
    const unavailable = view.gamePhase === 'main' && handIds.has(card.instanceId) && view.prompt.status === 'action'
      && !actions.some((action) => action.id === 'playCard' && action.fields({})[0]?.options.some((option) => option.cardId === card.instanceId)) && !target;
    const combatRole = combat?.attackerId === card.instanceId ? 'Attacking' : combat?.defenderId === card.instanceId ? 'Defending' : undefined;
    const effectTarget = playback?.beat.targetIds.includes(card.instanceId);
    const effectSource = playback?.beat.source?.instanceId === card.instanceId;
    const visibleRole = combatRole ?? (effectTarget ? 'Target' : effectSource ? 'Source' : undefined);
    const state = [visibleRole, card.spent && 'Spent', card.hasLag && 'Lag', snapshot.knownLegends.some((legend) => legend.instanceId === card.instanceId) && 'Known', !!card.damage && `${card.damage} dmg`].filter(Boolean).join(' · ');
    const power = card.zone === 'field' && card.type !== 'gear' ? card.effectivePower : undefined;
    return <div key={card.instanceId} className="play-card-shell" data-dragging={drag?.card.instanceId === card.instanceId}>
      <button type="button" className="play-card" disabled={!!playback} data-card-id={card.instanceId} data-board-card={card.instanceId}
        data-drop-zone={card.instanceId === combat?.attackerId ? 'attacker' : undefined} data-drop-available={!!dropLegal} data-drop-over={drag?.destination?.cardId === card.instanceId}
        data-source={!!selected && sourceId === card.instanceId} data-target={target} data-unplayable={unavailable || undefined} data-spent={card.spent} data-combat={!!combatRole} data-combat-role={combatRole?.toLowerCase()} data-effect-target={effectTarget || undefined} data-effect-source={effectSource || undefined} data-feedback={feedback?.changes.find((change) => change.card?.instanceId === card.instanceId)?.kind} data-color={printing?.color} data-draggable={dragLegal}
        aria-pressed={target ? chosenIds.has(card.instanceId) : undefined} aria-label={[name, state, power != null && `power ${power}`, target && 'selectable'].filter(Boolean).join(', ')}
        onPointerDown={(event) => dragControl.start(event, card)} onDragStart={(event) => event.preventDefault()}
        onMouseEnter={(event) => enterCard(card, event.currentTarget)} onMouseLeave={clearHover}
        onKeyDown={(event) => { if (!playback && event.key.toLowerCase() === 'i') { event.preventDefault(); inspect(card, event.currentTarget); } }}
        onClick={(event) => { if (playback || dragControl.suppressClick()) return; if (!pickOnBoard(card.instanceId)) { if (event.currentTarget.closest('dialog')) inspect(card, event.currentTarget); else showMenu(card, event.currentTarget); } }}>
        <span className="play-card-art"><CardFace card={card} />
          {printing && <span className="play-art-fallback" aria-hidden="true">{printing.type}</span>}
          {power != null && <span className="play-power" aria-hidden="true">{power}</span>}
        </span><span className="play-card-name">{name}</span>{state && <small>{visibleRole ?? state}</small>}
      </button>
      <button type="button" className="play-details" disabled={!!playback} aria-label={`Details for ${name}`} title="Inspect card · I" onClick={(event) => inspect(card, event.currentTarget)}>i</button>
    </div>;
  }
  function actionButton(index: number, label?: string) {
    const action = actions[index];
    return <button key={`${action.id}:${index}`} type="button" className="btn quiet" disabled={busy || (!!selected && !choice && ['passPhase', 'resolveAttack'].includes(action.id))} data-move={action.id} data-action-index={index}
      aria-pressed={action.fields({}).length ? selection === index : undefined} onClick={() => beginIntent({ action: index, picks: {} }, true)}>{label ?? action.label}</button>;
  }
  const special = actions.map((action, index) => ({ action, index })).filter(({ action }) => !action.fields({}).length);
  const log = snapshot.log;
  const latest = log.at(-1);
  const targeting = { snapshot, onPick: pickOnBoard, targetIds: busy ? new Set<string>() : targetIds, chosenIds, effectIds: new Set(playback?.beat.targetIds ?? []), dropZones, dropOver };
  const shownArrow = drag?.destination && (drag.destination.cardId || drag.destination.key === 'gigs:rival')
    ? { x1: drag.originX, y1: drag.originY, x2: drag.x, y2: drag.y } : arrow?.state === stateKey && !drag ? arrow : undefined;
  return <div ref={grid} className="play-grid play-direct" data-match-id={snapshot.matchId} data-state-id={view.stateID} data-busy={busy} data-playback={!!playback}
    onKeyDown={(event) => { if (event.key === 'Escape' && !drag && !inspected && !menu) { setChoice(choice ? defaultSelection : undefined, {}); clearHover(); } }}>
    <aside className="play-rail" aria-label="Match controls">
      <section className="panel play-decision" aria-label="Current decision" data-result={view.gameEnded ? view.winnerId ?? 'draw' : undefined}>
        <div className="play-decision-heading"><span className="play-eyebrow">{playback ? 'Public moves' : view.gameEnded ? 'Match report' : busy ? 'Resolving move' : waiting ? 'Rival decision' : 'Practice table'}</span>
          <h2 aria-live="polite">{decisionTitle}</h2><p className="play-combat-caption">{rolling ? 'Skip to see the settled result.' : playback ? 'The table is showing public moves. Skip to the next decision when ready.' : combatCaption ?? (view.gameEnded ? winReasons[view.winReason ?? ''] ?? 'Match ended' : choice || selected ? 'Follow the decision on the mat.' : 'Select a card to act. Drag it to a highlighted destination.')}</p></div>
        {error && <p className="play-error" role="alert">{error}</p>}
        {view.gameEnded ? <><dl className="play-result-score"><div><dt>Your Gigs</dt><dd>{view.players.player.gigCount}</dd></div><div><dt>Rival Gigs</dt><dd>{view.players.rival.gigCount}</dd></div></dl>
          <div className="play-actions"><button type="button" className="btn" disabled={busy} onClick={rematch}>Rematch</button><button type="button" className="btn quiet" disabled={busy} onClick={edit}>Edit draft</button></div></>
          : <><div className="play-actions">{special.filter(({ action }) => !choice && ['passPhase', 'resolveAttack'].includes(action.id) && !(combat && action.id === 'resolveAttack')).map(({ index }) => actionButton(index))}</div>
            <button type="button" className="btn quiet play-all-toggle" aria-expanded={allActions} disabled={!!playback} onClick={() => setAllActions(!allActions)}>Show {allActions ? 'fewer' : 'all'} actions</button>
            {allActions && <div className="play-actions play-moves">{actions.map((_, index) => actionButton(index))}</div>}
            {!playback && <p className="play-controls-hint">Click to select · Drag to act<br />I to inspect · Esc to cancel selection</p>}</>}
      </section>
      <PlayPresentation playback={playback} feedback={feedback} />
      {!playback && snapshot.peeks.length > 0 && <section className="play-private-peek" aria-label="Private Legend peek">
        <h3>Private Legend peek</h3><p>Only you can see this identity.</p>
        {snapshot.peeks.map((card) => {
          const owner = (['player', 'rival'] as const).find((seat) => zoneCards(view.players[seat], 'legendArea').some((slot) => slot.instanceId === card.instanceId));
          const slot = owner ? zoneCards(view.players[owner], 'legendArea').findIndex((item) => item.instanceId === card.instanceId) + 1 : undefined;
          return <button key={card.instanceId} type="button" className="btn quiet" onClick={(event) => inspect(card, event.currentTarget)}>
            <CardFace card={card} /><span>{owner ? `${owner === 'player' ? 'Your' : 'Rival'} slot ${slot}` : 'Revealed Legend'}<strong>{card.cardName}</strong><small>Inspect</small></span>
          </button>;
        })}
      </section>}
      <section className="panel play-log" aria-label="Match activity"><div className="play-log-heading"><h3>Last move</h3></div>
        {latest ? <><p className="play-latest play-roll-wait">Roll in progress</p><p className="play-latest play-roll-outcome"><b>{latest.seat === 'player' ? 'You' : 'Rival'}</b>{latest.text}</p><details className="play-history play-roll-outcome"><summary>Action log <span>{log.length}</span></summary>
          <ol>{log.slice().reverse().map((entry) => <li key={entry.id}><small>T{entry.turn} · {entry.seat === 'player' ? 'You' : 'Rival'}</small><span>{entry.text}</span></li>)}</ol></details></> : <p className="play-empty">Match events appear here.</p>}
      </section>
    </aside>
    <div className="play-table"><GigRollAnnouncement rolls={snapshot.gigRolls} />
      <PlayMat rolls={rolls} seat="rival" name={names.rival} active={view.activePlayerId === 'rival' && view.gamePhase !== 'setup' && !view.gameEnded} {...targeting} renderCard={renderCard} renderFace={(card) => <CardFace card={card} />} />
      <GigZones {...targeting} />
      {combat ? <CombatBanner view={view} watching={!!playback} controls={<>{playback && <button type="button" className="btn quiet" onClick={playback.skip}>Skip moves</button>}{special.filter(({ action }) => action.id === 'resolveAttack').map(({ index }) => actionButton(index))}</>} /> : <div className="play-table-strip" tabIndex={-1} data-combat={!!combat}><span>{view.gamePhase === 'setup' ? 'Opening setup' : `Turn ${view.turnNumber} · ${view.activePlayerId === 'player' ? 'Your turn' : 'Rival turn'}`}</span><span>{playback ? `Watching move ${playback.index + 1}/${playback.count}` : combatStep ?? (view.overtimeActive ? 'Overtime' : 'Best of one')}</span></div>}
      {!playback && !view.gameEnded && view.gamePhase !== 'setup' && (selected || choice) && <div className="play-table-decision" key={stateKey}>
        {selected ? <PlayChoices action={selected} picks={picks} fields={fields} active={step} cards={cards} busy={busy} forced={!!choice} revealed={reveal?.revealedCards} select={chooseValue}
          step={(id) => setChoice(selection, picks, id)} reorder={(field, ids) => { const next = reorderPick(selected, picks, field, ids); if (next) setChoice(selection, next, field); }}
          submit={() => selection !== undefined && commit({ action: selection, picks })}
          cancel={() => { setChoice(choice ? defaultSelection : undefined, {}); clearHover(); }}
          inspect={inspect} alternatives={choice ? special.map(({ index }) => actionButton(index)) : null} />
          : <div className="play-opening-choices"><h3>{decisionTitle}</h3>{actions.map((_, index) => actionButton(index))}</div>}
      </div>}
      <PlayMat rolls={rolls} seat="player" fieldControls={!playback && view.gamePhase === 'setup' ? <div className="play-opening-choices"><h3>{decisionTitle}</h3>{actions.map((_, index) => actionButton(index))}</div> : undefined} name={names.player} active={view.activePlayerId === 'player' && view.gamePhase !== 'setup' && !view.gameEnded} {...targeting} renderCard={renderCard} renderFace={(card) => <CardFace card={card} />} />
      {(dropZones.has('program')) && <div className="play-program-drop" data-drop-zone="program" data-drop-available="true" data-drop-over={dropOver === 'program'}>Play Program</div>}
      <section className="play-hand" aria-label="Your hand"><div className="play-hand-heading"><h2 className="play-eyebrow">Your hand <span>{hand.length}</span></h2><span className="play-eyebrow">Private</span></div>
        <div className="play-card-row">{hand.length ? hand.map((card) => renderCard(card)) : <span className="play-empty">No cards in hand</span>}</div></section>
      <span className="sr-only" role="status">{notice}{busy ? ' Resolving move.' : ''}</span>
      {notice && <p className="play-table-notice">{notice}</p>}
      {rolling && <PlayGigRoll key={view.stateID} rolls={rolls} impact={diceImpact} />}
    </div>
    {menu && <ContextMenu context={menu} close={closeMenu}>{menu.intents.map((intent, index) => <button key={index} type="button" className="btn ghost" data-context-action={actions[intent.action].id}
      onClick={() => beginIntent(intent, true)}>{intentLabel(actions[intent.action], intent.picks, menu.card)}</button>)}
      {menu.intents.some((intent) => actions[intent.action].id === 'activateAbility') && vaultCard(menu.card) && <details className="play-menu-rules"><summary>Printed abilities</summary><Rules text={vaultCard(menu.card)!.text} /></details>}
      {!menu.intents.length && <p className="play-choice-detail">{selected ? 'Finish or cancel the current selection to start another action.' : 'No action available for this card now.'}</p>}
      <button type="button" className="btn quiet" onClick={() => inspect(menu.card, menu.trigger)}>Details</button></ContextMenu>}
    {hovered && !drag && !menu && !inspected && createPortal(<div className="play-hover-preview" style={{ left: hovered.x, top: hovered.y }} aria-hidden="true"><CardFace card={hovered.card} /><strong>{hovered.card.cardName ?? 'Concealed card'}</strong></div>, document.body)}
    {drag && createPortal(<div className="play-drag-ghost" style={{ left: drag.x + 12, top: drag.y - 35, width: Math.max(65, Math.min(drag.width, 110)) }} aria-hidden="true"><CardFace card={drag.card} /><span>{drag.destination ? 'Release to choose this action' : 'Choose a highlighted destination'}</span></div>, document.body)}
    {combat && <CombatArrow view={view} root={grid} />}
    {shownArrow && createPortal(<svg className="play-target-arrow" aria-hidden="true"><defs><marker id="play-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 6 3 0 6" /></marker></defs><path d={`M${shownArrow.x1} ${shownArrow.y1} Q${shownArrow.x1} ${shownArrow.y2} ${shownArrow.x2} ${shownArrow.y2}`} markerEnd="url(#play-arrowhead)" /></svg>, document.body)}
    {inspected && <CardInspection card={inspected} hostName={cards.find((card) => card.instanceId === inspected.attachedToId)?.cardName ?? undefined} shortcuts={[]} onClose={() => { setInspection(undefined); focusReturn.current?.focus({ preventScroll: true }); }} />}
  </div>;
}
