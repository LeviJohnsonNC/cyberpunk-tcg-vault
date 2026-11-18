import { useState, type Ref } from 'react';
import { callRoutes, evidenceRoutes, type StoryChoice } from '../lib/play/campaignRoutes';
import { routeArt } from './campaignRouteArt';
import './campaign-decision.css';

const routeOptions = { ...callRoutes, ...evidenceRoutes };

export function CampaignDecision({ decision, busy, commit, titleRef }: {
  decision: 'call' | 'evidence'; busy: boolean; commit: (choice: StoryChoice) => void; titleRef: Ref<HTMLHeadingElement>;
}) {
  const [selection, select] = useState<StoryChoice>();
  const call = decision === 'call';
  const choices = call ? (['answer', 'moth', 'silence'] as const) : (['broadcast', 'seal'] as const);
  const art = selection ? routeOptions[selection].art : call ? 'handset' : 'key';
  const [src, alt] = routeArt[art];
  return <section className="campaign-decision" aria-labelledby="decision-title">
    <figure><img src={src} alt={alt} width="768" height="512" /></figure>
    <div className="campaign-decision-copy">
      <p className="campaign-invitation-eyebrow">{call ? 'Act II / Rainline relay' : 'Act III / The service lift'}</p>
      <h1 id="decision-title" ref={titleRef} tabIndex={-1}>{call ? 'Her number.' : 'Who gets the evidence?'}</h1>
      <p>{call
        ? '“If someone calls from my number, let it ring.” You can still hear the fixer’s warning when the phone starts to shake. Moth holds out a hand.'
        : 'Brake holds the lift. Downstairs, the crews want their names cleared. Some have families who still work for the house. Feedback offers you the mic. Splice offers you a private screening.'}</p>
      <fieldset disabled={busy}><legend className="sr-only">{call ? 'Who takes the call?' : 'Choose where the evidence goes'}</legend>
        {choices.map(id => <label key={id}>
          <input type="radio" name="story-path" checked={selection === id} onChange={() => select(id)} />
          <span><strong>{routeOptions[id].label}</strong><small>{routeOptions[id].stakes}</small></span>
        </label>)}
      </fieldset>
      <button className="btn" type="button" disabled={busy || !selection} onClick={() => selection && commit(selection)}>Commit to this path</button>
    </div>
  </section>;
}
