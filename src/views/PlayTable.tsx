import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isReady, matchActions, type Picks } from '../lib/play/matchActions';
import { activeStep, cardIntents, dropIntents, intentLabel, reorderPick, suggestPayment, updatePick, type Destination, type Intent } from '../lib/play/matchInteraction';
import { visibleCards, zoneCards } from '../lib/play/matchView';
import type { CardView, MatchBeat, MatchSnapshot, Move, Seat } from '../lib/play/protocol';
import { CardFace, CardInspection } from './PlayCard';
import { vaultCard } from '../lib/play/cardDisplay';
import { decisionSource, previewPosition } from '../lib/play/tacticalInfo';
import { commandPresentation } from '../lib/play/commandPresentation';
import { DieFace, GigRollAnnouncement } from './PlayDice';
import { releaseOnField, type PointerRelease } from '../lib/play/diceThrow';
import { PlayGigRoll } from './PlayGigRoll';
import { GigZones, PlayerBench, RivalBench, SeatField } from './PlayMat';
import { PlayChoices } from './PlayChoices';
import { useTableDrag } from './useTableDrag';
import { useTableMotion } from './useTableMotion';
import { useMatchOpening } from './useMatchOpening';
import { useMatchSound } from './useMatchSound';
import { imageUrl } from '../lib/data';
import { beatPace } from '../lib/play/matchMotion';
import type { TableCue } from '../lib/play/tableSound';
import { Rules } from '../components/bits';
import { CombatArrow, CombatBanner } from './PlayCombat';
import { PlayPresentation, type MatchPlayback } from './PlayPresentation';
import { MatchResult } from './PlayResult';
import { CampaignMatchResult, type CampaignResultDetails } from './CampaignMatchResult';
import { CIRCUIT_CONTRACTS } from '../lib/play/circuit';
import { MatchRadioContainer } from '../lib/play/matchRadio';
import './play-table.css';
import './match-board.css';
import './play-interaction.css';
import './play-presentation.css';
import './play-command.css';

const winReasons: Record<string, string> = { gig_victory: 'Seven Gigs secured', overtime_majority: 'Majority of Gigs in overtime', deck_out_victory: 'Deck-out', concede: 'Concession', concession: 'Concession' };
type SavedDecision = { matchId: string; state: number; selection?: number; picks: Picks; step?: string };
type Context = { state: string; card: CardView; intents: Intent[]; x: number; y: number; trigger?: HTMLElement };
type Preview = { state: string; card: CardView; x: number; y: number; landscape: boolean };

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
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    function position() {
      if (!menu) return;
      menu.style.left = `${Math.max(10, Math.min(context.x, innerWidth - menu.offsetWidth - 10))}px`;
      menu.style.top = `${Math.max(10, Math.min(context.y, innerHeight - menu.offsetHeight - 10))}px`;
    }
    position();
    const size = new ResizeObserver(position);
    size.observe(menu);
    (menu.querySelector<HTMLButtonElement>('.play-card-menu-action') ?? menu.querySelector('button'))?.focus({ preventScroll: true });
    return () => size.disconnect();
  }, [context]);
  useEffect(() => {
    function outside(event: PointerEvent) { if (event.target instanceof Node && !ref.current?.contains(event.target)) closeRef.current(); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); } }
    function reposition(event: Event) { if (event.type === 'resize' || !(event.target instanceof Node) || !ref.current?.contains(event.target)) closeRef.current(); }
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { window.removeEventListener('resize', reposition); document.removeEventListener('scroll', reposition, true); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  const card = context.card.faceDown ? undefined : vaultCard(context.card);
  return createPortal(<div ref={ref} className="play-card-menu" role="dialog" aria-label={`Actions for ${context.card.cardName ?? 'Legend slot'}`}>
    <div className="play-card-menu-title">
      {card && <img src={imageUrl(card.slug)} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
      <strong>{context.card.cardName ?? 'Face-down Legend'}</strong>
      <button type="button" className="btn quiet" aria-label="Close card actions" onClick={close}>×</button>
    </div>
    {children}
  </div>, document.body);
}

export function PlayTable({ scope, snapshot, names, busy: saving, error, send, rematch, edit, circuit, playback, feedback, reduced, controls, navigation, audio, cue, campaign }: {
  campaign?: CampaignResultDetails & { rival: ReactNode; act?: number };
  cue?: (name: TableCue, delayMs?: number) => (() => void) | undefined;
  playback?: MatchPlayback; feedback?: MatchBeat; scope: string; snapshot: MatchSnapshot; names: Record<Seat, string>; busy: boolean; error?: string;
  send: (move: Move) => void; rematch: () => void; edit: () => void; circuit?: () => void; reduced: boolean; controls?: ReactNode; navigation?: ReactNode; audio?: ReactNode;
}) {
  const { view } = snapshot;
  const radioContainer = useContext(MatchRadioContainer);
  const [radioOpen, setRadioOpen] = useState(false);
  const radioPanel = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (menuRef.current?.open && event.target instanceof Node && !menuRef.current.contains(event.target)) menuRef.current.open = false;
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const closeOptions = useCallback(() => {
    if (menuRef.current) menuRef.current.open = false;
    menuRef.current?.querySelector('summary')?.focus({ preventScroll: true });
  }, []);
  const closeRadio = useCallback(() => {
    setRadioOpen(false);
    closeOptions();
  }, [closeOptions]);
  useEffect(() => {
    const panel = radioPanel.current;
    if (!radioOpen || !panel) return;
    panel.focus({ preventScroll: true });
    // The music controls belong to a portal, so listen on the actual panel.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeRadio();
    };
    panel.addEventListener('keydown', escape);
    return () => panel.removeEventListener('keydown', escape);
  }, [radioOpen, closeRadio]);
  const setup = view.gamePhase === 'setup';
  const opening = useMatchOpening(!!snapshot.openingDeal && setup, reduced, cue);
  const busy = saving || opening.showing;
  const introSkip = useRef<HTMLButtonElement>(null);
  const restoreOpeningFocus = useRef(false);
  const contract = CIRCUIT_CONTRACTS.find(item => item.id === snapshot.circuit?.contractId);
  const actions = matchActions(view);
  // Keep the established key so a valid, uncommitted selection survives this UI update.
  const decisionKey = `cptv.playDecision.v1:${scope}`;
  const [decision, setDecision] = useState(() => readDecision(decisionKey, snapshot));
  const [inspection, setInspection] = useState<{ state: string; card: CardView }>();
  const [context, setContext] = useState<Context>();
  const [preview, setPreview] = useState<Preview>();
  const [arrow, setArrow] = useState<{ state: string; x1: number; y1: number; x2: number; y2: number }>();
  const [notice, setNotice] = useState('');
  const [dieThrow, setDieThrow] = useState<{ dieId: string; matchId: string; fromState: number; release: PointerRelease }>();
  const [panel, setPanel] = useState<'log' | 'actions' | 'effects' | 'contract'>();
  const panelId = useId();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const grid = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const rolls = playback?.beat.gigRolls;
  const rolling = !!rolls?.length;
  const activeThrow = dieThrow?.matchId === snapshot.matchId && dieThrow.fromState < view.stateID
    && playback?.index === 0 && rolls?.some(roll => roll.seat === 'player' && roll.origin === 'gainGig' && roll.dieId === dieThrow.dieId)
    ? dieThrow : undefined;
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
  const selected = selection === undefined ? undefined : actions[selection];
  // A forced choice that opens on payment starts with a suggestion, like any other payment.
  const picks = current?.picks ?? (selected ? suggestPayment(selected, {}, visibleCards(view)) : {});
  const fields = selected?.fields(picks) ?? [];
  const step = activeStep(fields, picks, current?.step);
  const targetIds = new Set(step?.options.flatMap((option) => option.cardId ? [option.cardId] : []) ?? []);
  const chosenIds = new Set(step?.options.filter((option) => picks[step.id]?.includes(option.id)).flatMap((option) => option.cardId ? [option.cardId] : []) ?? []);
  const reveal = choice?.payload as { revealedCards?: CardView[]; cards?: CardView[]; source?: { cardId?: string } } | undefined;
  const rememberedLegends = new Map(snapshot.knownLegends.map(card => [card.instanceId, card]));
  const cards = [...visibleCards(view), ...(reveal?.revealedCards ?? reveal?.cards ?? []), ...snapshot.peeks];
  const tableEffects = (['player', 'rival'] as const).flatMap((seat) => (view.players[seat].activeEffects ?? []).map((effect) => ({ seat, effect })));
  const hand = zoneCards(view.players.player, 'hand');
  const handIds = new Set(hand.map((card) => card.instanceId));
  const combat = view.attackState;
  const waiting = !actions.length && view.prompt.status === 'waiting';
  const inspected = inspection?.state === stateKey ? inspection.card : undefined;
  const menu = context?.state === stateKey ? context : undefined;
  const hovered = preview?.state === stateKey ? preview : undefined;
  const sourceId = selected ? decisionSource(view, selected, picks, cards)?.instanceId : reveal?.source?.cardId;
  const command = commandPresentation({ view, actions, selected, active: step, busy, playback: !!playback, rolling });
  const decisionTitle = command.title;
  const turnKey = setup ? 'setup' : `${view.turnNumber}:${view.activePlayerId}`;
  const [firstTurn] = useState(turnKey);
  useEffect(() => {
    if (opening.showing) {
      introSkip.current?.focus({ preventScroll: true });
      restoreOpeningFocus.current = true;
    } else if (restoreOpeningFocus.current) {
      restoreOpeningFocus.current = false;
      const command = grid.current?.querySelector<HTMLElement>('.play-command-inner');
      (choice?.type === 'chooseFirstPlayer' ? command : command?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? command)?.focus({ preventScroll: true });
    }
  }, [opening.showing, choice?.type]);
  // Movement follows each public frame: the player's own result, then every rival move in turn.
  useTableMotion(table, { key: opening.showing ? '' : `${stateKey}:${playback?.beat.id ?? ''}`, view, beat: playback?.beat ?? feedback,
    reducedBeats: reduced && snapshot.presentation ? [...(snapshot.presentation.feedback ? [snapshot.presentation.feedback] : []), ...snapshot.presentation.beats] : undefined,
    hasRolls: snapshot.gigRolls.length > 0, enabled: !reduced, pace: playback ? beatPace(playback.count) : 1,
    openingHand: !!snapshot.openingDeal && setup && !opening.skipped, sound: cue });
  useMatchSound(snapshot, playback?.beat ?? feedback, reduced, cue, opening.showing);

  useEffect(() => {
    if (!focusAfter.current) return;
    focusAfter.current = false;
    // In order of usefulness: confirm a ready decision, else the step in progress, else the bar itself.
    const targets = ['.play-decision-tray [data-confirm-move]:not(:disabled)', '.play-decision-tray [data-step][aria-pressed=true]', '.play-decision-tray button:not(:disabled)', '.play-command-inner'];
    for (const target of targets) {
      const element = grid.current?.querySelector<HTMLElement>(target);
      if (element) { element.focus({ preventScroll: true }); break; }
    }
  }, [stateKey, selection, current?.step]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  useEffect(() => {
    const clear = () => { clearTimeout(hoverTimer.current); setPreview(undefined); };
    window.addEventListener('resize', clear);
    document.addEventListener('scroll', clear, true);
    return () => { window.removeEventListener('resize', clear); document.removeEventListener('scroll', clear, true); };
  }, []);

  function clearHover() { clearTimeout(hoverTimer.current); setPreview(undefined); setArrow(undefined); }
  function setChoice(selection: number | undefined, chosen: Picks, step?: string) {
    // Payment starts filled in, so an ordinary play is one confirmation. The sources stay selectable on the mat.
    const picks = selection !== undefined && actions[selection] ? suggestPayment(actions[selection], chosen, visibleCards(view)) : chosen;
    const next = { matchId: snapshot.matchId, state: view.stateID, selection, picks, step };
    setDecision(next);
    try { localStorage.setItem(decisionKey, JSON.stringify(next)); } catch { /* Optional UI state. */ }
  }
  function commit(intent: Intent, thrown?: { dieId: string; release: PointerRelease }) {
    const action = actions[intent.action];
    if (busy || submitLock.current === stateKey || !action || !isReady(action.fields(intent.picks), intent.picks)) return;
    submitLock.current = stateKey;
    setDieThrow(thrown && { ...thrown, matchId: snapshot.matchId, fromState: view.stateID });
    clearHover(); setContext(undefined); setNotice('');
    send(action.move(intent.picks));
  }
  // A rejected command is safe to retry, without permitting a double submission while pending.
  useEffect(() => { if (!busy) submitLock.current = undefined; }, [busy, error, stateKey]);

  function beginIntent(intent: Intent, immediate = false) {
    const action = actions[intent.action];
    if (!action || busy) return;
    clearHover(); setContext(undefined); setNotice(''); setPanel(undefined);
    focusAfter.current = true;
    if (immediate && (!choice || !action.fields({}).length) && !action.fields(intent.picks).some((field) => field.id === 'payment') && isReady(action.fields(intent.picks), intent.picks)) commit(intent);
    else setChoice(intent.action, intent.picks);
  }
  function chooseValue(fieldId: string, value: string) {
    if (busy || !selected || selection === undefined) return;
    const next = updatePick(selected, picks, fieldId, value);
    if (!next) return;
    clearHover();
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
    clearHover(); setContext(undefined); focusReturn.current = trigger; setInspection({ state: stateKey, card: !card.definitionId ? rememberedLegends.get(card.instanceId) ?? card : card });
  }
  function closeMenu() { context?.trigger?.focus({ preventScroll: true }); setContext(undefined); }
  function handleDrop(card: CardView, destination: Destination, release: PointerRelease) {
    const intents = dropIntents(actions, card, destination);
    if (intents.length === 1) {
      const [intent] = intents;
      if (actions[intent.action].id !== 'gainGig') { beginIntent(intent, true); return; }
      const field = table.current?.querySelector('[data-zone="field:player"]')?.getBoundingClientRect();
      commit(intent, field?.width && field.height ? { dieId: card.instanceId, release: releaseOnField(release, field) } : undefined);
    }
    else if (intents.length > 1) {
      const trigger = grid.current?.querySelector<HTMLElement>(`[data-board-card="${CSS.escape(card.instanceId)}"]`);
      if (trigger) showMenu(card, trigger, intents);
    }
  }
  const gigChoice = selected?.id === 'gainGig';
  const spatial = new Set(['playCard', 'sellCard', 'goSolo', 'attackUnit', 'attackRival', 'useBlocker']);
  const canDrag = (card: CardView) => cardIntents(actions, card.instanceId).some((intent) => gigChoice ? actions[intent.action].id === 'gainGig' : spatial.has(actions[intent.action].id));
  const dragControl = useTableDrag({ stateKey, enabled: !busy && !view.gameEnded && (!selected || gigChoice),
    eligible: canDrag,
    accept: (card, destination) => dropIntents(actions, card, destination).length > 0,
    drop: handleDrop, begin: () => { clearHover(); setContext(undefined); setNotice(''); },
    rejected: () => setNotice(gigChoice ? 'Drop a die onto your field to roll it.' : 'Card returned. Drop onto a highlighted destination.'),
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
    const rect = element.getBoundingClientRect();
    // Read during a decision too, but never hide its controls, targets or the hand.
    const blocked = [...(grid.current?.querySelectorAll<HTMLElement>('.play-hand, .play-command-inner, .play-drawer, [data-target="true"]') ?? [])]
      .map((node) => node.getBoundingClientRect()).filter((box) => box.width && box.height);
    const position = previewPosition(rect, { width: innerWidth, height: innerHeight }, blocked);
    if (position) hoverTimer.current = setTimeout(() => setPreview({ state: stateKey, card, ...position }), 400);
  }
  function renderCard(card: CardView, fallback = 'Face-down card', fan?: { index: number; count: number }) {
    const printing = vaultCard(card);
    const name = printing?.name ?? card.cardName ?? fallback;
    const target = !busy && targetIds.has(card.instanceId);
    const dragLegal = !selected && canDrag(card) && !busy;
    const dropLegal = drag && dropIntents(actions, drag.card, { key: card.instanceId === combat?.attackerId ? 'attacker' : 'card', cardId: card.instanceId }).length > 0;
    const inHand = handIds.has(card.instanceId);
    const unavailable = view.gamePhase === 'main' && inHand && view.prompt.status === 'action'
      && !actions.some((action) => action.id === 'playCard' && action.fields({})[0]?.options.some((option) => option.cardId === card.instanceId)) && !target;
    const combatRole = combat?.attackerId === card.instanceId ? 'Attacking' : combat?.defenderId === card.instanceId ? 'Defending' : undefined;
    const effectTarget = playback?.beat.targetIds.includes(card.instanceId);
    const effectSource = playback?.beat.source?.instanceId === card.instanceId;
    const visibleRole = combatRole ?? (effectTarget ? 'Target' : effectSource ? 'Source' : undefined);
    const remembered = rememberedLegends.has(card.instanceId);
    const state = [visibleRole, card.spent && 'Spent', card.hasLag && 'Lag', remembered && 'Known', !!card.damage && `${card.damage} dmg`].filter(Boolean).join(' · ');
    const power = card.zone === 'field' && card.type !== 'gear' ? card.effectivePower : undefined;
    const cost = card.effectiveCost ?? card.cost;
    const repriced = inHand && cost != null && card.cost != null && cost !== card.cost;
    const change = feedback?.changes.find((item) => item.card?.instanceId === card.instanceId);
    return <div key={card.instanceId} className="play-card-shell" data-dragging={drag?.card.instanceId === card.instanceId}
      style={fan && { '--i': fan.index, '--n': fan.count } as CSSProperties}>
      <button type="button" className="play-card" disabled={!!playback} data-card-id={card.instanceId} data-board-card={card.instanceId}
        data-drop-zone={card.instanceId === combat?.attackerId ? 'attacker' : undefined} data-drop-available={!!dropLegal} data-drop-over={drag?.destination?.cardId === card.instanceId}
        data-source={!!selected && sourceId === card.instanceId} data-target={target} data-unplayable={unavailable || undefined} data-spent={card.spent} data-combat={!!combatRole} data-combat-role={combatRole?.toLowerCase()} data-effect-target={effectTarget || undefined} data-effect-source={effectSource || undefined} data-feedback={change?.kind} data-color={printing?.color} data-draggable={dragLegal}
        data-power-shift={power != null && power !== card.power ? power > card.power ? 'up' : 'down' : undefined}
        aria-pressed={target ? chosenIds.has(card.instanceId) : undefined} aria-label={[name, state, power != null && `power ${power}`, repriced && `costs ${cost}`, target && 'selectable'].filter(Boolean).join(', ')}
        onPointerDown={(event) => dragControl.start(event, card)} onDragStart={(event) => event.preventDefault()}
        onMouseEnter={(event) => enterCard(card, event.currentTarget)} onMouseLeave={clearHover}
        onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) enterCard(card, event.currentTarget); }} onBlur={clearHover}
        onKeyDown={(event) => { if (!playback && event.key.toLowerCase() === 'i') { event.preventDefault(); inspect(card, event.currentTarget); } }}
        onClick={(event) => {
          if (playback || dragControl.suppressClick()) return;
          cue?.('select');
          if (pickOnBoard(card.instanceId)) return;
          const intents = availableIntents(card);
          if (event.currentTarget.closest('dialog') || (remembered && !intents.length)) inspect(card, event.currentTarget);
          else showMenu(card, event.currentTarget, intents);
        }}>
        <span className="play-card-art"><CardFace card={card} />
          {printing && <span className="play-art-fallback" aria-hidden="true"><b>{name}</b>{printing.type}</span>}
          {power != null && <span className="play-power" aria-hidden="true">{power}</span>}
          {repriced && <span className="play-cost" aria-hidden="true">{cost} €$</span>}
          {state && <small>{visibleRole ?? state}</small>}
        </span><span className="play-card-name">{name}</span>
      </button>
      <button type="button" className="play-details" disabled={!!playback} aria-label={`Details for ${name}`} title="Inspect card · I" onClick={(event) => inspect(card, event.currentTarget)}>i</button>
      {feedback && change && (change.kind === 'power' || change.kind === 'called') && <span className="play-float" key={feedback.id} data-tone={(change.amount ?? 0) < 0 ? 'down' : 'up'} aria-hidden="true">{change.label}</span>}
    </div>;
  }
  function actionButton(index: number, label?: string, className = 'btn quiet') {
    const action = actions[index];
    return <button key={`${action.id}:${index}`} type="button" className={className} disabled={busy || (!!selected && !choice && ['passPhase', 'resolveAttack'].includes(action.id))} data-move={action.id} data-action-index={index}
      aria-pressed={action.fields({}).length ? selection === index : undefined} onClick={() => beginIntent({ action: index, picks: {} }, true)}>{label ?? action.label}</button>;
  }
  const special = actions.map((action, index) => ({ action, index })).filter(({ action }) => !action.fields({}).length);
  const log = snapshot.log;
  const outcome = feedback && { id: feedback.id, changes: feedback.changes };
  const targeting = { snapshot, outcome, onPick: pickOnBoard, targetIds: busy ? new Set<string>() : targetIds, chosenIds, effectIds: new Set(playback?.beat.targetIds ?? []), dropZones, dropOver };
  const shownArrow = drag?.destination && (drag.destination.cardId || drag.destination.key === 'gigs:rival')
    ? { x1: drag.originX, y1: drag.originY, x2: drag.x, y2: drag.y } : arrow?.state === stateKey && !drag ? arrow : undefined;
  const yourTurn = view.activePlayerId === 'player';
  const playing = !setup && !view.gameEnded;
  const face = (card: CardView) => <CardFace card={card} />;
  const resolveButtons = special.filter(({ action }) => action.id === 'resolveAttack').map(({ index }) => actionButton(index));
  const turnButtons = special.filter(({ action }) => !choice && ['passPhase', 'resolveAttack'].includes(action.id) && !(combat && action.id === 'resolveAttack'))
    .map(({ action, index }) => actionButton(index, undefined, action.id === 'passPhase' ? 'btn play-end-turn' : 'btn quiet'));
  const canSell = yourTurn && view.players.player.eddies === 0 && actions.some(action => action.id === 'sellCard');
  const hint = busy ? 'Resolving the move.' : waiting ? 'The rival is choosing a move.'
    : canSell ? 'Select a card to play it or sell it for an Eddie.' : 'Select a card or drag it to a highlighted destination.';
  const closePanel = <button type="button" className="btn quiet" aria-label="Close panel" onClick={() => setPanel(undefined)}>×</button>;
  if (campaign && view.gameEnded) return <CampaignMatchResult details={campaign} snapshot={snapshot}
    busy={busy} error={error} onContinue={rematch} />;

  return <div ref={grid} className="play-grid play-direct" data-match-id={snapshot.matchId} data-state-id={view.stateID} data-busy={busy} data-playback={!!playback} data-campaign={!!campaign}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && opening.showing) { event.preventDefault(); opening.skip(); return; }
      if (event.key !== 'Escape' || drag || inspected || menu || (event.target as HTMLElement).closest('dialog[open]')) return;
      if (panel) setPanel(undefined);
      else { setChoice(choice ? defaultSelection : undefined, {}); clearHover(); }
    }}>
    <header className="play-match-header" inert={opening.showing}>
      <div className="play-match-identity">
        {contract ? <button type="button" className="play-eyebrow circuit-contract-trigger" aria-expanded={panel === 'contract'} aria-controls={`${panelId}-contract`} onClick={() => setPanel(panel === 'contract' ? undefined : 'contract')} title="View contract objective">◆ {contract.title} <span>/</span> {error ? 'Match alert' : saving ? 'Saving…' : 'Saved'}</button>
          : <p className="play-eyebrow" title={error ? 'See the match alert below' : saving ? 'Saving the current match' : 'Match saved in this browser'}>{campaign?.title ?? 'Practice table'}{campaign?.act && <> <span>/</span> Act {campaign.act}</>} <small data-match-error={!!error || undefined}>{error ? 'Match alert' : saving ? 'Saving…' : 'Saved'}</small></p>}
        <h1 title={`${names.player} vs. ${names.rival}`}>{names.player} <span>vs.</span> {names.rival}</h1>
      </div>
      <div className="play-header-actions">
        {tableEffects.length > 0 && <button type="button" className="btn quiet" aria-expanded={panel === 'effects'} aria-controls={`${panelId}-effects`} onClick={() => setPanel(panel === 'effects' ? undefined : 'effects')}>Effects <b>{tableEffects.length}</b></button>}
        <button type="button" className="btn quiet" aria-expanded={panel === 'log'} aria-controls={`${panelId}-log`} onClick={() => setPanel(panel === 'log' ? undefined : 'log')}>Log <b>{log.length}</b></button>
        {navigation}
        <details className="play-more play-match-options" ref={menuRef}
          onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
          onKeyDown={event => { if (event.key === 'Escape' && event.currentTarget.open) { event.stopPropagation(); event.preventDefault(); closeOptions(); } }}>
          <summary className="btn quiet" aria-label="Match options">…</summary>
          <div className="play-more-actions">
            {!view.gameEnded && <button type="button" className="btn quiet" aria-expanded={panel === 'actions'} aria-controls={`${panelId}-actions`}
              disabled={!!playback} onClick={() => { closeOptions(); setPanel(panel === 'actions' ? undefined : 'actions'); }}>All actions</button>}
            {(audio || radioContainer) && <div className="play-match-audio" role="group" aria-label="Audio">
              {radioContainer && <button type="button" className="btn quiet" aria-expanded={radioOpen} aria-controls={`${panelId}-radio`}
                onClick={() => { closeOptions(); setRadioOpen(!radioOpen); }}>Afterhours Radio</button>}
              {audio}
            </div>}
            {controls && <div className="play-match-utilities" role="group" aria-label="Match utilities" onClick={event => {
              const button = (event.target as HTMLElement).closest('button');
              if (button && !button.disabled) closeOptions();
            }}>{controls}</div>}
          </div>
        </details>
      </div>
    </header>
    {radioContainer && <section ref={radioPanel} tabIndex={-1} className="play-radio-panel" id={`${panelId}-radio`} hidden={!radioOpen} aria-label="Afterhours Radio">
      <div ref={radioContainer} />
      <button type="button" className="btn quiet" onClick={closeRadio}>Close radio</button>
    </section>}
    {panel === 'contract' && contract && <section id={`${panelId}-contract`} className="play-drawer circuit-table-brief" aria-label="Contract objective">
      <div className="play-drawer-head"><h3>{contract.title}</h3>{closePanel}</div>
      <p>{contract.briefing}</p><div className="circuit-bonus"><span>◆ Bonus mark</span><p>{contract.bonus}</p></div>
      <p>Win to clear the contract. Win at Masterful to earn the third mark. Every mark stays earned.</p>
    </section>}
    {panel === 'effects' && <section id={`${panelId}-effects`} className="play-drawer play-table-effects" aria-label="Table effects">
      <div className="play-drawer-head"><h3>Table effects</h3>{closePanel}</div>
      {tableEffects.length ? tableEffects.map(({ seat, effect }, index) => {
        const source = cards.find((card) => card.instanceId === effect.sourceCardId && card.definitionId);
        const printing = source && vaultCard(source);
        return <article key={`${seat}:${effect.id}:${index}`}><h4>{effect.sourceName}</h4><p className="play-effect-scope">{seat === 'player' ? 'Your side' : 'Rival side'} · {effect.durationLabel ?? 'While active'}</p>
          <p>{effect.detail}</p>{printing && <details><summary>Source card rules</summary><p><Rules text={printing.text} /></p></details>}</article>;
      }) : <p className="play-empty">No table effects remain.</p>}
    </section>}
    {panel === 'actions' && !playback && !view.gameEnded && <section id={`${panelId}-actions`} className="play-drawer" aria-label="All actions">
      <div className="play-drawer-head"><h3>All actions</h3>{closePanel}</div>
      {actions.length ? <div className="play-actions play-moves">{actions.map((_, index) => actionButton(index))}</div> : <p className="play-empty">No actions are available right now.</p>}
      <p className="play-controls-hint">Click to select · Drag to act<br />I to inspect · Esc to cancel selection</p>
    </section>}
    {panel === 'log' && <aside id={`${panelId}-log`} className="play-drawer play-log" aria-label="Match activity">
      <div className="play-drawer-head"><h3>Action log</h3>{closePanel}</div>
      {log.length ? <ol>{log.slice().reverse().map((entry) => <li key={entry.id}><small>T{entry.turn} · {entry.seat === 'player' ? 'You' : 'Rival'}</small><span>{entry.text}</span></li>)}</ol>
        : <p className="play-empty">Match events appear here.</p>}
    </aside>}
    <div ref={table} className="play-table" inert={opening.showing} data-opening={opening.showing || undefined} data-setup-choice={choice?.type === 'chooseFirstPlayer' || undefined} data-turn={playing ? view.activePlayerId : undefined} data-combat={!!combat} data-ended={view.gameEnded}>
      <GigRollAnnouncement rolls={snapshot.gigRolls} />
      <RivalBench portrait={campaign?.rival} rolls={rolls} name={names.rival} active={playing && !yourTurn} {...targeting} renderCard={renderCard} renderFace={face} />
      <SeatField seat="rival" active={playing && !yourTurn} {...targeting} renderCard={renderCard} />
      <GigZones {...targeting} />
      <div className="play-command" data-presentation={command.variant} data-attention={command.attention} data-reduced={reduced || undefined} data-seat={playing ? view.activePlayerId : undefined} data-state={playback ? 'playback' : selected || choice || setup ? 'decision' : combat ? 'combat' : 'idle'}>
        <div className="play-command-inner" tabIndex={-1}>
          {command.attention === 'mandatory' && <span className="play-command-arrival" key={`${snapshot.matchId}:${command.cueKey}`} aria-hidden="true" />}
          <div className="play-turn-plate"><span>{setup ? 'Setup' : view.overtimeActive ? `Overtime · Turn ${view.turnNumber}` : `Turn ${view.turnNumber}`}</span>
            <strong>{view.gameEnded ? 'Match over' : setup ? command.variant === 'opening-hand' ? 'Opening hand' : 'Opening' : yourTurn ? 'Your turn' : 'Rival turn'}</strong></div>
          <h2 className="sr-only" aria-live="polite">{decisionTitle}</h2>
          {view.gameEnded ? <div className="play-command-lead"><strong>{decisionTitle}</strong><p>{winReasons[view.winReason ?? ''] ?? 'Match ended'}</p></div>
            : playback ? <>{combat && <CombatBanner view={view} watching compact />}<PlayPresentation playback={playback} /></>
            : selected ? <div className="play-table-decision" key={stateKey}>
              <PlayChoices presentation={command} context={combat && <CombatBanner view={view} watching={false} compact inspect={inspect} />} view={view} action={selected} picks={picks} fields={fields} active={step} cards={cards} busy={busy} forced={!!choice} revealed={reveal?.revealedCards} select={chooseValue}
                step={(id) => { clearHover(); setChoice(selection, picks, id); }} reorder={(field, ids) => { const next = reorderPick(selected, picks, field, ids); if (next) setChoice(selection, next, field); }}
                submit={() => selection !== undefined && commit({ action: selection, picks })}
                cancel={() => { setChoice(choice ? defaultSelection : undefined, {}); clearHover(); }}
                inspect={inspect} alternatives={choice ? special.map(({ index }) => actionButton(index)) : combat ? resolveButtons : null} /></div>
            : choice || setup ? <div className="play-opening-choices">
              {combat && <CombatBanner view={view} watching={false} compact inspect={inspect} />}
              <div className="play-command-lead">
                <h3>{decisionTitle}</h3>
                {command.detail && <p><Rules text={command.detail} /></p>}
              </div>
              <div className="play-command-actions">{actions.map((action, index) => actionButton(index, undefined, action.id === 'keepHand' ? 'btn play-confirm' : 'btn quiet'))}</div>
            </div>
            : combat ? <div className="play-table-decision play-combat-decision"><div className="play-command-lead"><h3>{decisionTitle}</h3><p>{command.detail}</p></div>
              <CombatBanner view={view} watching={false} compact inspect={inspect} controls={resolveButtons} /></div>
            : <><div className="play-command-lead"><strong>{decisionTitle}</strong>
              <p role="status">{feedback && !busy ? <><b>{feedback.seat === 'player' ? 'You' : 'Rival'}</b> {feedback.text}</> : hint}</p></div>{turnButtons.length > 0 && <div className="play-command-actions">{turnButtons}</div>}</>}
          {error && <p className="play-error" role="alert">{error}</p>}
        </div>
      </div>
      <SeatField seat="player" active={playing && yourTurn} {...targeting} renderCard={renderCard}
        overlay={dropZones.has('program') && <div className="play-program-drop" data-drop-zone="program" data-drop-available="true" data-drop-over={dropOver === 'program'}>Play Program</div>} />
      <PlayerBench rolls={rolls} active={playing && yourTurn} {...targeting} dieDrag={gigChoice ? dragControl : undefined} renderCard={renderCard} renderFace={face}>
        <section className="play-hand" data-zone="hand:player" data-crowded={hand.length > 9 || undefined} aria-label="Your hand">
          <div className="play-card-row">{hand.length ? hand.map((card, index) => renderCard(card, undefined, { index, count: hand.length })) : !setup && <span className="play-empty">No cards in hand</span>}</div>
        </section>
      </PlayerBench>
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
      {playing && turnKey !== firstTurn && <div className="play-turn-banner" key={turnKey} data-seat={view.activePlayerId} aria-hidden="true">
        <span>Turn {view.turnNumber}</span><strong>{yourTurn ? 'Your turn' : 'Rival turn'}</strong>
      </div>}
      {view.gameEnded && <MatchResult view={view} report={snapshot.report} receipt={snapshot.circuit?.receipt} circuit={circuit} title={decisionTitle} reason={winReasons[view.winReason ?? ''] ?? 'Match ended'} busy={busy} rematch={rematch} edit={edit} />}
      <span className="sr-only" role="status">{notice}{busy ? ' Resolving move.' : ''}</span>
      {notice && <p className="play-table-notice">{notice}</p>}
      {rolling && <PlayGigRoll key={view.stateID} rolls={rolls} thrown={activeThrow} cue={cue} />}
    </div>
    {opening.showing && <section className="play-intro" aria-labelledby={`${panelId}-intro`} data-reduced={reduced || undefined}
      style={{ '--play-opening-duration': `${opening.duration}ms` } as CSSProperties}>
      <div className="play-intro-copy">
        <p>{campaign ? 'The Afterlife // Campaign' : 'Free Play'}</p>
        <h2 id={`${panelId}-intro`}>{campaign?.title ?? contract?.title ?? 'Match start'}<span aria-hidden="true">.</span></h2>
        <div className="play-intro-matchup"><strong>{names.player}</strong><i>vs.</i><strong>{names.rival}</strong></div>
      </div>
      <button ref={introSkip} type="button" className="btn quiet play-intro-skip" onClick={opening.skip}>Skip intro</button>
    </section>}
    {menu && <ContextMenu context={menu} close={closeMenu}>{menu.intents.map((intent, index) => <button key={index} type="button" className="btn play-card-menu-action" data-context-action={actions[intent.action].id}
      onClick={() => beginIntent(intent, true)}><span>{intentLabel(actions[intent.action], intent.picks, menu.card)}</span><span aria-hidden="true">→</span></button>)}
      {menu.intents.some((intent) => actions[intent.action].id === 'activateAbility') && vaultCard(menu.card) && <details className="play-menu-rules"><summary>Printed abilities</summary><Rules text={vaultCard(menu.card)!.text} /></details>}
      {!menu.intents.length && <p className="play-choice-detail">{selected ? 'Finish or cancel the current selection to start another action.' : 'No action available for this card now.'}</p>}
      <button type="button" className="btn play-card-menu-action" onClick={() => inspect(menu.card, menu.trigger)}><span>Details</span><span aria-hidden="true">→</span></button></ContextMenu>}
    {hovered && !drag && !menu && !inspected && createPortal(<div className="play-hover-preview" data-landscape={hovered.landscape} style={{ left: hovered.x, top: hovered.y }} aria-hidden="true"><CardFace card={hovered.card} /><div className="play-hover-copy">
      <strong>{hovered.card.cardName ?? 'Concealed card'}</strong>
      {hovered.card.definitionId && <p>{hovered.card.type !== 'gear' && hovered.card.type !== 'program' && <>Power <b>{hovered.card.effectivePower}</b> · </>}
        Cost <b>{hovered.card.effectiveCost ?? hovered.card.cost ?? '—'} €$</b>{hovered.card.spent && ' · Spent'}{hovered.card.hasLag && ' · Lag'}</p>}
      {hovered.landscape && vaultCard(hovered.card) && <div className="play-hover-rules"><Rules text={vaultCard(hovered.card)!.text} /></div>}
      <small>I to inspect rules and effects</small></div></div>, document.body)}
    {drag && createPortal(<div className="play-drag-ghost" data-kind={gigChoice ? 'die' : undefined} style={gigChoice ? { left: drag.x - 25, top: drag.y - 25, width: 50 } : { left: drag.x + 12, top: drag.y - 35, width: Math.max(65, Math.min(drag.width, 110)) }} aria-hidden="true">{gigChoice ? <DieFace type={drag.card.definitionId} /> : <CardFace card={drag.card} />}<span>{gigChoice ? (drag.destination ? 'Release to roll' : 'Drag onto your field') : (drag.destination ? 'Release to choose this action' : 'Choose a highlighted destination')}</span></div>, document.body)}
    {combat && <CombatArrow view={view} root={grid} />}
    {shownArrow && createPortal(<svg className="play-target-arrow" aria-hidden="true"><defs><marker id="play-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 6 3 0 6" /></marker></defs><path d={`M${shownArrow.x1} ${shownArrow.y1} Q${shownArrow.x1} ${shownArrow.y2} ${shownArrow.x2} ${shownArrow.y2}`} markerEnd="url(#play-arrowhead)" /></svg>, document.body)}
    {inspected && <CardInspection card={inspected} cards={cards} hostName={cards.find((card) => card.instanceId === inspected.attachedToId)?.cardName ?? undefined} shortcuts={[]} onClose={() => { setInspection(undefined); focusReturn.current?.focus({ preventScroll: true }); }} />}
  </div>;
}
