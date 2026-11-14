import type { ReactNode } from 'react';
import { Rules } from '../components/bits';
import { isReady, type MatchActionForm, type PickField, type Picks } from '../lib/play/matchActions';
import { commitLabel } from '../lib/play/matchInteraction';
import type { CardView, PlayerView } from '../lib/play/protocol';
import { decisionSource } from '../lib/play/tacticalInfo';
import { CardFace } from './PlayCard';
import { DieFace } from './PlayDice';
import type { CommandPresentation } from '../lib/play/commandPresentation';
import { PlayGigAdjustment } from './PlayGigAdjustment';
import { PlayDecisionPanel } from './PlayDecisionPanel';

export function PlayChoices({ presentation, context, view, action, picks, fields, active, cards, busy, forced, select, step, submit, cancel, alternatives, reorder, inspect, revealed }: {
  presentation: CommandPresentation; context?: ReactNode;
  view: PlayerView;
  revealed?: CardView[]; action: MatchActionForm; picks: Picks; fields: PickField[]; active?: PickField; cards: CardView[];
  inspect: (card: CardView, trigger: HTMLElement) => void; busy: boolean; forced: boolean; select: (field: string, value: string) => void;
  step: (id: string) => void; reorder: (field: string, ids: string[]) => void; submit: () => void; cancel: () => void; alternatives: ReactNode;
}) {
  if (action.id === 'resolveAdjustGig') return <PlayGigAdjustment
    view={view} action={action} picks={picks} fields={fields} active={active} cards={cards} busy={busy}
    select={select} changeGig={() => step('die')} submit={submit} inspect={inspect} alternatives={alternatives} context={context} />;

  const ready = isReady(fields, picks);
  const rollingGig = action.id === 'gainGig';
  const sourceCard = decisionSource(view, action, picks, cards);
  const paying = active?.id === 'payment';
  const detail = paying && presentation.detail ? <Rules text={presentation.detail} />
    : sourceCard ? `${action.label} · ${sourceCard.cardName ?? 'Selected Legend'}` : presentation.detail;
  const placement = action.id === 'resolveScry';
  const assigned = new Set(Object.values(picks).flat());
  const unassigned = revealed?.filter((card) => !assigned.has(card.instanceId)) ?? [];
  const byId = new Map(cards.map((card) => [card.instanceId, card]));
  const onMat = !!active?.options.length && !active.ordered && active.options.every((option) => option.cardId?.startsWith('pool:') || cards.some((card) => card.instanceId === option.cardId && ['hand', 'field', 'legendArea', 'eddieArea', 'gigArea', 'fixerArea', 'resolvingProgram'].includes(card.zone ?? '')));
  const showPanel = !onMat || (!paying && !rollingGig);
  const countedStep = paying || rollingGig ? undefined : active;
  const options = active && <fieldset disabled={busy} data-pick-field={active.id} className="play-active-choice">
        <legend>{active.label}{active.ordered ? ' · select in order, first selected is placed first' : ''}</legend>
        <div className="play-pick-list">{active.options.map((option) => {
          const card = option.cardId ? byId.get(option.cardId) : undefined;
          const die = card && ['gigArea', 'fixerArea'].includes(card.zone ?? '');
          const rank = picks[active.id]?.indexOf(option.id) ?? -1;
          const artwork = card && !die && active.id !== 'payment';
          return <div key={option.id} className="play-choice-option"><button type="button" className={`play-option${artwork ? ' play-option-card' : ''}`}
            data-pick-option={option.id} aria-pressed={rank >= 0} onClick={() => select(active.id, option.id)} onKeyDown={(event) => { if (card && event.key.toLowerCase() === 'i') { event.preventDefault(); inspect(card, event.currentTarget); } }}>
            {die && <DieFace type={card.definitionId} value={card.zone === 'gigArea' ? card.power : undefined} />}
            {artwork && <CardFace card={card} />}
            <span>{active.ordered && rank >= 0 ? `${rank + 1}. ` : ''}{option.label}</span>
            {option.note && <small><Rules text={option.note} /></small>}
          </button>{artwork && <button type="button" className="play-choice-details" aria-label={`Details for ${option.label}`} onClick={(event) => inspect(card, event.currentTarget)}>Details</button>}</div>;
        })}{!active.options.length && <p className="play-empty">No eligible options. Choose an earlier step to change your selection.</p>}</div>
      </fieldset>;
  return <section className="play-decision-tray" aria-label="Table decision" data-forced={forced}>
    <form className="play-picks" onSubmit={(event) => { event.preventDefault(); if (!busy && ready) submit(); }}>
      <div className="play-tray-head">
        <div className="play-tray-intent">
          {sourceCard && <button type="button" className="play-tray-source" aria-label={`Inspect ${sourceCard.cardName ?? 'selected card'}`} onClick={(event) => inspect(sourceCard, event.currentTarget)}><CardFace card={sourceCard} /></button>}
          <div><h3>{presentation.title}</h3>{detail && <p>{detail}</p>}</div>
        </div>
        <div className="play-tray-actions">
          <button className="btn play-confirm" data-confirm-move={action.id} disabled={busy || !ready}>{rollingGig ? 'Roll die' : commitLabel(action, picks)}</button>
          <button className="btn quiet" type="button" disabled={busy} onClick={cancel}>{forced ? rollingGig ? 'Clear' : 'Clear selections' : 'Cancel'}</button>
          {alternatives}
        </div>
      </div>
      {(countedStep || showPanel || context) && <div className="play-tray-summary">
        {countedStep && <span className="play-step-count">{countedStep.label} <b>{picks[countedStep.id]?.length ?? 0}/{countedStep.min === countedStep.max ? countedStep.min : `${countedStep.min}–${countedStep.max}`}</b></span>}
        {showPanel && <PlayDecisionPanel key={onMat ? 'mat' : 'list'} label={onMat ? 'Options' : 'Choices'}
          title={presentation.title} defaultOpen={!onMat}>
          {!paying && action.detail && <p className="play-choice-detail"><Rules text={action.detail} /></p>}
          {fields.length > 1 && <div className="play-choice-steps" aria-label="Decision steps">{fields.map(field =>
            <button type="button" key={field.id} className="btn quiet" aria-pressed={field.id === active?.id}
              data-step={field.id} disabled={busy} onClick={() => step(field.id)}>
              {field.label} <b>{picks[field.id]?.length ?? 0}/{field.min === field.max ? field.min : `${field.min}–${field.max}`}</b>
            </button>)}</div>}
          {options}
          {placement && <div className="play-placement-review" aria-label="Placement review">
            {fields.map((field) => <div key={field.id}><strong>{field.label}</strong><span>{(picks[field.id] ?? []).map((id) => field.options.find((option) => option.id === id)?.label).join(' → ') || 'None selected'}</span></div>)}
            {unassigned.length > 0 && <div><strong>Unassigned</strong><span>{unassigned.map((card) => card.cardName ?? 'Revealed card').join(' · ')}. {action.detail?.split('Unassigned cards · ')[1] ?? 'Follow the remaining destination shown above.'}</span></div>}
          </div>}
          {active?.ordered && (picks[active.id]?.length ?? 0) > 1 && <ol className="play-choice-order" aria-label="Selected order">{picks[active.id].map((id, index, ids) =>
            <li key={id}><span>{index + 1}. {active.options.find((option) => option.id === id)?.label}</span>
              <button type="button" className="btn quiet" disabled={busy || index === 0} aria-label={`Move ${active.options.find((option) => option.id === id)?.label} earlier`} onClick={() => {
                // Reorder the selected cards without changing their destination.
                const reordered = [...ids]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
                reorder(active.id, reordered);
              }}>↑</button>
            </li>)}</ol>}
        </PlayDecisionPanel>}
        {context}
      </div>}
    </form>
  </section>;
}
