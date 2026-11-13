import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ui';
import { BY_SLUG, PRINTING_INDEX, type Printing } from '../lib/data';
import { STARTERS, type StarterKey } from '../lib/starters';
import type { Deck } from '../lib/store';
import { totalCopies } from '../lib/deckDraft';
import { COPY_MAX, MAIN_MAX } from '../lib/decks';
import { ENCOUNTERS, ENVIRONMENTS, campaignDeckIssues, pendingCampaignPack, type CampaignProfile, type CampaignRun } from '../lib/play/campaign';
import { readCampaign, startCampaign, resetCampaign, chooseReward, saveCampaignDeck, claimEnvironment, equipEnvironment, revealCampaignPack, advanceCampaignScene, finishCampaignPack, acknowledgeCampaignAct } from '../lib/play/campaignStorage';
import type { CampaignWorkerResponse } from '../lib/play/campaign.worker';
import type { MatchSnapshot, Move } from '../lib/play/protocol';
import { useMatchPresentation } from './useMatchPresentation';
import { useTableSound } from './useTableSound';
import { PlayResetMenu } from './PlayResetMenu';
import { PlayTable } from './PlayTable';
import { ReactiveRoom } from './ReactiveRoom';
import { campaignPulls, packRarityLabel } from '../lib/play/campaignPack';
import { CampaignRewardArt } from './CampaignRewardArt';
import { latestPack, needsActBriefing } from '../lib/play/campaignPresentation';
import { CampaignArrival, CampaignRecap, CampaignRooms } from './CampaignMoments';
import { CampaignPack } from './CampaignPack';
import { CampaignUpgradeDialog } from './CampaignDeckReview';
import { CampaignHub, CampaignHubTools, CampaignTimeline } from './CampaignHub';
import { CampaignWorkbench } from './CampaignWorkbench';
import { aftermathBeats } from '../lib/play/campaignScenes';
import { CampaignInvitation, CampaignRivalFarewell, CampaignRivalSeat, CampaignScene } from './CampaignStory';
import { CampaignCrewPick } from './CampaignCrewPick';
import { useRivalDialogue } from './useRivalDialogue';
import './campaign.css';
import './campaign-moments.css';

type CardSelection = { slug: string; printingId?: string };
type SavedRun = Pick<CampaignRun, 'id' | 'revision'>;
type CampaignSurface = 'hub' | 'workbench' | 'new-cards' | 'pack' | 'scene';

function hasSeenIntro(key: string) {
  try { return localStorage.getItem(key) === 'seen'; } catch { return false; }
}

export function CampaignMode({ scope, exit, openInBuilder }: { scope: string; exit: () => void; openInBuilder: (deck: Deck) => void }) {
  const introKey = `cptv.campaign.lastCallIntro:${scope}`;
  const dialogueKey = `cptv.campaign.rivalDialogue:${scope}`;
  const [introSeen, setIntroSeen] = useState(() => hasSeenIntro(introKey));
  const [dialogue, setDialogue] = useState(() => {
    try { return localStorage.getItem(dialogueKey) !== 'off'; } catch { return true; }
  });
  const [opening, setOpening] = useState<{ matchId: string; retry: boolean }>();
  const focusStarter = useRef(false);
  const focusBriefing = useRef(false);
  const [crewArrival, setCrewArrival] = useState(false);
  const [run, setRun] = useState<CampaignRun>();
  const [profile, setProfile] = useState<CampaignProfile>();
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [showTable, setShowTable] = useState(false);
  const [busy, setBusy] = useState(true);
  const actionLock = useRef(false);
  const recoveryVersion = useRef(0);
  const workerFailed = useRef(false);
  const [error, setError] = useState<string>();
  const [newRunFrom, setNewRunFrom] = useState<SavedRun>();
  const [resetTarget, setResetTarget] = useState<SavedRun>();
  const [resetError, setResetError] = useState<string>();
  const [concede, setConcede] = useState(false);
  const [replace, setReplace] = useState<StarterKey>();
  const [startingCrew, setStartingCrew] = useState<StarterKey>();
  const [undo, setUndo] = useState<SavedRun & { deck: Deck }>();
  const [surface, setSurface] = useState<CampaignSurface>('hub');
  const [inspected, setInspected] = useState<CardSelection>();
  const [reviewed, setReviewed] = useState<CardSelection & { outgoing?: string }>();
  const hub = useRef<HTMLDivElement>(null);
  const inspection = useRef<HTMLDialogElement>(null);
  const worker = useRef<Worker>(null);
  const serial = useRef(0);
  const requests = useRef(new Map<number, { resolve: (data: CampaignWorkerResponse) => void; reject: (error: Error) => void }>());
  const presentation = useMatchPresentation(snapshot);
  const sound = useTableSound();
  const encounter = run && ENCOUNTERS[run.encounter];
  const quote = useRivalDialogue(encounter?.id, snapshot, opening, presentation.playing, presentation.playback?.beat);

  function proceedToStarters() {
    focusStarter.current = true;
    setCrewArrival(true);
    setIntroSeen(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
    try { localStorage.setItem(introKey, 'seen'); } catch { /* Optional preference. */ }
  }

  function toggleDialogue() {
    setDialogue(!dialogue);
    try { localStorage.setItem(dialogueKey, dialogue ? 'off' : 'on'); } catch { /* Optional preference. */ }
  }

  const send = useCallback((action: { type: 'start'; revision: number } | { type: 'resume' } | { type: 'move'; matchId: string; stateID: number; move: Move }) =>
    new Promise<CampaignWorkerResponse>((resolve, reject) => {
      if (!worker.current || workerFailed.current) return reject(new Error('Campaign engine stopped. Reload the page to restore your saved match.'));
      const id = ++serial.current;
      requests.current.set(id, { resolve, reject });
      worker.current.postMessage({ id, scope, action });
    }), [scope]);

  useEffect(() => {
    const dialog = inspection.current;
    if (!dialog) return;
    if (inspected && !dialog.open) dialog.showModal();
    if (!inspected && dialog.open) dialog.close();
  }, [inspected]);

  useEffect(() => {
    const current = new Worker(new URL('../lib/play/campaign.worker.ts', import.meta.url), { type: 'module' });
    let active = true;
    workerFailed.current = false;
    const pending = requests.current;
    worker.current = current;
    const receive = ({ data }: MessageEvent<CampaignWorkerResponse>) => {
      const pending = requests.current.get(data.id);
      if (!pending) return;
      requests.current.delete(data.id);
      if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data);
    };
    current.addEventListener('message', receive);
    const failed = () => { workerFailed.current = true; current.terminate(); setError('The campaign engine stopped. Reload the page to restore the saved match.'); for (const request of pending.values()) request.reject(new Error('Campaign engine stopped. Reload the page to restore your saved match.')); pending.clear(); };
    current.addEventListener('error', failed);
    void recover(true).catch(cause => { if (active) setError(String(cause)); }).finally(() => { if (active) setBusy(false); });
    async function recover(reopenTable: boolean) {
      const version = ++recoveryVersion.current;
      const value = await readCampaign(scope);
      if (!active || actionLock.current || version !== recoveryVersion.current) return;
      setRun(value.run); setProfile(value.profile);
      if (value.run?.phase === 'inMatch') {
        const resumed = await send({ type: 'resume' });
        if (active && !actionLock.current && version === recoveryVersion.current) { setSnapshot(resumed.snapshot); if (reopenTable) setShowTable(true); }
      } else {
        setSnapshot(previous => previous?.matchId === value.run?.match?.summary.matchId ? previous : undefined);
        if (reopenTable && value.run && pendingCampaignPack(value.run)) {
          setSurface(value.run.aftermath && !value.run.aftermath.sceneSeen ? 'scene' : 'pack');
        }
        if (!value.run) { setShowTable(false); setSurface('hub'); setNewRunFrom(undefined); setIntroSeen(hasSeenIntro(introKey)); }
      }
    }
    const focus = () => { if (!actionLock.current) void recover(false).catch(() => {}); };
    window.addEventListener('focus', focus);
    return () => { active = false; window.removeEventListener('focus', focus); current.removeEventListener('message', receive); current.removeEventListener('error', failed); current.terminate(); worker.current = null;
      for (const request of pending.values()) request.reject(new Error('Campaign closed.')); pending.clear(); };
  }, [scope, send, introKey]);

  async function apply<T>(task: () => Promise<T>, update: (value: T) => void) {
    if (busy || actionLock.current) return false;
    actionLock.current = true;
    recoveryVersion.current++;
    setBusy(true); setError(undefined);
    try {
      update(await task());
      return true;
    } catch (cause) {
      setError(workerFailed.current ? 'The campaign engine stopped. Reload the page to restore your saved match.' : cause instanceof Error ? cause.message : 'Could not save your campaign.');
      return false;
    }
    finally { actionLock.current = false; setBusy(false); }
  }

  function replayIntroduction() {
    setCrewArrival(false);
    setIntroSeen(false);
    if (!run) {
      try { localStorage.removeItem(introKey); } catch { /* Optional preference. */ }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => hub.current?.querySelector<HTMLElement>('#campaign-invitation-title')?.focus({ preventScroll: true }));
  }

  function backToCampaign() {
    setNewRunFrom(undefined);
    requestAnimationFrame(() => hub.current?.focus({ preventScroll: true }));
  }

  function openNewCampaign() {
    if (!run) return;
    setNewRunFrom({ id: run.id, revision: run.revision });
    replayIntroduction();
  }

  function openReset() {
    if (!run || busy) return;
    setResetError(undefined);
    setResetTarget({ id: run.id, revision: run.revision });
  }

  async function reset() {
    if (!resetTarget || busy || actionLock.current) return;
    actionLock.current = true;
    recoveryVersion.current++;
    setBusy(true); setResetError(undefined);
    try {
      const cleared = await resetCampaign(scope, resetTarget);
      try { localStorage.removeItem(introKey); } catch { /* Optional preference. */ }
      presentation.playback?.skip();
      setRun(undefined); setProfile(cleared); setSnapshot(undefined); setShowTable(false); setOpening(undefined);
      setNewRunFrom(undefined); setResetTarget(undefined); setReplace(undefined); setUndo(undefined);
      setInspected(undefined); setReviewed(undefined); setSurface('hub'); setError(undefined); setIntroSeen(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
      requestAnimationFrame(() => hub.current?.focus({ preventScroll: true }));
    } catch (cause) {
      setResetError(cause instanceof Error ? cause.message : 'The campaign couldn’t be reset. Try again.');
    } finally {
      actionLock.current = false; setBusy(false);
    }
  }

  function create(starter: StarterKey, abandon = false) {
    if (run && run.phase !== 'completed' && !abandon) { setReplace(starter); return; }
    void apply(async () => {
      setStartingCrew(starter);
      try { return await startCampaign(scope, starter, newRunFrom); }
      finally { setStartingCrew(undefined); }
    }, value => {
      focusBriefing.current = true;
      setRun(value.run); setProfile(value.profile); setNewRunFrom(undefined); setShowTable(false); setSnapshot(undefined); setOpening(undefined); setUndo(undefined); setSurface('hub'); setReviewed(undefined);
    });
  }

  function launch() {
    if (!run) return;
    void apply(() => send({ type: 'start', revision: run.revision }), value => {
      setRun(value.run); setProfile(value.profile); setSnapshot(value.snapshot); setShowTable(true);
      if (value.snapshot) setOpening({ matchId: value.snapshot.matchId, retry: run.attempts > 0 });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  function move(move: Move) {
    if (!run || !snapshot || presentation.playing) return;
    void apply(() => send({ type: 'move', matchId: snapshot.matchId, stateID: snapshot.view.stateID, move }), value => {
      setRun(value.run); setProfile(value.profile); setSnapshot(value.snapshot);
    });
  }

  function edit(deck: Deck, saved?: () => void) {
    if (!run) return;
    void apply(() => saveCampaignDeck(scope, run.revision, deck), value => {
      setUndo({ id: run.id, deck: run.deck, revision: value.run.revision });
      setRun(value.run); saved?.(); sound.cue('reward-lock');
    });
  }

  function quantity(slug: string, amount: number) {
    if (!run) return;
    const have = run.deck.cards[slug] ?? 0;
    if (have + amount < 0 || have + amount > (run.inventory[slug] ?? 0) || have + amount > COPY_MAX) return;
    if (amount > 0 && totalCopies(run.deck.cards) >= MAIN_MAX) return;
    const cards = { ...run.deck.cards, [slug]: have + amount };
    if (!cards[slug]) delete cards[slug];
    edit({ ...run.deck, cards });
  }


  function takeDeckToBuilder() {
    if (!run || run.phase !== 'completed') return;
    openInBuilder(run.deck);
  }

  function reloadSavedState() {
    if (workerFailed.current) { window.location.reload(); return; }
    void apply(async () => {
      const value = await readCampaign(scope);
      const resumed = value.run?.phase === 'inMatch' ? await send({ type: 'resume' }) : undefined;
      return { ...value, snapshot: resumed?.snapshot };
    }, value => {
      setRun(value.run); setProfile(value.profile); setNewRunFrom(undefined); setSnapshot(value.snapshot); setShowTable(!!value.snapshot); setUndo(undefined);
      if (value.run && pendingCampaignPack(value.run)) changeSurface(value.run.aftermath && !value.run.aftermath.sceneSeen ? 'scene' : 'pack');
    });
  }

  function changeSurface(next: CampaignSurface) {
    focusBriefing.current = true;
    setSurface(next);
    setReviewed(undefined);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function leaveTable(next: CampaignSurface) {
    presentation.playback?.skip();
    setShowTable(false);
    changeSurface(next);
  }

  function resume() {
    void apply(() => send({ type: 'resume' }), value => {
      setRun(value.run); setProfile(value.profile); setSnapshot(value.snapshot); setShowTable(!!value.snapshot);
    });
  }

  function continueScene(current: CampaignRun, skip = false) {
    void apply(() => advanceCampaignScene(scope, current, skip), value => {
      setRun(value.run);
      if (value.run.aftermath?.sceneSeen) changeSurface('pack');
    });
  }

  function focusTitle(node: HTMLHeadingElement | null) {
    if (node && focusBriefing.current) {
      focusBriefing.current = false;
      window.scrollTo({ top: 0, behavior: 'instant' });
      node.focus({ preventScroll: true });
    }
  }

  const choosingStarter = !run || !!newRunFrom;
  const showInvitation = !!profile && choosingStarter && !introSeen;
  const actPending = run ? needsActBriefing(run) : false;
  const issues = run ? campaignDeckIssues(run, run.deck) : [];
  const iconicPrintings = new Map<string, Printing>();
  for (const [index, reward] of Object.entries(run?.rewards ?? {})) {
    // A sealed reward can exist while the match is still in progress.
    if (Number(index) >= (run?.encounter ?? 0)) continue;
    for (const { slug, printing } of campaignPulls(reward)) {
      if (printing?.rarity.startsWith('Iconic ')) iconicPrintings.set(slug, printing);
    }
  }
  if (run?.latestRetry) {
    for (const { slug, printing } of campaignPulls(run.latestRetry)) {
      if (printing?.rarity.startsWith('Iconic ')) iconicPrintings.set(slug, printing);
    }
  }
  const inspectCard = (slug: string, printingId?: string) => setInspected({ slug, printingId });
  const reviewCard = (slug: string, printingId = iconicPrintings.get(slug)?.id, outgoing?: string) => setReviewed({ slug, printingId, outgoing });
  const inspectedCard = inspected && BY_SLUG.get(inspected.slug);
  const inspectedPrinting = PRINTING_INDEX.get(inspected?.printingId ?? '')?.printing;
  const tableOpen = showTable && !!snapshot && snapshot.matchId === run?.match?.summary.matchId && !newRunFrom;
  const editable = run && !actPending && ['preparing', 'upgrading'].includes(run.phase);
  const workbench = editable && (surface === 'workbench' || surface === 'new-cards');
  const earnedPack = run && pendingCampaignPack(run);
  const scenePending = !!earnedPack && !!run?.aftermath && !run.aftermath.sceneSeen;
  const aftermathSurface = scenePending ? 'scene' : 'pack';
  const showAftermath = !!earnedPack && (surface === 'scene' || surface === 'pack');
  const beats = run && showAftermath && scenePending ? aftermathBeats(run) : [];
  const finale = run?.phase === 'claimingFinish' || run?.phase === 'completed';
  const tools = run && profile && !choosingStarter && !tableOpen ? <CampaignHubTools run={run} profile={profile} busy={busy}
    soundEnabled={sound.enabled} toggleSound={sound.toggle} newRun={openNewCampaign} reset={openReset} exit={exit}
    equipRoom={room => void apply(() => equipEnvironment(scope, room), value => { setProfile(value.profile); sound.cue('reward-lock'); })}
    openInBuilder={openInBuilder} /> : null;

  return <section className="play-mode campaign-mode" data-onboarding={choosingStarter ? (showInvitation ? 'invitation' : 'crews') : undefined}
    data-campaign-board={!choosingStarter && !tableOpen || undefined} data-environment={profile?.equipped ?? 'default'}
    onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
    {tableOpen && <ReactiveRoom />}
    {tableOpen && snapshot ? <PlayTable key={snapshot.matchId} scope={`${scope}:campaign`} snapshot={presentation.displayed ?? snapshot} names={snapshot.names}
      playback={presentation.playback} feedback={presentation.feedback} reduced={presentation.reduced} cue={sound.cue}
      campaign={run && encounter && {
        title: encounter.title,
        rival: <CampaignRivalSeat encounter={encounter.id} starter={run.starter} quote={quote} dialogue={dialogue} toggle={toggleDialogue} />,
        farewell: dialogue && quote && ['playerWon', 'rivalWon', 'draw'].includes(quote.moment)
          ? <CampaignRivalFarewell encounter={encounter.id} quote={quote} /> : undefined,
      }}
      busy={busy || presentation.playing} error={error} send={move} rematch={() => leaveTable(earnedPack ? aftermathSurface : run?.phase === 'preparing' ? 'workbench' : 'hub')}
      edit={() => leaveTable('workbench')} resultContinueLabel={scenePending ? 'Continue story' : earnedPack ? 'Open your pack'
        : run?.phase === 'claimingFinish' ? 'Open Champion’s Cache' : 'Review deck and retry'}
      controls={<><button className="btn quiet" onClick={() => leaveTable('hub')}>Campaign board</button>
        {!snapshot.view.gameEnded && <button type="button" className="btn danger-ghost" disabled={busy || presentation.playing}
          onClick={() => setConcede(true)}>Concede</button>}
        {run && <PlayResetMenu mode="Campaign" disabled={busy} onReset={openReset} />}
        {error && <button className="btn" onClick={reloadSavedState}>{workerFailed.current ? 'Reload page' : 'Reload saved match'}</button>}
        <button className="btn quiet" onClick={exit}>Free Play</button>
        <button className="btn quiet" onClick={sound.toggle}>Sound {sound.enabled ? 'On' : 'Off'}</button>
        <label className="play-sound-level">FX <input type="range" aria-label="Game effects volume" min="0" max="1" step=".05" value={sound.volume} onChange={e => sound.changeVolume(Number(e.target.value))} /></label></>} />
    : <div className={choosingStarter ? "campaign-hub campaign-hub--onboarding" : "campaign-hub"} ref={hub} tabIndex={-1}>
      {error && <div className="play-error" role="alert">{error} <button className="btn quiet" onClick={reloadSavedState}>{workerFailed.current ? 'Reload page' : 'Reload campaign'}</button></div>}
      {busy && !profile && <p role="status">Opening the table…</p>}
      {profile && choosingStarter && (showInvitation
        ? <CampaignInvitation scope={scope} proceed={proceedToStarters} busy={busy}
          onBack={newRunFrom ? backToCampaign : undefined} onReset={run ? openReset : undefined} />
        : <CampaignCrewPick arriving={crewArrival} busy={busy} current={run?.starter} starting={startingCrew}
          readIntroduction={replayIntroduction} back={newRunFrom ? backToCampaign : undefined} reset={run ? openReset : undefined}
          inspect={inspectCard} start={create} titleRef={node => {
            if (node && focusStarter.current) { focusStarter.current = false; node.focus({ preventScroll: true }); }
          }} />)}
      {run && profile && !choosingStarter && (workbench
        ? <CampaignWorkbench run={run} titleRef={focusTitle} busy={busy} error={error} issues={issues} canUndo={undo?.id === run.id && undo.revision === run.revision}
          fromPack={surface === 'new-cards'} printings={iconicPrintings} inspect={inspectCard} review={reviewCard} quantity={quantity}
          undo={() => { if (undo?.id === run.id && undo.revision === run.revision) edit(undo.deck); }} restore={() => edit(structuredClone(run.lastLegal))}
          back={() => changeSurface('hub')} />
        : showAftermath && scenePending && run.aftermath && encounter
          ? <CampaignScene encounter={encounter.id} beats={beats} index={run.aftermath.beat} outcome={run.aftermath.outcome}
            busy={busy} tools={tools} next={() => continueScene(run)} skip={() => continueScene(run, true)} />
        : showAftermath && earnedPack
          ? <CampaignPack key={earnedPack.id} run={run} reward={earnedPack} titleRef={focusTitle} tools={tools} busy={busy} inspect={inspectCard}
            back={() => changeSurface('hub')}
            finish={() => void apply(() => finishCampaignPack(scope, run), value => {
              setRun(value.run); sound.cue('reward-lock');
              changeSurface(value.run.phase === 'claimingFinish' ? 'hub' : 'new-cards');
            })}
            revealTo={count => apply(() => revealCampaignPack(scope, run.revision, count), value => {
              setRun(value.run); sound.cue((run.revealed ?? 0) === 0 ? 'pack-open' : 'pack-reveal');
            })}
            choose={slug => void apply(() => chooseReward(scope, run.revision, slug), value => {
              setRun(value.run); changeSurface('hub');
              sound.cue(needsActBriefing(value.run) ? 'act-arrival' : 'reward-lock');
            })} />
        : actPending || finale
          ? <section className="campaign-board-moment" aria-labelledby="campaign-moment-title">
            <header className="campaign-board-header">
              <div><p className="campaign-invitation-eyebrow">The Afterlife</p>
                <h1 id="campaign-moment-title" tabIndex={-1} ref={focusTitle}>{actPending ? 'Next act' : 'Campaign cleared'}</h1></div>
              {tools}
            </header>
            <CampaignTimeline run={run} />
            {actPending && <CampaignArrival run={run} busy={busy} continueToDeck={() => void apply(() => acknowledgeCampaignAct(scope, run.revision), value => {
              setRun(value.run); changeSurface('new-cards');
            })} />}
            {finale && <CampaignRecap run={run} inspect={inspectCard} />}
            {run.phase === 'claimingFinish' && <CampaignRooms action="claim" allOwned={profile.environments.length === ENVIRONMENTS.length}
              rooms={ENVIRONMENTS.filter(item => !profile.environments.includes(item.id) || profile.environments.length === ENVIRONMENTS.length).map(item => item.id)}
              busy={busy} onSelect={id => void apply(() => claimEnvironment(scope, run.revision, id), value => {
                setRun(value.run); setProfile(value.profile); sound.cue('reward-lock'); hub.current?.focus({ preventScroll: true });
              })} />}
            {run.phase === 'completed' && <section className="panel hot campaign-finale"><h2>Keep the deck. Keep the room.</h2>
              <button type="button" className="btn" onClick={takeDeckToBuilder}>Open deck as draft</button>
            </section>}
          </section>
          : <CampaignHub run={run} titleRef={focusTitle} tools={tools} issues={issues} busy={busy} printings={iconicPrintings}
            inspect={inspectCard} tune={() => changeSurface('workbench')} reviewNew={editable && latestPack(run).length ? () => changeSurface('new-cards') : undefined}
            primary={earnedPack ? () => changeSurface(aftermathSurface) : run.phase === 'inMatch' ? resume : launch} />)}
    </div>}
    {reviewed && run && workbench && <CampaignUpgradeDialog key={reviewed.slug} run={run} slug={reviewed.slug} printingId={reviewed.printingId}
      initialOutgoing={reviewed.outgoing} busy={busy} error={error} close={() => setReviewed(undefined)} commit={deck => edit(deck, () => setReviewed(undefined))} />}
    <dialog ref={inspection} className="campaign-inspection" onClose={() => setInspected(undefined)} aria-label={inspectedCard?.display ?? 'Card details'}>
      <button className="btn quiet" onClick={() => setInspected(undefined)}>Close card</button>
      {inspected && inspectedCard && <div><CampaignRewardArt pull={{ slug: inspected.slug, printing: inspectedPrinting }} alt={inspectedCard.display} exact={choosingStarter} /><section>
        {inspectedPrinting && <p className="campaign-variant-label">{packRarityLabel(inspectedPrinting.rarity)} · No. {inspectedPrinting.num}</p>}
        <h2>{inspectedCard.display}</h2><p>{inspectedCard.text}</p>
        {!choosingStarter && !!run?.inventory[inspected.slug] && <p>Earned {run.inventory[inspected.slug]} · In deck {run.deck.cards[inspected.slug] ?? (run.deck.legends.includes(inspected.slug) ? 1 : 0)}</p>}
      </section></div>}
    </dialog>
    <ConfirmDialog open={concede} title="Concede this match?" confirmLabel="Concede match" busy={busy}
      onCancel={() => setConcede(false)} onConfirm={() => { setConcede(false); move({ move: 'concede' }); }}>
      <p>The rival wins. Conceding ends the attempt without a pack. You can challenge this rival again.</p>
    </ConfirmDialog>
    <ConfirmDialog open={!!resetTarget} title="Reset campaign?" confirmLabel="Reset campaign" busy={busy}
      onCancel={() => setResetTarget(undefined)} onConfirm={() => void reset()}>
      <p>This permanently clears your current run, saved match, earned cards, past runs, and campaign unlocks for this Vault in this browser.</p>
      <p>You’ll return to the introduction. Your collection, saved decks, Free Play matches, and Circuit progress are kept.</p>
      {resetError && <p className="play-error" role="alert">{resetError}</p>}
    </ConfirmDialog>
    <ConfirmDialog open={!!replace} title={replace ? `Start with ${STARTERS.find(starter => starter.key === replace)?.name}?` : 'Start a new campaign?'} confirmLabel="Abandon and start new run" onCancel={() => setReplace(undefined)} onConfirm={() => { const starter = replace; setReplace(undefined); if (starter) create(starter, true); }}><p>Your current run and its cards will be replaced. Earned environments stay yours.</p></ConfirmDialog>
  </section>;
}
