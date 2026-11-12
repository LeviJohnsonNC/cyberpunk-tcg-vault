import { useEffect, useId, useRef, useState } from 'react';
import { CARD_BACK, Pip, Rules } from '../components/bits';
import { imageUrl } from '../lib/data';
import { vaultCard } from '../lib/play/cardDisplay';
import { powerExplanation } from '../lib/play/tacticalInfo';
import type { CardView } from '../lib/play/protocol';

/** Table art loads at once: every card on the table is in view, and a late image would fly as a card back. */
export function CardFace({ card }: { card: CardView }) {
  const slug = vaultCard(card)?.slug;
  const [failed, setFailed] = useState<string>();
  return slug && failed !== slug ? <img className="card-art" src={imageUrl(slug)} alt="" decoding="async" onError={() => setFailed(slug)} />
    : <img className="card-art" src={CARD_BACK} data-card-back="" alt="" />;
}

export function CardInspection({ card, cards = [], hostName, shortcuts, onClose }: {
  card: CardView; cards?: CardView[]; hostName?: string; shortcuts: { label: string; select: () => void }[]; onClose: () => void;
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
  const power = powerExplanation(card, cards);
  const effects = [...(card.activeEffects ?? []), ...(card.costEffects ?? [])];
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
              {cost != null && <div><dt>Current cost</dt><dd>{cost} €${cost !== card.cost && <small>Printed {card.cost} €$</small>}</dd></div>}
              {power && <div><dt>Current power</dt><dd>{card.effectivePower}</dd></div>}
              {!!card.damage && <div><dt>Damage</dt><dd>{card.damage}</dd></div>}
            </dl>
            {power && <div className="play-power-breakdown"><p>{power.text}</p>
              {!power.exact && <small>Additional or conditional modifiers are included in current power.</small>}
              {power.gear.length > 0 && <div className="play-equipment-list" aria-label="Attached Gear">{power.gear.map((gear) => <details key={gear.instanceId}>
                <summary>{gear.cardName} {gear.power !== 0 && <b>{gear.power > 0 ? '+' : ''}{gear.power} power</b>}</summary>
                {vaultCard(gear) && <p><Rules text={vaultCard(gear)!.text} /></p>}
              </details>)}</div>}
            </div>}
            {!!card.grantedRules?.length && <p className="play-current-rules"><strong>Current abilities</strong>{card.grantedRules.map((rule) => <span key={rule}>{rule.replace(/([A-Z])/g, ' $1')}</span>)}</p>}
            {(card.spent || card.hasLag || hostName) && <p className="play-inspect-status">{[
              card.spent && 'Spent', card.hasLag && 'Lag', hostName && `Attached to ${hostName}`,
            ].filter(Boolean).join(' · ')}</p>}
            {effects.length > 0 && <section className="play-effect-list" aria-label="Effects on this card"><h3>Effects on this card</h3>
              {effects.map((effect, index) => <div key={`${effect.id}:${index}`} data-tone={effect.tone}>
                <strong>{effect.label}</strong><p>{effect.detail}</p>
                {effect.defeatsAtEndOfTurn && <b className="play-effect-warning">Defeated at end of turn</b>}
              </div>)}
            </section>}
            {printing && <section className="play-printed-text"><h3>Printed rules</h3><p className="play-inspect-rules"><Rules text={printing.text} /></p></section>}
            {!printing && <p className="play-choice-detail">Printed rules unavailable. Current values above are from this match.</p>}
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
