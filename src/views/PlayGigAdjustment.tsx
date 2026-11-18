import type { ReactNode } from 'react';
import { isReady, type MatchActionForm, type PickField, type Picks } from '../lib/play/matchActions';
import type { CardView, PlayerView } from '../lib/play/protocol';
import { decisionSource, gigAdjustmentTarget } from '../lib/play/tacticalInfo';
import { CardFace } from './PlayCard';
import { DieFace } from './PlayDice';
import { PlayDecisionPanel } from './PlayDecisionPanel';
import './play-gig-adjustment.css';

type AdjustmentPayload = { source?: { displayName?: string } };

export function PlayGigAdjustment({ view, action, picks, fields, active, cards, busy, select, changeGig, submit, inspect, alternatives, context }: {
  view: PlayerView; action: MatchActionForm; picks: Picks; fields: PickField[]; active?: PickField;
  cards: CardView[]; busy: boolean;
  select: (field: string, value: string) => void;
  changeGig: () => void; submit: () => void;
  inspect: (card: CardView, trigger: HTMLElement) => void;
  alternatives: ReactNode; context?: ReactNode;
}) {
  const source = decisionSource(view, action, picks, cards);
  const payload = view.prompt.choice?.payload as AdjustmentPayload | undefined;
  const sourceName = payload?.source?.displayName ?? source?.cardName;
  const dieField = fields.find(field => field.id === 'die');
  const valueField = fields.find(field => field.id === 'value');
  const target = gigAdjustmentTarget(view, action.move(picks).args?.dieId);
  const choosingDie = !!dieField && (active?.id === 'die' || !isReady([dieField], picks));
  const value = valueField?.options.find(option => picks.value?.includes(option.id));
  const delta = target && value ? Number(value.id) - target.die.power : undefined;
  const ready = !choosingDie && !!target && !!value && isReady(fields, picks);

  return <section className="play-decision-tray play-gig-adjustment" aria-label="Gig adjustment">
    <form className="play-gig-adjustment-form" onSubmit={event => { event.preventDefault(); if (!busy && ready) submit(); }}>
      <div className="play-gig-adjustment-intent">
        {source && <button type="button" className="play-tray-source" disabled={busy} aria-label={`Inspect ${sourceName ?? 'source card'}`} onClick={event => inspect(source, event.currentTarget)}><CardFace card={source} /></button>}
        <div>
          <h3>{choosingDie ? 'Choose a Gig to adjust' : 'Adjust a Gig value'}</h3>
        </div>
      </div>
      {!choosingDie && target && <>
        <fieldset className="play-gig-adjustment-values" data-pick-field="value" disabled={busy}>
          <legend className="sr-only">Choose a new value for {target.seat === 'player' ? 'your' : 'the rival’s'} {target.die.definitionId}, currently {target.die.power}</legend>
          <div className="play-gig-adjustment-options">
            <div className="play-gig-adjustment-die" aria-hidden="true">
              <DieFace seat={target.seat} type={target.die.definitionId} value={target.die.power} />
              <b>{target.seat === 'player' ? 'Your' : 'Rival'} {target.die.definitionId}</b>
            </div>
            <span className="play-gig-adjustment-arrow" aria-hidden="true">→</span>
            {valueField?.options.map(option => {
              const change = Number(option.id) - target.die.power;
              const label = change ? `Set Gig value to ${option.label}, ${change > 0 ? 'increase' : 'decrease'} ${Math.abs(change)}` : `Keep Gig value at ${option.label}`;
              return <button key={option.id} className="btn quiet" type="button" data-pick-option={option.id}
                aria-label={label} aria-pressed={option.id === value?.id} onClick={() => { if (option.id !== value?.id) select('value', option.id); }}>
                <strong>{option.label}</strong>{change === 0 && <span>Keep</span>}
              </button>;
            })}
            {!valueField?.options.length && <span>No legal new values.</span>}
          </div>
          {delta === 0 && alternatives && <p className="play-choice-detail">Keep selects this Gig. Decline skips the selection.</p>}
        </fieldset>
        {target.streetCred !== undefined && <div className="play-gig-adjustment-preview">
          <span>{target.seat === 'player' ? 'Your' : 'Rival'} Street Cred</span>
          <output aria-live="polite" aria-atomic="true">
            <b>{target.streetCred}</b>
            {delta !== undefined && delta !== 0 && <>
              <span aria-hidden="true">→</span><span className="sr-only"> to </span>
              <strong key={value?.id} data-preview-selected="true">{target.streetCred + delta}</strong>
            </>}
          </output>
        </div>}
      </>}
      {!choosingDie && !target && <p>The selected Gig is unavailable.</p>}
      <div className="play-gig-adjustment-actions">
        {(choosingDie || context) && <PlayDecisionPanel label={choosingDie ? 'Gig list' : 'Combat details'}
          title={choosingDie ? 'Eligible Gigs' : 'Combat details'}>
          {context}
          {choosingDie && <fieldset className="play-gig-adjustment-dice" data-pick-field="die" disabled={busy}>
            <legend className="sr-only">Choose a Gig to adjust</legend>
            {dieField.options.map(option => {
              const gig = gigAdjustmentTarget(view, option.cardId);
              return <button key={option.id} className="btn quiet" type="button" data-pick-option={option.id}
                onClick={() => select('die', option.id)} aria-pressed={picks.die?.includes(option.id) ?? false}>
                {gig ? <><DieFace seat={gig.seat} type={gig.die.definitionId} value={gig.die.power} />
                  <span>{gig.seat === 'player' ? 'Your' : 'Rival'} {gig.die.definitionId} · {gig.die.power}</span></> : option.label}
              </button>;
            })}
            {!dieField.options.length && <span>No eligible Gigs.</span>}
          </fieldset>}
        </PlayDecisionPanel>}
        {!choosingDie && <button className="btn play-confirm" data-confirm-move="resolveAdjustGig" disabled={busy || !ready}>{delta === 0 && target ? `Keep ${target.die.definitionId} at ${value?.label}` : 'Set value'}</button>}
        {!choosingDie && !!dieField?.options.length && <button className="btn quiet" type="button" disabled={busy} onClick={changeGig}>Change Gig</button>}
        {alternatives}
      </div>
    </form>
  </section>;
}
