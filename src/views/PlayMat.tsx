import { useId, useRef, type ReactNode } from 'react';
import { CARD_BACK } from '../components/bits';
import { zoneCards, zoneCount } from '../lib/play/matchView';
import type { CardView, MatchSnapshot, Seat } from '../lib/play/protocol';
import { DieFace } from './PlayDice';

type Targeting = { dropZones?: Set<string>; dropOver?: string; targetIds: Set<string>; chosenIds: Set<string>; onPick: (id: string) => void };
type CardTile = (card: CardView, label?: string) => ReactNode;

function MatDie({ card, fixer = false, targetIds, chosenIds, onPick }: Targeting & { card: CardView; fixer?: boolean }) {
  const target = targetIds.has(card.instanceId);
  const label = fixer ? `Roll ${card.definitionId}` : `${card.definitionId} Gig · ${card.power}`;
  return <button type="button" className={`play-die${fixer ? ' play-die-fixer' : ''}`} aria-label={label} title={label}
    data-card-id={card.instanceId} data-target={target} disabled={!target}
    aria-pressed={target ? chosenIds.has(card.instanceId) : undefined} onClick={() => onPick(card.instanceId)}>
    <DieFace type={card.definitionId} value={fixer ? undefined : card.power} />
    {!fixer && <small>{card.definitionId}</small>}
  </button>;
}

export function GigZones({ snapshot, ...targeting }: Targeting & { snapshot: MatchSnapshot }) {
  return <div className="play-gig-zones">{(['rival', 'player'] as const).map((seat) => {
    const view = snapshot.view.players[seat];
    const gigs = zoneCards(view, 'gigArea');
    return <section key={seat} className="play-gigs" data-seat={seat} data-drop-zone={`gigs:${seat}`} data-drop-available={targeting.dropZones?.has(`gigs:${seat}`)} data-drop-over={targeting.dropOver === `gigs:${seat}`} aria-label={seat === 'player' ? 'Your Gigs' : 'Rival Gigs'}>
      <h3 className="play-eyebrow">{seat === 'player' ? 'Your Gigs' : 'Rival Gigs'} <span>{view.gigCount}</span></h3>
      <div className="play-dice">{gigs.length ? gigs.map((card) => <MatDie key={card.instanceId} card={card} {...targeting} />) : <span className="play-empty">No Gigs yet</span>}</div>
      <span className="play-gig-cred" title="Street Cred is the total value of these Gig dice">Cred <b>{view.streetCred}</b></span>
    </section>;
  })}</div>;
}

function MatTrash({ own, trash, removed, renderCard, renderFace }: {
  own: boolean; trash: CardView[]; removed: CardView[]; renderCard: CardTile; renderFace: (card: CardView) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const top = trash.at(-1);
  const label = own ? 'Your trash' : 'Rival trash';
  return <div className="play-mat-trash">
    <button type="button" className="play-pile play-trash-trigger" aria-haspopup="dialog" aria-label={`${label} · ${trash.length} cards${removed.length ? ` · ${removed.length} removed` : ''}`}
      onClick={() => dialog.current?.showModal()}>
      <span className="play-eyebrow">Trash <b>{trash.length}</b></span>
      <span className="play-pile-art">{top ? renderFace(top) : <span className="play-empty-pile" aria-hidden="true">↓</span>}</span>
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

export function PlayMat({ seat, snapshot, name, active, renderCard, renderFace, fieldControls, ...targeting }: Targeting & {
  seat: Seat; snapshot: MatchSnapshot; name: string; active: boolean; renderCard: CardTile; renderFace: (card: CardView) => ReactNode; fieldControls?: ReactNode;
}) {
  const view = snapshot.view.players[seat];
  const own = seat === 'player';
  const fixer = zoneCards(view, 'fixerArea');
  const legends = zoneCards(view, 'legendArea');
  const field = zoneCards(view, 'field');
  const resolving = zoneCards(view, 'resolvingProgram');
  const trash = zoneCards(view, 'trash');
  const removed = zoneCards(view, 'removedFromGame');
  const eddies = zoneCards(view, 'eddieArea');
  const readyCards = eddies.filter((card) => !card.spent).length;
  const spent = eddies.length - readyCards;
  const legendEddies = Math.max(0, view.availableEddies - view.eddies);
  const pool = Array.from({ length: Math.max(0, view.eddies - readyCards) }, (_, index) => ({ instanceId: `pool:${index}`, spent: false }));
  const hosts = new Set([...legends, ...field].map((card) => card.instanceId));
  const attached = field.filter((card) => card.attachedToId && hosts.has(card.attachedToId));
  const attachedIds = new Set(attached.map((card) => card.instanceId));
  const fieldCards = field.filter((card) => !attachedIds.has(card.instanceId));

  function withGear(card: CardView, label?: string) {
    const gear = attached.filter((item) => item.attachedToId === card.instanceId);
    return gear.length ? <div key={card.instanceId} className="play-equipped">
      {renderCard(card, label)}
      <div className="play-attachments" role="group" aria-label={`Gear attached to ${card.cardName ?? label ?? 'this card'}`}>
        {gear.map((item) => renderCard(item))}
      </div>
    </div> : renderCard(card, label);
  }

  return <section className="play-seat" data-seat={seat} data-active={active} aria-label={own ? 'Your board' : 'Rival board'}>
    <header className="play-seat-meta">
      <div className="play-seat-name"><span className="play-eyebrow">{own ? 'You' : 'Rival'}</span><h2 title={name}>{name}</h2></div>
      <div className="play-seat-resources" title={`${view.eddies} ready Eddies plus ${legendEddies} eligible Legends`}>
        <span>Available <b>{view.availableEddies} €$</b></span><span>{zoneCount(view, 'hand')} in hand</span>
      </div>
    </header>
    <div className="play-mat">
      <section className="play-mat-fixer" aria-label={own ? 'Your Fixer dice' : 'Rival Fixer dice'}>
        <h3 className="play-eyebrow">Fixer</h3>
        <div className="play-dice">{(own ? fixer : fixer.slice().reverse()).map((card) => <MatDie key={card.instanceId} card={card} fixer {...targeting} />)}</div>
      </section>
      <div className="play-mat-field" data-drop-zone={`field:${seat}`} data-drop-available={targeting.dropZones?.has(`field:${seat}`)} data-drop-over={targeting.dropOver === `field:${seat}`} data-resolving={resolving.length > 0}>
        <section className="play-field" aria-label="Field">
          <h3 className="play-eyebrow">Field <span>{field.length - attached.filter((card) => legends.some((legend) => legend.instanceId === card.attachedToId)).length}</span></h3>
          {fieldControls && <div className="play-field-controls">{fieldControls}</div>}
          <div className="play-card-row">{fieldCards.length ? fieldCards.map((card) => withGear(card)) : <span className="play-empty">Field is clear</span>}</div>
        </section>
        {resolving.length > 0 && <section className="play-resolving" aria-label="Resolving Programs">
          <h3 className="play-eyebrow">Resolving</h3><div className="play-card-row">{resolving.map((card) => renderCard(card))}</div>
        </section>}
      </div>
      <section className="play-legends" aria-label="Legend slots">
        <h3 className="play-eyebrow">Legends <span>{legends.length}/3</span></h3>
        <div className="play-card-row">{legends.map((card, index) => withGear(card, `Slot${index + 1}`))}
          {Array.from({ length: Math.max(0, 3 - legends.length) }, (_, index) => <span key={`empty:${index}`} className="play-empty-legend" aria-label="Empty Legend slot" />)}
        </div>
      </section>
      <section className="play-eddies" data-drop-zone={`eddies:${seat}`} data-drop-available={targeting.dropZones?.has(`eddies:${seat}`)} data-drop-over={targeting.dropOver === `eddies:${seat}`} aria-label={own ? 'Your Eddies' : 'Rival Eddies'}>
        <div className="play-eddies-heading"><h3 className="play-eyebrow">Eddies</h3><span>{view.eddies} ready <span>·</span> {spent} spent <span>·</span> +{legendEddies} from Legends</span></div>
        <div className="play-eddie-row">{[...eddies, ...pool].map((card, index) => {
          const target = targeting.targetIds.has(card.instanceId) && (own || !card.instanceId.startsWith('pool:'));
          const label = `${own ? 'Your' : 'Rival'} Eddie ${index + 1}, ${card.spent ? 'spent' : 'ready'}`;
          return <button key={card.instanceId} type="button" className="play-eddie" aria-label={label} title={label}
            data-card-id={card.instanceId} data-spent={card.spent} data-target={target} disabled={!target}
            aria-pressed={target ? targeting.chosenIds.has(card.instanceId) : undefined} onClick={() => targeting.onPick(card.instanceId)}>
            <span className="play-eddie-card"><img src={CARD_BACK} alt="" /><b aria-hidden="true">€$</b></span>
            <span>{card.spent ? 'Spent' : 'Ready'}</span>
          </button>;
        })}{!eddies.length && !pool.length && <p className="play-empty">{own ? 'Sell a card to add an Eddie.' : 'No Eddies yet'}</p>}</div>
      </section>
      <div className="play-mat-deck play-pile" role="group" aria-label={`${own ? 'Your' : 'Rival'} deck · ${zoneCount(view, 'deck')} cards`}>
        <span className="play-eyebrow">Deck <b>{zoneCount(view, 'deck')}</b></span>
        <span className="play-pile-art"><img className="card-art" src={CARD_BACK} alt="" /></span>
      </div>
      <MatTrash own={own} trash={trash} removed={removed} renderCard={renderCard} renderFace={renderFace} />
    </div>
  </section>;
}
