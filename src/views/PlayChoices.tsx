import { useId, type ReactNode } from 'react';
import { Rules } from '../components/bits';
import { isReady, type MatchActionForm, type PickField, type Picks } from '../lib/play/matchActions';
import { triggerPreviewCard } from '../lib/play/cardDisplay';
import { commitLabel } from '../lib/play/matchInteraction';
import type { CardView, PlayerView } from '../lib/play/protocol';
import { zoneCards } from '../lib/play/matchView';
import { decisionSource } from '../lib/play/tacticalInfo';
import { CardFace } from './PlayCard';
import { DieFace } from './PlayDice';
import type { CommandPresentation } from '../lib/play/commandPresentation';
import { PlayGigAdjustment } from './PlayGigAdjustment';
import { PlayDecisionPanel } from './PlayDecisionPanel';

function placementLabel(destination: string | undefined, count: number, remainder: string | undefined, remaining: number, optional: boolean) {
  const cards = `${count} ${count === 1 ? 'card' : 'cards'}`;
  if (!count && remaining && optional) {
    if (remainder === 'deckBottom') return `Bottom-deck all ${remaining}`;
    if (remainder === 'deckTop') return `Put all ${remaining} on top`;
    if (remainder === 'trash') return `Trash all ${remaining}`;
    if (remainder === 'hand') return `Add all ${remaining} to hand`;
  }
  if (destination === 'hand') return count ? `Add ${count} to hand` : 'Add to hand';
  if (count && destination === 'trash') return `Trash ${cards}`;
  if (count && destination === 'field') return `Put ${cards} on the field`;
  return 'Place cards';
}

function preventionLabel(fields: PickField[], picks: Picks) {
  const count = fields.filter(field => picks[field.id]?.length).length;
  return count ? `Keep ${count} ${count === 1 ? 'Gig' : 'Gigs'}` : 'Allow theft';
}

function triggerRules(active: PickField | undefined) {
  const unique = new Map<string, { label: string; note: string }>();
  for (const option of active?.options ?? []) {
    if (option.note && !unique.has(option.note)) unique.set(option.note, {
      label: `${option.label} rules`, note: option.note,
    });
  }
  return unique.size === 1 ? [...unique.values()].map(rule => ({ ...rule, label: 'Ability rules' })) : [...unique.values()];
}

export function PlayChoices({ phone = false, presentation, context, view, action, picks, fields, active, cards, busy, forced, select, step, submit, cancel, resetPayment, alternatives, reorder, inspect, revealed, previewSource, leaveSource }: {
  phone?: boolean; presentation: CommandPresentation; context?: ReactNode;
  view: PlayerView;
  revealed?: CardView[]; action: MatchActionForm; picks: Picks; fields: PickField[]; active?: PickField; cards: CardView[];
  previewSource: (card: CardView, trigger: HTMLElement, note: string | undefined, canInspect: boolean) => void;
  leaveSource: (wait?: boolean) => void;
  inspect: (card: CardView, trigger: HTMLElement) => void; busy: boolean; forced: boolean; select: (field: string, value: string) => void;
  step: (id: string) => void; reorder: (field: string, ids: string[]) => void; submit: () => void; cancel: () => void; resetPayment: () => void; alternatives: ReactNode;
}) {
  const choiceId = useId();
  if (action.id === 'resolveAdjustGig') return <PlayGigAdjustment
    view={view} action={action} picks={picks} fields={fields} active={active} cards={cards} busy={busy}
    select={select} changeGig={() => step('die')} submit={submit} inspect={inspect} alternatives={alternatives} context={context} />;

  const ready = isReady(fields, picks);
  const rollingGig = action.id === 'gainGig';
  const sourceCard = decisionSource(view, action, picks, cards);
  const paying = active?.id === 'payment';
  const triggerChoice = action.id === 'resolveTrigger';
  const placement = action.id === 'resolveScry';
  const replacement = action.id === 'resolveRedirectDefeat';
  const preventTheft = action.id === 'resolvePreventGigSteal';
  const inlineDetail = replacement || preventTheft ? action.detail : action.summary ?? presentation.detail;
  const resettingPayment = forced && paying;
  const assigned = new Set(Object.values(picks).flat());
  const unassigned = revealed?.filter((card) => !assigned.has(card.instanceId)) ?? [];
  const otherPlacements = placement ? fields.filter((field) => field.id !== active?.id && picks[field.id]?.length) : [];
  const byId = new Map(cards.map((card) => [card.instanceId, card]));
  const onMat = !!active?.options.length && !active.ordered && active.options.every((option) => option.cardId?.startsWith('pool:') || ['hand', 'field', 'legendArea', 'eddieArea', 'gigArea', 'fixerArea', 'resolvingProgram'].includes(byId.get(option.cardId ?? '')?.zone ?? ''));
  const showPanel = !!active && (!onMat || !rollingGig);
  const selectedCount = active ? picks[active.id]?.length ?? 0 : 0;
  const limit = active && active.max > 1 && (
    active.min === active.max ? `Choose ${active.max}`
      : active.min === 0 ? `Up to ${active.max}` : `Choose ${active.min}–${active.max}`
  );
  const showLimit = limit && !paying && (active.min > 0 || (selectedCount < active.max && active.options.length > active.max));
  const heading = replacement && paying ? 'Prevent defeat' : presentation.title;
  const confirm = fields.length === 1 && placement
    ? placementLabel(active?.destination, selectedCount, action.remainderZone, unassigned.length, active?.min === 0)
    : preventTheft ? preventionLabel(fields, picks) : commitLabel(action, picks);
  const hasPicks = Object.values(picks).some(values => values.length > 0);
  const stepLabel = (field: PickField) => ({
    card: 'Card', host: 'Attach to', from: 'From', to: 'To', attacker: 'Attacker',
    defender: 'Target', payment: 'Payment', protected: 'Protect',
  }[field.id] ?? field.label);
  const options = active && <fieldset disabled={busy} data-pick-field={active.id} className="play-active-choice">
        <legend className={!showLimit || onMat ? 'sr-only' : undefined}>
          <span className="sr-only">{active.label}{limit ? '. ' : ''}</span>
          {limit}
        </legend>
        <div className="play-pick-list">{active.options.map((option, index) => {
          const card = option.cardId ? byId.get(option.cardId) : undefined;
          const die = card && ['gigArea', 'fixerArea'].includes(card.zone ?? '');
          const rivalDie = die && zoneCards(view.players.rival, card.zone!).some(item => item.instanceId === card.instanceId);
          const rank = picks[active.id]?.indexOf(option.id) ?? -1;
          const artwork = card && !die && !paying;
          const capped = rank < 0 && active.max > 1 && selectedCount >= active.max;
          const costRelevant = ['playCard', 'resolveCardToPlay', 'resolvePreventGigSteal'].includes(action.id);
          const showNote = option.note && !paying && (costRelevant || !option.note.endsWith(' €$'));
          const source = option.sourceCardId ? byId.get(option.sourceCardId) : undefined;
          const previewCard = option.sourceCardId ? triggerPreviewCard(source, option.sourceCardId, option.label) : undefined;
          const descriptionId = triggerChoice && option.note ? `${choiceId}-effect-${index}` : undefined;
          const duplicateTriggers = triggerChoice ? active.options.filter(item => item.label === option.label) : [];
          const seat = phone && card?.zone && (['player', 'rival'] as const).find(seat => zoneCards(view.players[seat], card.zone!).some(item => item.instanceId === card.instanceId));
          const position = seat && card && zoneCards(view.players[seat], card.zone!).findIndex(item => item.instanceId === card.instanceId) + 1;
          const label = duplicateTriggers.length > 1 ? `${option.label} · ${duplicateTriggers.indexOf(option) + 1}` : option.label;
          return <div key={option.id} className="play-choice-option"><button type="button" className={`play-option${artwork ? ' play-option-card' : ''}`}
            data-pick-option={option.id} aria-pressed={rank >= 0} aria-disabled={capped || undefined}
            onClick={() => { if (!capped) select(active.id, option.id); }}
            aria-describedby={descriptionId}
            onMouseEnter={previewCard ? event => previewSource(previewCard, event.currentTarget, option.note, !!source) : undefined}
            onMouseLeave={previewCard ? event => { if (!event.currentTarget.matches(':focus-visible')) leaveSource(true); } : undefined}
            onFocus={previewCard ? event => {
              if (event.currentTarget.matches(':focus-visible')) previewSource(previewCard, event.currentTarget, option.note, !!source);
            } : undefined}
            onBlur={previewCard ? () => leaveSource() : undefined}
            onKeyDown={event => {
              const inspectable = card ?? (previewCard && source);
              if (inspectable && event.key.toLowerCase() === 'i') { event.preventDefault(); inspect(inspectable, event.currentTarget); }
            }}>
            {die && <DieFace seat={rivalDie ? 'rival' : 'player'} type={card.definitionId} value={card.zone === 'gigArea' ? card.power : undefined} />}
            {artwork && <CardFace card={card} />}
            <span className="play-option-label">
              {rank >= 0 && <span className="play-option-mark" aria-hidden="true">{active.ordered ? rank + 1 : '✓'}</span>}
              {label}
              {seat && card && <small>{seat === 'player' ? 'Yours' : 'Rival'} · {card.zone === 'legendArea' ? 'Legend' : 'Slot'} {position}{card.zone === 'field' && card.type !== 'gear' && ` · Power ${card.effectivePower}`}{card.spent && ' · Spent'}{card.hasLag && ' · Lag'}</small>}
              {active.ordered && rank >= 0 && <span className="sr-only">{`, position ${rank + 1}`}</span>}
            </span>
            {showNote && !triggerChoice && <small><Rules text={option.note!} /></small>}
          </button>{descriptionId && <span id={descriptionId} className="sr-only"><Rules text={option.note!} /></span>}{artwork && <button type="button" className="play-choice-details" aria-label={`Details for ${option.label}`} title={`Details for ${option.label}`} onClick={(event) => inspect(card, event.currentTarget)}><span aria-hidden="true">ⓘ</span></button>}</div>;
        })}{!active.options.length && <p className="play-empty">{fields.length > 1 ? 'No eligible options. Choose an earlier step to change your selection.' : 'No eligible options.'}</p>}</div>
      </fieldset>;
  if (phone) {
    const host = fields.find(field => field.id === 'host')?.options.find(option => picks.host?.includes(option.id));
    const blocker = action.id === 'useBlocker' && active?.options.find(option => picks[active.id]?.includes(option.id));
    const cost = fields.find(field => field.id === 'payment')?.min;
    const confirmText = !fields.length ? action.label : host ? `Equip to ${host.label}${cost ? ` · ${cost} €$` : ''}` : blocker ? `Block with ${blocker.label}` : confirm;
    return <div className="phone-choice play-decision-tray">
      <h3>{host ? sourceCard?.cardName : active?.id === 'host' ? 'Choose an equip target' : !fields.length ? action.label : heading}</h3>
      {fields.length > 1 && <div className="phone-steps">{fields.filter(field => field.id !== 'card' || !picks.card?.length).map(field =>
        <button type="button" key={field.id} data-step={field.id} aria-pressed={field.id === active?.id} disabled={busy} onClick={() => step(field.id)}>
          {stepLabel(field)}{field.id === 'payment' ? ` · ${picks.payment?.length ?? 0}/${field.min}` : ''}</button>)}</div>}
      {active && <details key={active.id} className="phone-options" open={!onMat || rollingGig || undefined}>
        <summary>{paying ? 'Payment sources' : onMat ? 'Eligible targets' : active.label} ({active.options.length})</summary>{options}
      </details>}
      <div className="phone-commit"><button type="button" className="btn play-confirm" data-confirm-move={action.id} disabled={busy || !ready} onClick={submit}>{confirmText}</button>
        {(!forced || hasPicks) && <button className="btn quiet" type="button" disabled={busy} onClick={resettingPayment ? resetPayment : cancel}>{forced ? 'Reset' : 'Cancel'}</button>}{alternatives}</div>
    </div>;
  }
  return <section className="play-decision-tray" aria-label="Table decision" data-forced={forced} data-placement={placement || undefined}>
    <form className="play-picks" onSubmit={(event) => { event.preventDefault(); if (!busy && ready) submit(); }}>
      <div className="play-tray-head">
        <div className="play-tray-intent">
          {sourceCard && <button type="button" className="play-tray-source" aria-label={`Inspect ${sourceCard.cardName ?? 'selected card'}`} onClick={(event) => inspect(sourceCard, event.currentTarget)}><CardFace card={sourceCard} /></button>}
          <div>
            {(!showPanel || onMat) && <h3>{heading}</h3>}
            {!placement && inlineDetail && <p><Rules text={inlineDetail} /></p>}
            {onMat && showLimit && <p>{limit}</p>}
          </div>
        </div>
        <div className="play-tray-actions">
          <button className="btn play-confirm" data-confirm-move={action.id} disabled={busy || !ready}>{confirm}</button>
          {(!forced || hasPicks || resettingPayment) && <button className="btn quiet" type="button" disabled={busy} onClick={event => {
            if (resettingPayment) resetPayment();
            else cancel();
            const button = event.currentTarget;
            const form = button.form;
            if (forced && !resettingPayment) requestAnimationFrame(() => {
              if (button.isConnected) return;
              (form?.querySelector<HTMLElement>('[data-pick-option]:enabled, .play-decision-panel-trigger:not([hidden])') ?? form?.closest<HTMLElement>('.play-command-inner'))?.focus({ preventScroll: true });
            });
          }}>{resettingPayment ? 'Reset payment' : forced ? 'Clear' : 'Cancel'}</button>}
          {alternatives}
        </div>
      </div>
      {(showPanel || context) && <div className="play-tray-summary">
        {showPanel && <PlayDecisionPanel key={onMat ? 'mat' : 'list'} label={onMat ? paying ? 'Payment sources' : 'Choice list' : heading}
          title={onMat ? paying ? 'Payment sources' : 'Eligible choices' : heading} defaultOpen={!onMat} hideTriggerWhenOpen onClose={triggerChoice ? () => leaveSource() : undefined}>
          {fields.length > 1 && <div className="play-choice-steps" aria-label="Decision steps">{fields.map(field =>
            <button type="button" key={field.id} className="btn quiet" aria-pressed={field.id === active?.id}
              data-step={field.id} disabled={busy} onClick={() => step(field.id)}>
              {stepLabel(field)} {isReady([field], picks) && (picks[field.id]?.length ?? 0) > 0 && <><span aria-hidden="true">✓</span><span className="sr-only"> selected</span></>}
            </button>)}</div>}
          {options}
          {active?.ordered && <p className="play-choice-detail">{active.destination === 'deckTop' ? 'First card is drawn first.' : 'Last card goes deepest in the deck.'}</p>}
          {active?.ordered && (picks[active.id]?.length ?? 0) > 1 && <ol className="play-choice-order" aria-label="Selected order">{picks[active.id].map((id, index, ids) =>
            <li key={id}><span>{index + 1}. {active.options.find((option) => option.id === id)?.label}</span>
              <button type="button" className="btn quiet" disabled={busy || index === 0} aria-label={`Move ${active.options.find((option) => option.id === id)?.label} earlier`} onClick={() => {
                // Reorder the selected cards without changing their destination.
                const reordered = [...ids]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
                reorder(active.id, reordered);
              }}>↑</button>
            </li>)}</ol>}
          {otherPlacements.length > 0 && <div className="play-placement-review" aria-label="Other destinations">
            {otherPlacements.map((field) => <div key={field.id}><strong>{field.label}</strong><span>{picks[field.id].map((id) => field.options.find((option) => option.id === id)?.label).join(field.ordered ? ' → ' : ' · ')}</span></div>)}
          </div>}
          <div className="play-placement-notes">
            {placement && unassigned.length > 0 && action.remainder && <details>
              <summary>{unassigned.length} <span aria-hidden="true">→</span><span className="sr-only"> cards to </span> {action.remainder.toLowerCase()}</summary>
              <p>{unassigned.map((card) => card.cardName ?? 'Revealed card').join(' · ')}</p>
            </details>}
            {!inlineDetail && action.detail && <details><summary>Effect rules</summary><p><Rules text={action.detail} /></p></details>}
            {triggerChoice && triggerRules(active).map(rule => <details key={rule.note}>
              <summary>{rule.label}</summary><p><Rules text={rule.note} /></p>
            </details>)}
          </div>
        </PlayDecisionPanel>}
        {context}
      </div>}
    </form>
  </section>;
}
