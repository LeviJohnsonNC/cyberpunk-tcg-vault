import type { Ref } from 'react';
import { PrintingArt } from '../components/PrintingArt';
import { BY_SLUG } from '../lib/data';
import { STARTERS, type StarterKey } from '../lib/starters';
import { PlayResetMenu } from './PlayResetMenu';
import './campaign-crew-pick.css';

const crewDescriptions: Record<StarterKey, string> = {
  'the-heist': 'Find Gear fast and improvise to keep the pressure on.',
  'embracing-power': 'Control the pace and hit back with Arasaka muscle.',
};

type CrewPickProps = {
  titleRef: Ref<HTMLHeadingElement>;
  arriving: boolean;
  busy: boolean;
  current?: StarterKey;
  starting?: StarterKey;
  readIntroduction: () => void;
  back?: () => void;
  reset?: () => void;
  inspect: (slug: string, printingId: string) => void;
  start: (starter: StarterKey) => void;
};

export function CampaignCrewPick({ titleRef, arriving, busy, current, starting, readIntroduction, back, reset, inspect, start }: CrewPickProps) {
  return <section className="campaign-crew-pick" aria-labelledby="campaign-starter-title" data-arriving={arriving || undefined}>
    <header className="campaign-crew-header">
      <div className="campaign-crew-heading">
        <p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span><span className="sr-only"> – </span> Contract 01</p>
        <h1 id="campaign-starter-title" tabIndex={-1} ref={titleRef}>Choose your crew</h1>
        <p className="campaign-crew-subtitle">Two crews. Two ways to survive Night City. Who’s coming with you?</p>
      </div>
      <div className="campaign-crew-links">
        <button type="button" className="btn quiet" disabled={busy} onClick={readIntroduction}>Read the introduction</button>
        {back && <button type="button" className="btn quiet" disabled={busy} onClick={back}>Back to current campaign</button>}
      </div>
    </header>
    <div className="campaign-crew-options">{STARTERS.map(starter => {
      const titleId = `campaign-crew-${starter.key}`;
      const saving = starting === starter.key;
      return <article className="campaign-crew-option" key={starter.key} data-crew={starter.key} data-starting={saving || undefined} aria-labelledby={titleId}>
        <div className="campaign-crew-cards">{starter.legends.map(slug => {
          const card = BY_SLUG.get(slug)!;
          const printingId = starter.printings.retail[slug];
          return <button key={slug} type="button" className="campaign-crew-card" aria-label={`Inspect ${card.display}`} aria-haspopup="dialog"
            disabled={busy} onClick={() => inspect(slug, printingId)}>
            <PrintingArt slug={slug} printingId={printingId} alt="" inline />
            <span className="campaign-crew-card-name" aria-hidden="true">{card.name}</span>
          </button>;
        })}</div>
        <div className="campaign-crew-details">
          <p className="campaign-crew-colours">Official starter <span aria-hidden="true">/</span>{' '}
            <span>{starter.colors[0]}</span>{' '}<span>+</span>{' '}<span>{starter.colors[1]}</span>
            {current === starter.key && <span className="campaign-crew-current">Current crew</span>}
          </p>
          <h2 id={titleId}>{starter.name}</h2>
          <p className="campaign-crew-description">{crewDescriptions[starter.key]}</p>
          <button type="button" className="campaign-invitation-cta campaign-crew-start" disabled={busy} aria-busy={saving || undefined}
            onClick={() => start(starter.key)}>
            {saving ? `Saving ${starter.name}…` : `Start with ${starter.name}`} <span aria-hidden="true">→</span>
          </button>
        </div>
      </article>;
    })}</div>
    {reset && <div className="campaign-invitation-options"><PlayResetMenu mode="Campaign" disabled={busy} onReset={reset} /></div>}
  </section>;
}
