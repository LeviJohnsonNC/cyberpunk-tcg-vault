import { campaignCrew } from '../lib/play/campaignDeckRules';
import { useId, useRef, type ReactNode, type Ref } from 'react';
import { BY_SLUG, PRINTING_INDEX, type Printing } from '../lib/data';
import { totalCopies } from '../lib/deckDraft';
import { ENCOUNTERS, encounterDeck, pendingCampaignPack, type CampaignProfile, type CampaignRun, type Environment } from '../lib/play/campaign';
import { CAMPAIGN_ACTS } from '../lib/play/campaignPresentation';
import { campaignChapters } from '../lib/play/campaignStory';
import { STARTERS } from '../lib/starters';
import type { Deck } from '../lib/store';
import { CampaignRooms } from './CampaignMoments';
import { CampaignRewardArt } from './CampaignRewardArt';
import { CampaignRivalDossier, CampaignRivalPortrait, CampaignStoryJournal } from './CampaignStory';
import { PlayOptionsMenu } from './PlayResetMenu';
import './campaign-hub.css';

export type CampaignInspect = (slug: string, printingId?: string) => void;

export function CampaignCrewCards({ deck, printings, inspect, label }: {
  deck: Deck; printings?: ReadonlyMap<string, Printing>; inspect: CampaignInspect; label: string;
}) {
  const retail = STARTERS.find(starter => deck.id === `campaign:${starter.key}`)?.printings.retail;
  return <ul className="campaign-board-crew-cards" aria-label={label}>
    {deck.legends.map(slug => {
      const printing = printings?.get(slug) ?? PRINTING_INDEX.get(retail?.[slug] ?? '')?.printing;
      const name = BY_SLUG.get(slug)?.display ?? slug;
      return <li key={slug}><button type="button" aria-haspopup="dialog" aria-label={`Inspect ${name}`} onClick={() => inspect(slug, printing?.id)}>
        <CampaignRewardArt pull={{ slug, printing }} alt="" />
      </button></li>;
    })}
  </ul>;
}

export function CampaignTimeline({ run }: { run: CampaignRun }) {
  const ended = run.phase === 'completed' || run.phase === 'claimingFinish';
  const currentAct = Math.floor(run.encounter / 3);
  return <div className="campaign-board-timeline" aria-label="Campaign progression">
    <span className="campaign-tracker-label">Act {currentAct + 1} / {CAMPAIGN_ACTS.length}</span>
    <ol aria-label="Nine campaign contracts">
      {ENCOUNTERS.map((item, index) => {
        const cleared = ended || index < run.encounter;
        const current = !ended && index === run.encounter;
        const awaitingPack = current && run.phase === 'rewardPending';
        const status = cleared ? 'Cleared' : awaitingPack ? 'Won, pack ready' : current ? 'Current' : 'Locked';
        const label = `Contract ${index + 1}${cleared || current ? `, ${item.title}` : ''}: ${status}`;
        return <li key={item.id} data-state={cleared ? 'cleared' : awaitingPack ? 'reward' : current ? 'current' : 'locked'}
          aria-current={current ? 'step' : undefined} aria-label={label} title={label}>
          <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          {cleared && <span className="campaign-board-cleared" aria-hidden="true">✓</span>}
          {awaitingPack && <span className="campaign-board-cleared" aria-hidden="true">◆</span>}
        </li>;
      })}
    </ol>
    <span className="campaign-tracker-label">{ended ? '9 cleared' : `Contract ${run.encounter + 1} / ${ENCOUNTERS.length}`}</span>
  </div>;
}

export function CampaignHubTools({ run, profile, busy, soundEnabled, toggleSound, newRun, reset, exit, equipRoom, openInBuilder }: {
  run: CampaignRun; profile: CampaignProfile; busy: boolean; soundEnabled: boolean; toggleSound: () => void;
  newRun: () => void; reset: () => void; exit?: () => void; equipRoom: (room: Environment) => void; openInBuilder: (deck: Deck) => void;
}) {
  const archive = useRef<HTMLDialogElement>(null);
  const rooms = useRef<HTMLDialogElement>(null);
  const archiveTitle = useId(), roomTitle = useId();
  const history = profile.history ?? [];
  return <div className="campaign-board-tools">
    <CampaignStoryJournal run={run} />
    <PlayOptionsMenu label="More Campaign options" options={[
      { label: soundEnabled ? 'Turn game effects off' : 'Turn game effects on', onSelect: toggleSound },
      ...(profile.environments.length && run.phase !== 'claimingFinish' ? [{ label: 'Unlocked rooms', onSelect: () => rooms.current?.showModal() }] : []),
      ...(history.length ? [{ label: 'Previous runs', onSelect: () => archive.current?.showModal() }] : []),
      ...(exit ? [{ label: 'Free Play', onSelect: exit, disabled: busy }] : []),
      ...(run.phase !== 'claimingFinish' && !(run.phase === 'rewardPending' && run.completedAt) ? [{ label: 'Start a new campaign', onSelect: newRun, disabled: busy }] : []),
      { label: 'Reset campaign', onSelect: reset, disabled: busy, danger: true },
    ]} />
    <dialog ref={rooms} className="al-dialog campaign-board-library" aria-labelledby={roomTitle}>
      <div className="al-dialog-body">
        <header><h2 id={roomTitle}>Unlocked rooms</h2><button type="button" className="btn quiet" onClick={() => rooms.current?.close()}>Close</button></header>
        {profile.environments.length > 0 && <CampaignRooms action="equip" rooms={profile.environments} selected={profile.equipped} busy={busy} onSelect={equipRoom} />}
      </div>
    </dialog>
    <dialog ref={archive} className="al-dialog campaign-board-library" aria-labelledby={archiveTitle}>
      <div className="al-dialog-body">
        <header><h2 id={archiveTitle}>Previous runs</h2><button type="button" className="btn quiet" onClick={() => archive.current?.close()}>Close</button></header>
        <ul className="campaign-board-archive">{[...history].reverse().map(item => <li key={item.id}>
          <span>{STARTERS.find(starter => starter.key === item.starter)?.name} · {item.completed ? 'Cleared all nine tables' : `Stopped after ${item.cleared} wins`}</span>
          {item.completed && <button type="button" className="btn quiet" onClick={() => openInBuilder(item.deck)}>Open finished deck as draft</button>}
        </li>)}</ul>
      </div>
    </dialog>
  </div>;
}

export function CampaignHub({ run, titleRef, tools, issues, busy, printings, inspect, tune, reviewNew, primary, preparationOnly }: {
  run: CampaignRun; titleRef: Ref<HTMLHeadingElement>; tools: ReactNode; issues: string[]; busy: boolean;
  printings: ReadonlyMap<string, Printing>; inspect: CampaignInspect; tune: () => void; reviewNew?: () => void; primary: () => void; preparationOnly?: boolean;
}) {
  const encounter = ENCOUNTERS[run.encounter];
  const chapter = campaignChapters[encounter.id];
  const rival = encounterDeck(run);
  const actIndex = Math.floor(run.encounter / 3);
  const pending = !!pendingCampaignPack(run);
  const storyPending = pending && run.aftermath && !run.aftermath.sceneSeen;
  const resumable = run.phase === 'inMatch' || !!run.resultPending;
  const canTune = !pending && !resumable;
  const blocked = canTune && issues.length > 0;
  const desktopRequired = preparationOnly && !pending;
  const { colours } = campaignCrew(run.deck.legends);
  return <section className="campaign-board" data-act={actIndex + 1} aria-labelledby="campaign-contract-title">
    <header className="campaign-board-header">
      <div>
        <p className="campaign-invitation-eyebrow">The Afterlife <span aria-hidden="true">//</span> {CAMPAIGN_ACTS[actIndex].kicker}</p>
        <h1 id="campaign-contract-title" tabIndex={-1} ref={titleRef}>{encounter.title}<span aria-hidden="true">.</span></h1>
        <p>{encounter.brief}</p>
      </div>
    </header>

    <div className="campaign-board-matchup">
      <article className="campaign-board-rival" aria-labelledby="campaign-opponent-title">
        <div className="campaign-board-rival-art" aria-hidden="true" data-encounter={encounter.id}>
          {encounter.id !== 'first-call' && <CampaignRivalPortrait encounter={encounter.id} />}
        </div>
        <div className="campaign-board-rival-copy">
          <p className="play-eyebrow">{chapter.role}</p>
          <h2 id="campaign-opponent-title">{chapter.rival}</h2>
          <p className="campaign-board-briefing">{chapter.briefing}</p>
          <CampaignRivalDossier encounter={encounter.id} starter={run.starter} textButton />
          <p className="campaign-board-rival-deck">{rival.name}</p>
          <CampaignCrewCards deck={rival} inspect={inspect} label="Rival Legends" />
        </div>
      </article>
      <article className="campaign-board-your-crew" aria-labelledby="campaign-your-crew">
        <p className="play-eyebrow">Your crew</p>
        <h2 id="campaign-your-crew">{run.deck.name}</h2>
        <div className="campaign-board-crew-meta">
          <span>{colours.join(' + ')} · {totalCopies(run.deck.cards)} main cards</span>
          {blocked && <span className="campaign-board-status" data-needs-edit>Deck needs edits</span>}
          {resumable && <span className="campaign-board-status">Match saved</span>}
          {pending && <span className="campaign-board-status">{run.phase === 'retryReward' ? 'House pack earned' : 'Contract won'}</span>}
        </div>
        <CampaignCrewCards deck={run.deck} printings={printings} inspect={inspect} label="Equipped Legends" />
        {canTune && <div className="campaign-board-crew-actions">
          <button type="button" className="btn quiet" disabled={busy} onClick={tune}>Tune your deck</button>
          {reviewNew && <button type="button" className="btn quiet campaign-board-review" disabled={busy} onClick={reviewNew}>Review new cards <span aria-hidden="true">→</span></button>}
        </div>}
      </article>
    </div>

    <div className="campaign-board-footer">
      <CampaignTimeline run={run} />
      {tools}
      <div className="campaign-board-launch">
        <button type="button" className="campaign-invitation-cta" onClick={primary} disabled={busy || blocked || desktopRequired} aria-describedby={desktopRequired || blocked ? 'campaign-launch-issue' : undefined}>
          {run.resultPending ? 'Return to match result' : pending ? storyPending ? 'Continue story' : 'Open your pack' : resumable ? 'Return to match' : run.attempts ? 'Retry contract' : 'Take the contract'} <span aria-hidden="true">→</span>
        </button>
        {(desktopRequired || blocked) && <p id="campaign-launch-issue">{desktopRequired ? 'Play matches on desktop.' : issues[0]}</p>}
      </div>
    </div>
  </section>;
}
