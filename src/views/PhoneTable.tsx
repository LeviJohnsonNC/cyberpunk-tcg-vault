import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CardView, MatchSnapshot, Seat } from '../lib/play/protocol';
import { zoneCards, zoneCount } from '../lib/play/matchView';
import { CardFace } from './PlayCard';
import './phone-table.css';

export interface PhoneTableProps {
  snapshot: MatchSnapshot;
  names: Record<Seat, string>;
  title: string;
  turn: string;
  busy: boolean;
  decision: ReactNode;
  combat: ReactNode;
  history: ReactNode;
  actions: ReactNode;
  navigation?: ReactNode;
  error?: string;
  eligible: Set<string>;
  chosen: Set<string>;
  inspect: (card: CardView, trigger: HTMLElement) => void;
  pick: (id: string) => boolean;
}

function CardLane({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState('');
  useLayoutEffect(() => {
    const lane = strip.current;
    if (!lane) return;
    function measure() {
      if (!lane || lane.scrollWidth <= lane.clientWidth + 1) { setRange(''); return; }
      const { left, right } = lane.getBoundingClientRect();
      const visible = Array.from(lane.children).flatMap((tile, i) => {
        const box = tile.getBoundingClientRect();
        return box.left < right - 12 && box.right > left + 12 ? [i + 1] : [];
      });
      setRange(visible.length ? `${visible[0]}–${visible.at(-1)} of ${count}` : '');
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lane);
    lane.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); lane.removeEventListener('scroll', measure); };
  }, [count]);
  return <><div ref={strip} className="phone-strip" role="group" aria-label={label}>{children}</div>{range && <small className="phone-range">{range}</small>}</>;
}

const resourceLabels = {
  legendArea: 'Legends', eddieArea: 'Eddies', gigArea: 'Gigs', fixerArea: 'Fixer dice',
  field: 'Attached Gear', trash: 'Trash', removedFromGame: 'Removed from game',
};

function resourceName(card: CardView, slot: number) {
  if (card.zone === 'eddieArea') return `Eddie ${slot}`;
  if (card.zone === 'fixerArea') return card.definitionId;
  if (card.zone === 'gigArea') return `${card.definitionId} · ${card.power}`;
  return card.cardName ?? (card.zone === 'legendArea' ? `Legend slot ${slot}` : 'Face-down card');
}

function Sheet({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  const dismiss = () => ref.current?.close();
  return <dialog ref={ref} className="phone-sheet" aria-labelledby={id} onClose={close}
    onClick={event => { if (event.target === ref.current) dismiss(); }}>
    <div className="phone-sheet-inner"><header><h2 id={id}>{title}</h2><button type="button" className="btn quiet" onClick={dismiss}>Close</button></header>{children}</div>
  </dialog>;
}

export function PhoneTable({ snapshot, names, title, turn, busy, decision, combat, history, actions, navigation, error, eligible, chosen, inspect, pick }: PhoneTableProps) {
  const { view } = snapshot;
  const [sheet, setSheet] = useState<'Match log' | 'All actions' | Seat>();
  const [equipment, setEquipment] = useState<CardView>();
  const equipmentCards = equipment && Object.values(view.players).flatMap(player => zoneCards(player, 'field')).filter(card => card.attachedToId === equipment.instanceId);
  const hand = zoneCards(view.players.player, 'hand');
  const cardTile = (card: CardView, slot: number, gearCount = 0) => {
    const id = card.instanceId;
    const name = card.cardName || (card.zone === 'legendArea' ? `Legend slot ${slot}` : 'Face-down card');
    const target = eligible.has(id);
    const fieldUnit = card.zone === 'field' && card.type !== 'gear';
    const stats = [fieldUnit && `Power ${card.effectivePower}`, card.spent && 'Spent', card.hasLag && 'Lag'].filter(Boolean).join(' · ');
    const role = view.attackState?.attackerId === id ? 'Attacker' : view.attackState?.defenderId === id ? 'Defender' : undefined;
    return <div className="phone-slot" key={id} data-selected={chosen.has(id) || undefined}>
      <button type="button" className="phone-card" data-board-card={id} data-target={target || undefined} aria-pressed={target ? chosen.has(id) : undefined}
        aria-label={[name, stats, role, target && 'eligible'].filter(Boolean).join(', ')} onClick={event => {
          if (!busy && target && pick(id)) return;
          inspect(card, event.currentTarget);
        }}>
        <span className="phone-art"><CardFace card={card} />{fieldUnit && <b>{card.effectivePower}</b>}</span>
        <span className="phone-card-name">{name}</span>
        {(role || card.spent || card.hasLag || chosen.has(id)) && <small>{chosen.has(id) ? 'Selected' : role || (card.spent ? 'Spent' : 'Lag')}</small>}
      </button>
      {gearCount > 0 && <button type="button" className="phone-details" aria-label={`Attached Gear on ${name}, slot ${slot}`} onClick={() => setEquipment(card)}>Gear · {gearCount}</button>}
      {target && <button type="button" className="phone-details" aria-label={`Details for ${name}`} onClick={event => inspect(card, event.currentTarget)}>Details</button>}
    </div>;
  };
  function side(seat: Seat) {
    const player = view.players[seat];
    const field = zoneCards(player, 'field');
    const legends = zoneCards(player, 'legendArea');
    const cards = [...field.filter(card => !card.attachedToId), ...legends, ...zoneCards(player, 'resolvingProgram')];
    const label = seat === 'player' ? 'Your field' : 'Rival field';
    return <section className="phone-side" data-seat={seat} aria-label={label}>
      <header><div><h2>{label}</h2><span>{player.gigCount} {player.gigCount === 1 ? 'Gig' : 'Gigs'} · {player.availableEddies} €$ · {player.streetCred} Cred</span></div>
        <button type="button" className="phone-piles" aria-label={seat === 'player' ? 'Your resources and piles' : 'Rival resources and piles'} onClick={() => setSheet(seat)}>Piles</button></header>
      <CardLane label={label + ' cards'} count={cards.length}>{cards.map((card, index) => cardTile(card, card.zone === 'legendArea' ? legends.indexOf(card) + 1 : index + 1, field.filter(item => item.attachedToId === card.instanceId).length))}</CardLane>
    </section>;
  }
  const resourceSeat = sheet === 'player' || sheet === 'rival' ? sheet : undefined;
  const resource = resourceSeat && view.players[resourceSeat];
  return <div className="phone-table" data-combat={!!view.attackState || undefined} data-match-id={snapshot.matchId} data-state-id={view.stateID} data-busy={busy}>
    <header className="phone-match-head"><div><p>{title}</p><h1>{names.player} <i>vs</i> {names.rival}</h1></div>
      <button type="button" className="btn quiet" onClick={() => setSheet('Match log')}>Log</button></header>
    <div className="phone-board">{side('rival')}{side('player')}</div>
    <section className="phone-hand" aria-label="Your hand"><header><h2>Your hand <b>{hand.length}</b></h2></header>
      <CardLane label="Cards in your hand" count={hand.length}>{hand.map((card,index) => cardTile(card, index + 1))}{!hand.length && <span className="play-empty">No cards in hand</span>}</CardLane></section>
    <section className="phone-command" aria-label="Match decision"><header><p aria-live="polite">{turn}</p>
      <button type="button" className="phone-more" aria-label="All actions" onClick={() => setSheet('All actions')}>Actions</button></header>
      {combat}<div className="phone-controls">{decision}{error && <p role="alert">{error}</p>}</div>
    </section>
    {equipment && equipmentCards && <Sheet title={`Gear on ${equipment.cardName ?? 'Legend'}`} close={() => setEquipment(undefined)}>
      <div className="phone-resource-list">{equipmentCards.map(card => <button type="button" className="btn quiet" key={card.instanceId} onClick={event => inspect(card, event.currentTarget)}>{card.cardName ?? 'Face-down card'}</button>)}</div>
    </Sheet>}
    {sheet && <Sheet title={resourceSeat ? resourceSeat === 'player' ? 'Your resources and piles' : 'Rival resources and piles' : sheet} close={() => setSheet(undefined)}>
      {sheet === 'Match log' && history}
      {sheet === 'All actions' && <><div className="phone-action-list" onClick={event => { if ((event.target as HTMLElement).closest('button:enabled')) event.currentTarget.closest('dialog')?.close(); }}>{actions}</div>{navigation}</>}
      {resource && <><p>Deck {zoneCount(resource, 'deck')} · Hand {zoneCount(resource, 'hand')} · Trash {zoneCount(resource, 'trash')}</p>
        {Object.entries(resourceLabels).map(([zone, label]) => {
          const cards = zoneCards(resource, zone).filter(card => zone !== 'field' || card.attachedToId);
          return cards.length > 0 && <section key={zone}><h3>{label}</h3><div className="phone-resource-list">{cards.map((card,index) => {
            const host = card.attachedToId && [...zoneCards(resource, 'field'), ...zoneCards(resource, 'legendArea')].find(item => item.instanceId === card.attachedToId);
            return <button type="button" className="btn quiet" key={card.instanceId} onClick={event => {
              if (eligible.has(card.instanceId) && pick(card.instanceId)) event.currentTarget.closest('dialog')?.close();
              else inspect(card, event.currentTarget);
            }}>{resourceName(card, index + 1)}{host && ` · on ${host.cardName ?? 'Legend'}`}{card.spent && ' · spent'}</button>;
          })}</div></section>;
        })}</>}
    </Sheet>}
  </div>;
}
