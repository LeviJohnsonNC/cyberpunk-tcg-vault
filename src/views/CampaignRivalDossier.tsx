import { useId, useLayoutEffect, useRef, useState } from 'react';
import { BY_SLUG, defaultPrinting, type Printing } from '../lib/data';
import type { EncounterId } from '../lib/play/campaign';
import { campaignChapters } from '../lib/play/campaignStory';
import { campaignRivalIntel } from '../lib/play/campaignRivalIntel';
import type { RivalDialogueState } from '../lib/play/rivalDialogue';
import type { StarterKey } from '../lib/starters';
import type { CampaignInspect } from './CampaignHub';
import { CampaignRewardArt } from './CampaignRewardArt';
import { CampaignRivalPortrait } from './CampaignStory';
import latch from '../assets/play/latch-dossier.webp';
import './campaign-rival-dossier.css';

type DossierLegend = { slug: string; printing?: Printing };
type SharedProps = {
  encounter: EncounterId;
  starter: StarterKey;
  legends: readonly DossierLegend[];
  inspect: CampaignInspect;
};
type MatchProps = {
  context: 'match';
  quote?: RivalDialogueState['line'];
  dialogue: boolean;
  toggle: () => void;
};
type DossierProps = SharedProps & ({ context: 'contract' } | MatchProps);

const dossierArt: Partial<Record<EncounterId, string>> = { 'dead-drop': latch };

function DossierPortrait({ encounter }: { encounter: EncounterId }) {
  const [failed, setFailed] = useState(false);
  const src = dossierArt[encounter];
  return <div className="campaign-dossier-art" aria-hidden="true">
    {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <CampaignRivalPortrait encounter={encounter} />}
  </div>;
}

const insignias = {
  momentum: <>
    <path d="M5 24h12l-5 6H1l4-6Zm9-10h15l8 10-8 10h-9l8-10-8-4h-9l3-6Z" fill="currentColor" stroke="none" />
    <path d="M22 7h14l14 17-14 17H25l15-17-12-13h-9" />
    <path d="M5 35h10m22-4 5-7-5-6" className="dossier-icon-accent" />
  </>,
  mechanism: <>
    <path d="M8 24 15 12h12l6 12-6 12H15L8 24Zm6 0 4-7h6l4 7-4 7h-6l-4-7Z" />
    <path d="M26 10h6l7 10h8v8h-8l-7 10h-6M2 24h6m13-12V7m0 34v-5m19-16 3-6h7m-7 14 3 6h4" />
    <path d="M21 20l3 4-3 4-3-4Z" fill="currentColor" className="dossier-icon-accent" />
  </>,
  acquisition: <>
    <path d="M4 19V9h11m22 0h9v11m0 9v10H35m-21 0H4V28" />
    <path d="m12 18 6-6h14l6 6v12l-6 6H18l-6-6V18Z" />
    <path d="M25 4v14m0 12v14M0 24h19m12 0h19m-25-4 4 4-4 4-4-4Z" className="dossier-icon-accent" />
  </>,
};

function Insignia({ kind }: { kind: keyof typeof insignias }) {
  return <svg className="campaign-dossier-insignia" viewBox="-3 0 56 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="miter">
    {insignias[kind]}
  </svg>;
}

export function CampaignRivalDossier(props: DossierProps) {
  const { encounter, starter, legends, inspect, context } = props;
  const { rival, role } = campaignChapters[encounter];
  const { bio, playstyle, threat, counterplay } = campaignRivalIntel(encounter, starter);
  const detail = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pointerOnBackdrop = useRef(false);
  const [opened, setOpened] = useState(false);
  const titleId = useId();

  useLayoutEffect(() => {
    if (opened) heading.current?.focus({ preventScroll: true });
  }, [opened]);

  const intel = [
    { icon: 'momentum', heading: 'Playstyle', tag: playstyle.label, text: playstyle.summary },
    { icon: 'mechanism', heading: 'Key threat', text: threat },
    { icon: 'acquisition', heading: 'Your counterplay', text: counterplay },
  ] as const;

  return <>
    <button ref={trigger} type="button" className={context === 'contract' ? 'btn quiet campaign-board-dossier' : 'campaign-rival-trigger'}
      aria-label={`View ${rival}’s profile`} aria-haspopup="dialog"
      onClick={() => { detail.current?.showModal(); setOpened(true); }}>
      {context === 'contract' ? <>View profile <span aria-hidden="true">→</span></> : <CampaignRivalPortrait encounter={encounter} />}
    </button>
    <dialog className="al-dialog campaign-rival-dialog" ref={detail} aria-labelledby={titleId}
      onClose={() => { setOpened(false); trigger.current?.focus({ preventScroll: true }); }}
      onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
      onPointerDown={event => { pointerOnBackdrop.current = event.target === event.currentTarget; }}
      onClick={event => { if (pointerOnBackdrop.current && event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="campaign-dossier-layout">
        {opened ? <DossierPortrait key={encounter} encounter={encounter} /> : <div className="campaign-dossier-art" />}
        <button type="button" className="campaign-dossier-close" aria-label="Close rival dossier" onClick={() => detail.current?.close()}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m2 2 16 16M18 2 2 18" /></svg>
        </button>
        <div className="campaign-dossier-copy">
          <header className="campaign-dossier-header">
            <p className="campaign-invitation-eyebrow">Rival dossier <span aria-hidden="true">//</span> {role}</p>
            <h2 ref={heading} tabIndex={-1} id={titleId}>{rival}<span aria-hidden="true">.</span></h2>
            <p className="campaign-dossier-bio">{bio}</p>
          </header>
          <div className="campaign-dossier-intel">
            {intel.map(item => <section className="campaign-dossier-intel-row" key={item.icon}>
              <span className="campaign-dossier-insignia-frame"><Insignia kind={item.icon} /></span>
              <div>
                <h3>{item.heading}{'tag' in item && <span> / {item.tag}</span>}</h3>
                <p>{item.text}</p>
              </div>
            </section>)}
          </div>
          {opened && !!legends.length && <section className="campaign-dossier-legends" aria-label="Known Legends">
            <h3>Known Legends</h3>
            <ul>{legends.map(({ slug, printing }) => {
              const card = BY_SLUG.get(slug);
              if (!card) return null;
              const art = printing ?? defaultPrinting(card);
              return <li key={slug}><button type="button" aria-label={`Inspect ${card.display}`} aria-haspopup="dialog"
                onClick={event => { event.currentTarget.focus({ preventScroll: true }); inspect(slug, art?.id); }}>
                <CampaignRewardArt pull={{ slug, printing: art }} alt="" exact showNameWhileLoading />
              </button></li>;
            })}</ul>
          </section>}
          {props.context === 'match' && props.dialogue && props.quote && <blockquote>“{props.quote.text}”</blockquote>}
          <footer className="campaign-dossier-footer">
            {props.context === 'match' && <button type="button" className="btn quiet campaign-dossier-dialogue"
              aria-pressed={props.dialogue} onClick={props.toggle}>Rival dialogue <span>{props.dialogue ? 'On' : 'Off'}</span></button>}
            <button type="button" className="campaign-invitation-cta" onClick={() => detail.current?.close()}>
              {context === 'contract' ? 'Return to contract' : 'Return to match'} <span aria-hidden="true">→</span>
            </button>
          </footer>
        </div>
      </div>
    </dialog>
  </>;
}

export function CampaignRivalSeat(props: SharedProps & Omit<MatchProps, 'context'>) {
  const { rival } = campaignChapters[props.encounter];
  return <div className="campaign-rival-seat">
    <CampaignRivalDossier {...props} context="match" />
    <div className="campaign-rival-caption">
      <strong>{rival}</strong>
      <div aria-live="polite">{props.dialogue && props.quote && <p key={props.quote.sequence}>“{props.quote.text}”</p>}</div>
    </div>
  </div>;
}
