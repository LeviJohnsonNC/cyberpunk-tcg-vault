import { useId, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { CARD_BACK } from '../components/bits';
import eddiesBack from '../assets/play/eddies-back.webp';
import { zoneCards, zoneCount } from '../lib/play/matchView';
import type { CardView, GigRoll, MatchChange, MatchSnapshot, Seat, SeatView } from '../lib/play/protocol';
import { DieFace } from './PlayDice';

type DieDrag = { start: (event: PointerEvent<HTMLElement>, die: CardView) => void; suppressClick: () => boolean };
export type Targeting = { dieDrag?: DieDrag; effectIds?: Set<string>; dropZones?: Set<string>; dropOver?: string; targetIds: Set<string>; chosenIds: Set<string>; onPick: (id: string) => void };
type CardTile = (card: CardView, label?: string) => ReactNode;
/** The latest public outcome, shown where it happened. */
export interface Outcome { id: number; changes: MatchChange[] }
type MatProps = Targeting & { snapshot: MatchSnapshot; renderCard: CardTile; outcome?: Outcome; rolls?: GigRoll[] };

/** A short-lived number that rises from the zone it changed. */
export function ZoneFloat({ outcome, seat, kinds }: { outcome?: Outcome; seat: Seat; kinds: MatchChange['kind'][] }) {
  const changes = outcome?.changes.filter((change) => change.seat === seat && !change.card) ?? [];
  // One number per zone: the first kind that changed (Gigs before the Street Cred they carry).
  const shown = kinds.flatMap((kind) => changes.filter((change) => change.kind === kind)).slice(0, 1);
  if (!outcome || !shown.length) return null;
  return <span className="play-floats" key={outcome.id} aria-hidden="true">{shown.map((change) =>
    <span key={change.kind} className="play-float" data-tone={(change.amount ?? 0) < 0 ? 'down' : 'up'}>{change.kind === 'eddies' ? change.label.replace(' available', '') : change.label}</span>)}</span>;
}

function MatDie({ card, fixer = false, effectIds, targetIds, chosenIds, onPick, dieDrag }: Targeting & { card: CardView; fixer?: boolean }) {
  const target = targetIds.has(card.instanceId);
  const rollAvailable = fixer && target && !!dieDrag;
  const label = fixer ? `Roll ${card.definitionId}` : `${card.definitionId} Gig · ${card.power}`;
  return <button type="button" className={`play-die${fixer ? ' play-die-fixer' : ''}`} aria-label={label} title={label}
    data-card-id={card.instanceId} data-result={effectIds?.has(card.instanceId)} data-target={target} data-roll-available={rollAvailable || undefined} disabled={!target}
    aria-pressed={target ? chosenIds.has(card.instanceId) : undefined}
    onPointerDown={rollAvailable ? (event) => dieDrag?.start(event, card) : undefined}
    onClick={() => { if (!dieDrag?.suppressClick()) onPick(card.instanceId); }}>
    <DieFace type={card.definitionId} value={fixer ? undefined : card.power} />
    {!fixer && <small>{card.definitionId}</small>}
  </button>;
}

export function GigZones({ snapshot, outcome, ...targeting }: Targeting & { snapshot: MatchSnapshot; outcome?: Outcome }) {
  return <div className="play-gig-zones">{(['rival', 'player'] as const).map((seat) => {
    const view = snapshot.view.players[seat];
    const gigs = zoneCards(view, 'gigArea');
    return <section key={seat} className="play-gigs" data-seat={seat} data-zone={`gigs:${seat}`} data-drop-zone={`gigs:${seat}`} data-drop-available={targeting.dropZones?.has(`gigs:${seat}`)} data-drop-over={targeting.dropOver === `gigs:${seat}`} aria-label={seat === 'player' ? 'Your Gigs' : 'Rival Gigs'}>
      <h3 className="play-gig-count play-eyebrow">{seat === 'player' ? 'Your Gigs' : 'Rival Gigs'} <span>{view.gigCount}</span></h3>
      <div className="play-dice">{gigs.length ? gigs.map((card) => <MatDie key={card.instanceId} card={card} {...targeting} />) : <span className="play-gig-empty" aria-hidden="true"><i /><i /><i /></span>}</div>
      <span className="play-gig-cred" title="Street Cred is the total value of these Gig dice">Cred <b>{view.streetCred}</b></span>
      <ZoneFloat outcome={outcome} seat={seat} kinds={['gigs', 'cred']} />
    </section>;
  })}</div>;
}

function MatTrash({ seat, trash, removed, renderCard, renderFace }: {
  seat: Seat; trash: CardView[]; removed: CardView[]; renderCard: CardTile; renderFace: (card: CardView) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const top = trash.at(-1);
  const label = seat === 'player' ? 'Your trash' : 'Rival trash';
  return <div className="play-mat-trash">
    <button type="button" className="play-pile play-trash-trigger" aria-haspopup="dialog" aria-label={`${label} · ${trash.length} cards${removed.length ? ` · ${removed.length} removed` : ''}`}
      onClick={() => dialog.current?.showModal()}>
      <span className="play-pile-art" data-anchor={`trash:${seat}`}>{top ? renderFace(top) : <span className="play-empty-pile" aria-hidden="true">↓</span>}</span>
      <span className="play-zone-label">Trash <b>{trash.length}</b></span>
      {removed.length > 0 && <small>Removed {removed.length}</small>}
    </button>
    <dialog ref={dialog} className="al-dialog play-pile-dialog" aria-labelledby={titleId} onClick={(event) => {
      if (event.target === dialog.current) dialog.current?.close();
    }}>
      <div className="al-dialog-body">
        <div className="play-inspect-head"><div><p className="play-eyebrow">Public cards</p><h2 id={titleId}>{label}</h2></div>
          <button type="button" className="btn quiet" onClick={() => dialog.current?.close()}>Close</button></div>
        <section aria-label="Trash"><h3 className="play-eyebrow">Trash <span>{trash.length}</span></h3>
          <div className="play-pile-cards">{trash.length ? trash.slice().reverse().map((card) => renderCard(card)) : <p className="play-empty">No cards in trash.</p>}</div>
        </section>
        {removed.length > 0 && <section aria-label="Removed from game"><h3 className="play-eyebrow">Removed from game <span>{removed.length}</span></h3>
          <div className="play-pile-cards">{removed.map((card) => renderCard(card))}</div>
        </section>}
      </div>
    </dialog>
  </div>;
}

function crew(view: SeatView) {
  const legends = zoneCards(view, 'legendArea');
  const field = zoneCards(view, 'field');
  const hosts = new Set([...legends, ...field].map((card) => card.instanceId));
  const attached = field.filter((card) => card.attachedToId && hosts.has(card.attachedToId));
  const attachedIds = new Set(attached.map((card) => card.instanceId));
  return { legends, field, attached, units: field.filter((card) => !attachedIds.has(card.instanceId)) };
}

function withGear(attached: CardView[], renderCard: CardTile, card: CardView, label?: string) {
  const gear = attached.filter((item) => item.attachedToId === card.instanceId);
  return gear.length ? <div key={card.instanceId} className="play-equipped" style={{ '--gear': gear.length } as CSSProperties}>
    {renderCard(card, label)}
    <div className="play-attachments" role="group" aria-label={`Gear attached to ${card.cardName ?? label ?? 'this card'}`}>
      {gear.map((item) => renderCard(item))}
    </div>
  </div> : renderCard(card, label);
}

/** One side of the field: the Units a crew has in play, large enough to read. */
export function SeatField({ seat, snapshot, active, renderCard, overlay, ...targeting }: MatProps & { seat: Seat; active: boolean; overlay?: ReactNode }) {
  const view = snapshot.view.players[seat];
  const { attached, units } = crew(view);
  const resolving = zoneCards(view, 'resolvingProgram');
  return <section className="play-field" data-seat={seat} data-active={active} data-zone={`field:${seat}`} data-resolving={resolving.length > 0} data-empty={!units.length && !resolving.length && !overlay || undefined}
    data-drop-zone={`field:${seat}`} data-drop-available={targeting.dropZones?.has(`field:${seat}`)} data-drop-over={targeting.dropOver === `field:${seat}`}
    aria-label={seat === 'player' ? 'Your field' : 'Rival field'}>
    {units.length > 0 && <div className="play-card-row">{units.map(card => withGear(attached, renderCard, card))}</div>}
    {resolving.length > 0 && <div className="play-resolving" data-zone={`resolving:${seat}`} role="group" aria-label="Resolving Programs">
      <h3 className="play-zone-label">Resolving</h3><div className="play-card-row">{resolving.map((card) => renderCard(card))}</div>
    </div>}
    {overlay}
  </section>;
}

function Legends({ seat, snapshot, renderCard }: { seat: Seat; snapshot: MatchSnapshot; renderCard: CardTile }) {
  const { legends, attached } = crew(snapshot.view.players[seat]);
  return <section className="play-legends" data-zone={`legends:${seat}`} aria-label={seat === 'player' ? 'Your Legends' : 'Rival Legends'}>
    <h3 className="play-zone-label">Legends <b>{legends.length}/3</b></h3>
    <div className="play-card-row">{legends.map((card, index) => withGear(attached, renderCard, card, `Legend slot ${index + 1}`))}
      {Array.from({ length: Math.max(0, 3 - legends.length) }, (_, index) => <span key={`empty:${index}`} className="play-empty-legend" aria-label="Empty Legend slot" />)}
    </div>
  </section>;
}

function Eddies({ seat, snapshot, outcome, ...targeting }: Targeting & { seat: Seat; snapshot: MatchSnapshot; outcome?: Outcome }) {
  const view = snapshot.view.players[seat];
  const own = seat === 'player';
  const eddies = zoneCards(view, 'eddieArea');
  const ready = eddies.filter((card) => !card.spent).length;
  const spent = eddies.length - ready;
  const fromLegends = Math.max(0, view.availableEddies - view.eddies);
  const pool = Array.from({ length: Math.max(0, view.eddies - ready) }, (_, index) => ({ instanceId: `pool:${index}`, spent: false }));
  return <section className="play-eddies" data-zone={`eddies:${seat}`} data-drop-zone={`eddies:${seat}`} data-drop-available={targeting.dropZones?.has(`eddies:${seat}`)} data-drop-over={targeting.dropOver === `eddies:${seat}`} aria-label={own ? 'Your Eddies' : 'Rival Eddies'}>
    <div className="play-eddies-total" title={`${view.eddies} ready Eddies plus ${fromLegends} from eligible Legends`}>
      <b>{view.availableEddies}</b><span>€$ available</span>
    </div>
    <div className="play-eddies-detail">
      <div className="play-eddie-row">{[...eddies, ...pool].map((card, index) => {
        const target = targeting.targetIds.has(card.instanceId) && (own || !card.instanceId.startsWith('pool:'));
        const label = `${own ? 'Your' : 'Rival'} Eddie ${index + 1}, ${card.spent ? 'spent' : 'ready'}`;
        return <button key={card.instanceId} type="button" className="play-eddie" aria-label={label} title={label}
          data-card-id={card.instanceId} data-spent={card.spent} data-target={target} disabled={!target}
          aria-pressed={target ? targeting.chosenIds.has(card.instanceId) : undefined} onClick={() => targeting.onPick(card.instanceId)}>
          <span className="play-eddie-card"><img src={eddiesBack} alt="" /></span>
        </button>;
      })}{own && !eddies.length && !pool.length && <p className="play-empty">Sell a card to add an Eddie.</p>}</div>
      <p className="play-eddies-split">{view.eddies} ready <span>·</span> {spent} spent <span>·</span> +{fromLegends} from Legends</p>
    </div>
    <ZoneFloat outcome={outcome} seat={seat} kinds={['eddies']} />
  </section>;
}

function Fixer({ seat, snapshot, rolls, ...targeting }: Targeting & { seat: Seat; snapshot: MatchSnapshot; rolls?: GigRoll[] }) {
  const slots = zoneCards(snapshot.view.players[seat], 'fixerArea').map((card) => ({ id: card.instanceId, card } as { id: string; card?: CardView }));
  // A die in the air keeps its place among the Fixer dice, so the roll starts where the die sat.
  for (const roll of rolls ?? []) {
    if (roll.seat === seat && roll.fixerIndex !== undefined && !slots.some(({ id }) => id === roll.dieId)) slots.splice(roll.fixerIndex, 0, { id: roll.dieId });
  }
  return <section className="play-fixer play-mat-fixer" data-zone={`fixer:${seat}`} aria-label={seat === 'player' ? 'Your Fixer dice' : 'Rival Fixer dice'}>
    <h3 className="play-zone-label">Fixer</h3>
    <div className="play-dice">{slots.map(({ id, card }) => card ? <MatDie key={id} card={card} fixer {...targeting} />
      : <span key={id} className="play-die play-die-fixer play-roll-source" data-roll-source={id} aria-hidden="true" />)}</div>
  </section>;
}

function Piles({ seat, snapshot, renderCard, renderFace }: { seat: Seat; snapshot: MatchSnapshot; renderCard: CardTile; renderFace: (card: CardView) => ReactNode }) {
  const view = snapshot.view.players[seat];
  const count = zoneCount(view, 'deck');
  const deck = <div key="deck" className="play-pile play-mat-deck" role="group" aria-label={`${seat === 'player' ? 'Your' : 'Rival'} deck · ${count} cards`}>
    <span className="play-pile-art" data-anchor={`deck:${seat}`} data-depth={Math.min(3, Math.ceil(count / 12))}><img className="card-art" src={CARD_BACK} alt="" /></span>
    <span className="play-zone-label">Deck <b>{count}</b></span>
  </div>;
  const trash = <MatTrash key="trash" seat={seat} trash={zoneCards(view, 'trash')} removed={zoneCards(view, 'removedFromGame')} renderCard={renderCard} renderFace={renderFace} />;
  return <>{seat === 'player' ? [deck, trash] : [trash, deck]}</>;
}

type BenchProps = MatProps & { active: boolean; renderFace: (card: CardView) => ReactNode };

/** The rival's side of the table edge: piles, a hand of card backs and the crew. */
export function RivalBench({ snapshot, name, active, renderCard, renderFace, outcome, rolls, portrait, ...targeting }: BenchProps & { name: string; portrait?: ReactNode }) {
  const hand = zoneCount(snapshot.view.players.rival, 'hand');
  return <section className="play-bench" data-seat="rival" data-portrait={!!portrait || undefined} data-active={active} aria-label="Rival bench">
    {portrait}
    <div className="play-bench-piles" role="group" aria-label="Rival Fixer dice, deck and trash">
      <Piles seat="rival" snapshot={snapshot} renderCard={renderCard} renderFace={renderFace} />
      <Fixer seat="rival" snapshot={snapshot} rolls={rolls} {...targeting} />
    </div>
    <div className="play-bench-seat">
      <div className="play-rival-hand" data-anchor="hand:rival" role="img" aria-label={`${hand} cards in the rival’s hand`}>
        {Array.from({ length: Math.min(hand, 12) }, (_, index) => <img key={index} src={CARD_BACK} alt="" style={{ '--i': index, '--n': Math.min(hand, 12) } as CSSProperties} />)}
      </div>
      <div className="play-seat-name"><span className="play-eyebrow">Rival</span><h2 title={name}>{name}</h2><span className="play-seat-hand">{hand} in hand</span></div>
    </div>
    <div className="play-bench-crew">
      <Eddies seat="rival" snapshot={snapshot} outcome={outcome} {...targeting} />
      <Legends seat="rival" snapshot={snapshot} renderCard={renderCard} />
    </div>
  </section>;
}

/** Your side of the table edge. The hand sits between the crew and the piles. */
export function PlayerBench({ snapshot, active, renderCard, renderFace, outcome, rolls, children, ...targeting }: BenchProps & { children: ReactNode }) {
  return <div className="play-bench" data-seat="player" data-active={active}>
    <div className="play-bench-crew" role="group" aria-label="Your crew and Eddies">
      <Legends seat="player" snapshot={snapshot} renderCard={renderCard} />
      <Eddies seat="player" snapshot={snapshot} outcome={outcome} {...targeting} />
    </div>
    {children}
    <div className="play-bench-piles" role="group" aria-label="Your Fixer dice, deck and trash">
      <Fixer seat="player" snapshot={snapshot} rolls={rolls} {...targeting} />
      <Piles seat="player" snapshot={snapshot} renderCard={renderCard} renderFace={renderFace} />
    </div>
  </div>;
}
