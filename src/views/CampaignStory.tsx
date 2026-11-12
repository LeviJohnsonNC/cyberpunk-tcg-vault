import { useId, useRef, type CSSProperties } from 'react';
import { ENCOUNTERS, type CampaignRun, type EncounterId } from '../lib/play/campaign';
import { campaignChapters, campaignInvitation, unlockedCampaignChapters } from '../lib/play/campaignStory';
import type { StarterKey } from '../lib/starters';
import { campaignRivalIntel } from '../lib/play/campaignRivalIntel';
import type { RivalDialogueState } from '../lib/play/rivalDialogue';
import invitation from '../assets/play/last-call-invitation.webp';
import ledger from '../assets/play/last-call-ledger.webp';
import './campaign-story.css';

type Quote = RivalDialogueState['line'];

function RivalPortrait({ encounter }: { encounter: EncounterId }) {
  const index = ENCOUNTERS.findIndex(contract => contract.id === encounter);
  const style = { '--portrait-x': `${index % 3 * 50}%`, '--portrait-y': `${Math.floor(index / 3) * 50}%` } as CSSProperties;
  return <span className="campaign-rival-portrait" style={style} aria-hidden="true" />;
}

export function CampaignInvitation({ proceed }: { proceed: () => void }) {
  return <section className="campaign-story-scene campaign-story-intro" aria-labelledby="campaign-invitation-title">
    <img src={invitation} alt="A cracked phone and a sealed envelope on a rain-lit booth table" fetchPriority="high" />
    <div className="campaign-story-copy">
      <p className="play-eyebrow">The Afterlife / A contract for your crew</p>
      <h2 id="campaign-invitation-title">{campaignInvitation.title}.</h2>
      <p>{campaignInvitation.text}</p>
      <div className="play-actions">
        <button type="button" className="btn" onClick={proceed}>Choose your crew</button>
        <button type="button" className="btn quiet" onClick={proceed}>Skip intro</button>
      </div>
    </div>
  </section>;
}

export function CampaignRivalBrief({ encounter, starter }: { encounter: EncounterId; starter: StarterKey }) {
  const chapter = campaignChapters[encounter];
  return <div className="campaign-rival-brief">
    <CampaignRivalDossier encounter={encounter} starter={starter} />
    <div>
      <p className="play-eyebrow">{chapter.role}</p>
      <h3>{chapter.rival}</h3>
      <p>{chapter.briefing}</p>
    </div>
  </div>;
}

export function CampaignDispatch({ encounter }: { encounter: EncounterId }) {
  const { victory } = campaignChapters[encounter];
  return <aside className="campaign-dispatch" aria-label="Story update">
    <h3>{victory.title}</h3>
    <p>{victory.text}</p>
  </aside>;
}

export function CampaignStoryJournal({ run }: { run: CampaignRun }) {
  const journal = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return <>
    <button type="button" className="btn quiet" aria-haspopup="dialog" onClick={() => journal.current?.showModal()}>Story so far</button>
    <dialog className="al-dialog campaign-story-journal" ref={journal} aria-labelledby={titleId} onClick={event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}>
      <div className="al-dialog-body">
        <header><h2 id={titleId}>Story so far</h2><button type="button" className="btn quiet" onClick={() => journal.current?.close()}>Close</button></header>
        <div className="campaign-journal-chapters">
          <article><h3>The invitation</h3><p>{campaignInvitation.text}</p></article>
          {unlockedCampaignChapters(run).map(contract => {
            const { victory } = campaignChapters[contract.id];
            return <article key={contract.id}>
              <p className="play-eyebrow">{contract.title}</p><h3>{victory.title}</h3><p>{victory.text}</p>
            </article>;
          })}
        </div>
      </div>
    </dialog>
  </>;
}

export function CampaignEpilogue() {
  const { victory } = campaignChapters['last-call'];
  return <section className="campaign-story-scene campaign-epilogue" aria-labelledby="campaign-epilogue-title">
    <img src={ledger} alt="Dawn falls across the open house ledger and a brass key" loading="lazy" />
    <div className="campaign-story-copy">
      <p className="play-eyebrow">Epilogue / First light</p>
      <h3 id="campaign-epilogue-title">{victory.title}.</h3>
      <p>{victory.text}</p>
    </div>
  </section>;
}

type DossierProps = {
  encounter: EncounterId;
  starter: StarterKey;
  quote?: Quote;
  dialogue?: boolean;
  toggle?: () => void;
};

function CampaignRivalDossier({ encounter, starter, quote, dialogue, toggle }: DossierProps) {
  const { rival, role } = campaignChapters[encounter];
  const { bio, tips } = campaignRivalIntel(encounter, starter);
  const detail = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  return <>
    <button type="button" className="campaign-rival-trigger" aria-label={`View ${rival}’s profile`} aria-haspopup="dialog"
      onClick={() => { detail.current?.showModal(); heading.current?.focus({ preventScroll: true }); }}>
      <RivalPortrait encounter={encounter} />
    </button>
    <dialog className="al-dialog campaign-rival-dialog" ref={detail} aria-labelledby={titleId}
      onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="al-dialog-body">
        <div className="campaign-dossier-layout">
          <div className="campaign-dossier-art"><RivalPortrait encounter={encounter} /></div>
          <div className="campaign-dossier-copy">
            <p className="play-eyebrow">{role}</p>
            <h2 ref={heading} tabIndex={-1} id={titleId}>{rival}</h2>
            <p className="campaign-dossier-bio">{bio}</p>
            <h3>How they play</h3>
            <ul>{tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
            {dialogue && quote && <blockquote>“{quote.text}”</blockquote>}
          </div>
        </div>
        <div className="al-dialog-actions">
          {toggle && <button type="button" className="btn quiet" aria-pressed={dialogue} onClick={toggle}>Rival dialogue {dialogue ? 'on' : 'off'}</button>}
          <button type="button" className="btn" onClick={() => detail.current?.close()}>Close</button>
        </div>
      </div>
    </dialog>
  </>;
}

export function CampaignRivalSeat(props: DossierProps) {
  const { rival } = campaignChapters[props.encounter];
  return <div className="campaign-rival-seat">
    <CampaignRivalDossier {...props} />
    <div className="campaign-rival-caption">
      <strong>{rival}</strong>
      <div aria-live="polite">{props.dialogue && props.quote && <p key={props.quote.sequence}>“{props.quote.text}”</p>}</div>
    </div>
  </div>;
}

export function CampaignRivalFarewell({ encounter, quote }: { encounter: EncounterId; quote: NonNullable<Quote> }) {
  return <figure className="campaign-rival-farewell">
    <RivalPortrait encounter={encounter} />
    <div><blockquote>“{quote.text}”</blockquote><figcaption>{campaignChapters[encounter].rival}</figcaption></div>
  </figure>;
}
