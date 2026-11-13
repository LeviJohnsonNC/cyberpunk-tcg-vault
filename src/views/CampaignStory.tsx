import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ENCOUNTERS, type CampaignRun, type EncounterId } from '../lib/play/campaign';
import { campaignChapters, campaignInvitation, unlockedCampaignChapters } from '../lib/play/campaignStory';
import { contractScenes, type CampaignSceneBeat } from '../lib/play/campaignScenes';
import moth from '../assets/play/campaign-first-call.webp';
import booth from '../assets/play/campaign-booth.webp';
import roof from '../assets/play/campaign-rooftop.webp';
import suite from '../assets/play/campaign-arasaka.webp';
import receipt from '../assets/play/story/first-call.webp';
import debt from '../assets/play/story/chrome-debt.webp';
import recorder from '../assets/play/story/dead-drop.webp';
import phone from '../assets/play/story/night-drive.webp';
import terminal from '../assets/play/story/dead-air.webp';
import key from '../assets/play/story/red-line.webp';
import microphone from '../assets/play/story/mosh-pit.webp';
import footage from '../assets/play/story/hostile-takeover.webp';
import chair from '../assets/play/story/last-call.webp';
import invitation from '../assets/play/last-call-afterlife.webp';
import compactInvitation from '../assets/play/last-call-afterlife-compact.webp';
import { PlayOptionsMenu } from './PlayResetMenu';
import ledger from '../assets/play/last-call-ledger.webp';
import './campaign-story.css';
import './campaign-invitation.css';
import './campaign-scenes.css';

export function CampaignRivalPortrait({ encounter }: { encounter: EncounterId }) {
  const index = ENCOUNTERS.findIndex(contract => contract.id === encounter);
  const style = { '--portrait-x': `${index % 3 * 50}%`, '--portrait-y': `${Math.floor(index / 3) * 50}%` } as CSSProperties;
  return <span className="campaign-rival-portrait" style={style} aria-hidden="true" />;
}

export function CampaignInvitation({ scope, proceed, onBack, onReset, busy }: {
  scope: string; proceed: () => void; onBack?: () => void; onReset?: () => void; busy: boolean;
}) {
  const entranceKey = `cptv.campaign.introEntrance:${scope}`;
  const [animate] = useState(() => {
    try { return sessionStorage.getItem(entranceKey) !== 'shown'; } catch { return false; }
  });
  useEffect(() => {
    if (!animate) return;
    try { sessionStorage.setItem(entranceKey, 'shown'); } catch { /* Entrance stays optional. */ }
  }, [animate, entranceKey]);

  return <section className="campaign-invitation" aria-labelledby="campaign-invitation-title" data-enter={animate || undefined}>
    <picture className="campaign-invitation-art">
      <source media="(max-width: 780px)" srcSet={compactInvitation} />
      <img src={invitation} width="1672" height="941" alt="" fetchPriority="high" />
    </picture>
    <div className="campaign-invitation-copy">
      <p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span><span className="sr-only"> – </span> The Invitation</p>
      <h1 id="campaign-invitation-title" tabIndex={-1}>{campaignInvitation.title}<span>.</span></h1>
      <div className="campaign-invitation-story">
        <p>{campaignInvitation.setup}</p>
        <p>{campaignInvitation.payout}</p>
        <p className="campaign-invitation-reveal">{campaignInvitation.reveal}</p>
      </div>
      <button className="campaign-invitation-cta" type="button" onClick={proceed} disabled={busy}>
        Choose your crew <span aria-hidden="true">→</span>
      </button>
    </div>
    <div className="campaign-invitation-options">
      <PlayOptionsMenu label="More Campaign options" options={[
        { label: 'Skip intro', onSelect: proceed, disabled: busy },
        ...(onBack ? [{ label: 'Back to current campaign', onSelect: onBack, disabled: busy }] : []),
        ...(onReset ? [{ label: 'Reset campaign', onSelect: onReset, disabled: busy, danger: true }] : []),
      ]} />
    </div>
  </section>;
}

export function CampaignDispatch({ encounter }: { encounter: EncounterId }) {
  const { victory } = campaignChapters[encounter];
  return <aside className="campaign-dispatch" aria-label="Story update">
    <h3>{victory.title}</h3>
    <p>{victory.text}</p>
  </aside>;
}

const sceneClues = {
  'first-call': [receipt, 'Moth lifts a finger from the wet signature on the receipt.'],
  'chrome-debt': [debt, 'Ledger holds down a torn book page with one cybernetic finger.'],
  'dead-drop': [recorder, 'A field recorder sits inside a courier’s opened parcel.'],
  'night-drive': [phone, 'The dead phone lights up beside the rooftop relay.'],
  'dead-air': [terminal, 'Two traces converge on the same account on Hush’s screen.'],
  'red-line': [key, 'Brake slides the brass lift key across the table.'],
  'mosh-pit': [microphone, 'The microphone is still live as the crowd watches the key.'],
  'hostile-takeover': [footage, 'On the raw security feed, Sato waits by the lift with the paperwork.'],
  'last-call': [chair, 'Daybreak falls across the empty chair and the open ledger.'],
} satisfies Record<EncounterId, readonly [string, string]>;
const sceneRooms = [booth, roof, suite];

export function CampaignScene({ encounter, beats, index, outcome, busy, next, skip, tools }: {
  encounter: EncounterId; beats: readonly CampaignSceneBeat[]; index: number; outcome: 'win' | 'loss' | 'draw';
  busy?: boolean; next: () => void; skip?: () => void; tools?: ReactNode;
}) {
  const id = useId();
  const contract = ENCOUNTERS.find(item => item.id === encounter)!;
  const act = Math.floor(ENCOUNTERS.indexOf(contract) / 3) + 1;
  const beat = beats[index];
  const title = useRef<HTMLHeadingElement>(null);
  const last = index === beats.length - 1;
  const replay = !skip;
  const label = outcome === 'win' ? 'Contract won' : outcome === 'draw' ? 'Match drawn' : 'Contract lost';
  const [clue, clueAlt] = sceneClues[encounter];
  const still = beat.art === 'clue' ? clue : beat.art === 'room' ? encounter === 'last-call' ? ledger : sceneRooms[act - 1] : encounter === 'first-call' ? moth : undefined;

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    title.current?.closest('.campaign-scene')?.scrollIntoView({ block: 'nearest' });
  }, [index, encounter]);

  useEffect(() => {
    if (beats[index + 1]?.art !== 'clue') return;
    const image = new Image();
    image.src = clue;
  }, [beats, clue, index]);

  return <section className="campaign-scene" data-act={act} data-replay={replay || undefined} aria-labelledby={id}>
    <header className="campaign-scene-header">
      <p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span> {contract.title}</p>
      {tools}
    </header>
    <div className="campaign-scene-stage" key={index}>
      <figure className="campaign-scene-frame" data-shot={beat.art} data-encounter={encounter}>
        {still ? <img src={still} alt={beat.art === 'clue' ? clueAlt : ''} fetchPriority="high" /> : <CampaignRivalPortrait encounter={encounter} />}
      </figure>
      <div className="campaign-scene-copy">
        <p className="campaign-scene-result">{replay ? 'Story so far' : label}</p>
        {replay
          ? <h2 id={id} tabIndex={-1} ref={title}>{beat.title}<span aria-hidden="true">.</span></h2>
          : <h1 id={id} tabIndex={-1} ref={title}>{beat.title}<span aria-hidden="true">.</span></h1>}
        <p className="campaign-scene-text">{beat.text}</p>
        <div className="campaign-scene-actions">
          <button type="button" className="campaign-invitation-cta" disabled={busy} onClick={next}>
            {last ? replay ? 'Back to journal' : 'Open your pack' : 'Continue'} <span aria-hidden="true">→</span>
          </button>
          {skip && !last && <button type="button" className="btn quiet" disabled={busy} onClick={skip}>Skip to pack</button>}
        </div>
      </div>
    </div>
    <footer className="campaign-scene-footer">
      <span>{campaignChapters[encounter].rival}</span>
      {beats.length > 1 && <span aria-label={`Scene ${index + 1} of ${beats.length}`}>{String(index + 1).padStart(2, '0')} / {String(beats.length).padStart(2, '0')}</span>}
      {!replay && <span>Reward saved</span>}
    </footer>
  </section>;
}

export function CampaignStoryJournal({ run }: { run: CampaignRun }) {
  const journal = useRef<HTMLDialogElement>(null);
  const lastChapter = useRef<EncounterId | undefined>(undefined);
  const [replay, setReplay] = useState<{ encounter: EncounterId; index: number }>();
  const titleId = useId();
  const beats = replay && contractScenes[replay.encounter].win;
  function stopReplay() {
    setReplay(undefined);
    requestAnimationFrame(() => journal.current?.querySelector<HTMLButtonElement>(`button[data-encounter='${lastChapter.current}']`)?.focus());
  }
  return <>
    <button type="button" className="btn quiet" aria-haspopup="dialog" onClick={() => journal.current?.showModal()}>Story so far</button>
    <dialog className="al-dialog campaign-story-journal" ref={journal} aria-labelledby={replay ? undefined : titleId} aria-label={replay ? "Story so far" : undefined} data-replay={!!replay || undefined}
      onClose={() => setReplay(undefined)} onClick={event => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}>
      {replay && beats ? <CampaignScene encounter={replay.encounter} beats={beats} index={replay.index} outcome="win"
        next={() => replay.index + 1 < beats.length ? setReplay({ ...replay, index: replay.index + 1 }) : stopReplay()}
        tools={<button type="button" className="btn quiet" onClick={stopReplay}>Back to journal</button>} />
        : <div className="al-dialog-body">
          <header><h2 id={titleId}>Story so far</h2><button type="button" className="btn quiet" onClick={() => journal.current?.close()}>Close</button></header>
          <div className="campaign-journal-chapters">
            <article><h3>The invitation</h3><p>{campaignInvitation.setup} {campaignInvitation.payout} {campaignInvitation.reveal}</p></article>
            {unlockedCampaignChapters(run).map(contract => {
              const { victory } = campaignChapters[contract.id];
              return <article key={contract.id}>
                <p className="play-eyebrow">{contract.title}</p><h3>{victory.title}</h3><p>{victory.text}</p>
                <button type="button" className="btn quiet" data-encounter={contract.id}
                  onClick={() => { lastChapter.current = contract.id; setReplay({ encounter: contract.id, index: 0 }); }}>
                  Replay {contract.title}
                </button>
              </article>;
            })}
          </div>
        </div>}
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
