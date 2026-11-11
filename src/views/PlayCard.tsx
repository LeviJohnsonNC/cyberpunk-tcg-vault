import { useEffect, useId, useRef } from 'react';
import { CARD_BACK, CardImg, Pip, Rules } from '../components/bits';
import { vaultCard } from '../lib/play/cardDisplay';
import type { CardView } from '../lib/play/protocol';

export function CardFace({ card }: { card: CardView }) {
  const printing = vaultCard(card);
  return printing ? <CardImg slug={printing.slug} alt="" priority /> : <img className="card-art" src={CARD_BACK} alt="" />;
}

export function CardInspection({ card, hostName, shortcuts, onClose }: {
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
