import { useId, useRef, type CSSProperties } from 'react';
import { ENCOUNTERS, type CampaignRun, type EncounterId } from '../lib/play/campaign';
import { campaignChapters, campaignInvitation, unlockedCampaignChapters } from '../lib/play/campaignStory';
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

export function CampaignRivalBrief({ encounter }: { encounter: EncounterId }) {
  const chapter = campaignChapters[encounter];
  return <div className="campaign-rival-brief">
    <RivalPortrait encounter={encounter} />
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

export function CampaignRivalSeat({ encounter, quote, dialogue, toggle }: {
  encounter: EncounterId; quote: Quote; dialogue: boolean; toggle: () => void;
}) {
  const { rival, role } = campaignChapters[encounter];
  const detail = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return <div className="campaign-rival-seat">
    <button type="button" className="campaign-rival-trigger" aria-label={`View ${rival}’s dialogue`} aria-haspopup="dialog"
      onClick={() => detail.current?.showModal()}>
      <RivalPortrait encounter={encounter} />
    </button>
    <div className="campaign-rival-caption">
      <strong>{rival}</strong>
      <div aria-live="polite">{dialogue && quote && <p key={quote.sequence}>“{quote.text}”</p>}</div>
    </div>
    <dialog className="al-dialog campaign-rival-dialog" ref={detail} aria-labelledby={titleId}
      onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="al-dialog-body">
        <header><RivalPortrait encounter={encounter} /><div><p className="play-eyebrow">{role}</p><h2 id={titleId}>{rival}</h2></div></header>
        <div className="al-dialog-content"><p>{!dialogue ? 'Rival dialogue is off.' : quote ? `“${quote.text}”` : 'No lines yet in this match.'}</p></div>
        <div className="al-dialog-actions">
          <button type="button" className="btn quiet" aria-pressed={dialogue} onClick={toggle}>Rival dialogue {dialogue ? 'on' : 'off'}</button>
          <button type="button" className="btn" onClick={() => detail.current?.close()}>Close</button>
        </div>
      </div>
    </dialog>
  </div>;
}

export function CampaignRivalFarewell({ encounter, quote }: { encounter: EncounterId; quote: NonNullable<Quote> }) {
  return <figure className="campaign-rival-farewell">
    <RivalPortrait encounter={encounter} />
    <div><blockquote>“{quote.text}”</blockquote><figcaption>{campaignChapters[encounter].rival}</figcaption></div>
  </figure>;
}
