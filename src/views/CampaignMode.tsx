import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ui';
import { BY_SLUG, PRINTING_INDEX, type Printing } from '../lib/data';
import { STARTERS, type StarterKey } from '../lib/starters';
import type { Deck } from '../lib/store';
import { totalCopies } from '../lib/deckDraft';
import { campaignCardAddReason, campaignCrew } from '../lib/play/campaignDeckRules';
import { ENCOUNTERS, ENVIRONMENTS, campaignDeckIssues, pendingCampaignPack, type CampaignProfile, type CampaignRun } from '../lib/play/campaign';
import { readCampaign, startCampaign, resetCampaign, chooseReward, saveCampaignDeck, claimEnvironment, equipEnvironment, openCampaignPack, revealCampaignSlot, showCampaignBonus, advanceCampaignScene, finishCampaignPack, acknowledgeCampaignAct, acknowledgeCampaignResult } from '../lib/play/campaignStorage';
import type { CampaignWorkerResponse } from '../lib/play/campaign.worker';
import type { MatchSnapshot, Move } from '../lib/play/protocol';
import { useMatchPresentation } from './useMatchPresentation';
import { useTableSound } from './useTableSound';
import { PlayTable } from './PlayTable';
import { ReactiveRoom } from './ReactiveRoom';
import { campaignPulls, packRarityLabel } from '../lib/play/campaignPack';
import { CampaignRewardArt } from './CampaignRewardArt';
import { latestCampaignReward, needsActBriefing } from '../lib/play/campaignPresentation';
import { CampaignArrival, CampaignRecap, CampaignRooms } from './CampaignMoments';
import { CampaignPack } from './CampaignPack';
import { CampaignUpgradeDialog } from './CampaignDeckReview';
import { CampaignHub, CampaignHubTools, CampaignTimeline } from './CampaignHub';
import { CampaignCrewEditor } from './CampaignCrewEditor';
import { CampaignWorkbench } from './CampaignWorkbench';
import { aftermathBeats } from '../lib/play/campaignScenes';
import { CampaignInvitation, CampaignScene } from './CampaignStory';
import { CampaignRivalSeat } from './CampaignRivalDossier';
import { campaignRivalIntel, knownRivalLegendSlugs } from '../lib/play/campaignRivalIntel';
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

export function CampaignMode({ scope, exit, openInBuilder, preparationOnly = false }: {
  scope: string; exit?: () => void; openInBuilder: (deck: Deck) => void; preparationOnly?: boolean;
}) {
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
  const packReviewKey = `cptv.campaign.reviewedPack:${scope}`;
  const [reviewedPack, setReviewedPack] = useState(() => {
    try { return localStorage.getItem(packReviewKey); } catch { return null; }
  });
  const [surface, setSurface] = useState<CampaignSurface>('hub');
  const [inspected, setInspected] = useState<CardSelection>();
  const [crewEdit, setCrewEdit] = useState<SavedRun & { slot?: number; incoming?: string }>();
  const [reviewed, setReviewed] = useState<CardSelection & SavedRun & { swap?: boolean }>();
  const hub = useRef<HTMLDivElement>(null);
  const inspection = useRef<HTMLDialogElement>(null);
  const worker = useRef<Worker>(null);
  const serial = useRef(0);
  const requests = useRef(new Map<number, { resolve: (data: CampaignWorkerResponse) => void; reject: (error: Error) => void }>());
  const presentation = useMatchPresentation(snapshot);
  const displayedMatch = presentation.displayed ?? snapshot;
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
      if (value.run?.phase === 'inMatch' || value.run?.resultPending) {
        const resumed = await send({ type: 'resume' });
        if (active && !actionLock.current && version === recoveryVersion.current) {
          setRun(resumed.run); setProfile(resumed.profile);
          if (resumed.run?.resultPending || resumed.run?.phase === 'inMatch') {
            setSnapshot(previous => !reopenTable && previous?.matchId === resumed.snapshot?.matchId
              && previous?.view.stateID === resumed.snapshot?.view.stateID ? previous : resumed.snapshot);
            if (reopenTable) setShowTable(true);
          } else {
            setSnapshot(undefined); setShowTable(false);
            if (resumed.run && pendingCampaignPack(resumed.run))
              setSurface(resumed.run.aftermath && !resumed.run.aftermath.sceneSeen ? 'scene' : 'pack');
          }
        }
      } else {
        // A different tab may have already continued from this result.
        setShowTable(false);
        setSnapshot(undefined);
        if (value.run && pendingCampaignPack(value.run)) {
          setSurface(previous => reopenTable || previous === 'scene' || previous === 'pack'
            ? value.run?.aftermath && !value.run.aftermath.sceneSeen ? 'scene' : 'pack'
            : previous);
        }
        if (!value.run) { setSurface('hub'); setNewRunFrom(undefined); setIntroSeen(hasSeenIntro(introKey)); }
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
      setNewRunFrom(undefined); setResetTarget(undefined); setReplace(undefined);
      setInspected(undefined); setReviewed(undefined); setCrewEdit(undefined); setSurface('hub'); setError(undefined); setIntroSeen(false);
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
      setRun(value.run); setProfile(value.profile); setNewRunFrom(undefined); setShowTable(false); setSnapshot(undefined); setOpening(undefined); setSurface('hub'); setReviewed(undefined); setCrewEdit(undefined);
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

  function edit(deck: Deck | 'undo' | 'restore', saved?: () => void, preview?: SavedRun) {
    if (!run) return;
    if (preview && (run.id !== preview.id || run.revision !== preview.revision)) {
      setError('The saved deck changed. Close and reopen the preview.');
      return;
    }
    return apply(() => saveCampaignDeck(scope, run, deck), value => {
      setRun(value.run); saved?.(); sound.cue('reward-lock');
    });
  }

  function quantity(slug: string, amount: number) {
    if (!run) return;
    const have = run.deck.cards[slug] ?? 0;
    const card = BY_SLUG.get(slug);
    if (have + amount < 0 || !card) return;
    if (amount > 0 && campaignCardAddReason(run, card, campaignCrew(run.deck.legends), totalCopies(run.deck.cards))) return;
    const cards = { ...run.deck.cards, [slug]: have + amount };
    if (!cards[slug]) delete cards[slug];
    return edit({ ...run.deck, cards });
  }


  function takeDeckToBuilder() {
    if (!run || run.phase !== 'completed') return;
    openInBuilder(run.deck);
  }

  function reloadSavedState() {
    if (workerFailed.current) { window.location.reload(); return; }
    void apply(async () => {
      const value = await readCampaign(scope);
      const resumed = value.run?.phase === 'inMatch' || value.run?.resultPending ? await send({ type: 'resume' }) : undefined;
      return { ...value, snapshot: resumed?.snapshot };
    }, value => {
      setRun(value.run); setProfile(value.profile); setNewRunFrom(undefined); setSnapshot(value.snapshot); setShowTable(!!value.snapshot);
      if (!value.snapshot && value.run && pendingCampaignPack(value.run)) changeSurface(value.run.aftermath && !value.run.aftermath.sceneSeen ? 'scene' : 'pack');
    });
  }

  function changeSurface(next: CampaignSurface) {
    focusBriefing.current = true;
    setSurface(next);
    setReviewed(undefined);
    setCrewEdit(undefined);
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

  function continueResult() {
    if (!run || !snapshot?.view.gameEnded) return;
    const next = earnedPack ? aftermathSurface : run.phase === 'preparing' ? 'workbench' : 'hub';
    if (!run.resultPending) { leaveTable(next); return; }
    void apply(() => acknowledgeCampaignResult(scope, run, snapshot.matchId), value => {
      setRun(value.run); setProfile(value.profile);
      leaveTable(next);
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
  const campaignPrintings = new Map<string, Printing>();
  function rememberPrinting(slug: string, printing?: Printing) {
    if (printing && (printing.rarity.startsWith('Iconic ') || !campaignPrintings.has(slug))) campaignPrintings.set(slug, printing);
  }
  for (const [index, reward] of Object.entries(run?.rewards ?? {})) {
    // A sealed reward can exist while the match is still in progress.
    if (Number(index) >= (run?.encounter ?? 0)) continue;
    for (const { slug, printing } of campaignPulls(reward)) rememberPrinting(slug, printing);
  }
  for (const [slug, id] of Object.entries(run?.retryPrintings ?? {})) rememberPrinting(slug, PRINTING_INDEX.get(id)?.printing);
  if (run?.latestRetry) {
    for (const { slug, printing } of campaignPulls(run.latestRetry)) rememberPrinting(slug, printing);
  }
  const inspectCard = (slug: string, printingId?: string) => setInspected({ slug, printingId });
  function reviewCard(slug: string, printingId = campaignPrintings.get(slug)?.id, swap?: boolean) {
    if (run) setReviewed({ id: run.id, revision: run.revision, slug, printingId, swap });
  }
  const latestReward = run && latestCampaignReward(run);
  const currentPack = run && latestReward && `${run.id}:${latestReward.id}`;
  function acknowledgePack() {
    if (!currentPack) return;
    setReviewedPack(currentPack);
    try { localStorage.setItem(packReviewKey, currentPack); } catch { /* Session only. */ }
  }
  const inspectedCard = inspected && BY_SLUG.get(inspected.slug);
  const inspectedPrinting = PRINTING_INDEX.get(inspected?.printingId ?? '')?.printing;
  const equippedSlot = run && inspected ? run.deck.legends.indexOf(inspected.slug) : -1;
  const tableOpen = !preparationOnly && showTable && !!snapshot && snapshot.matchId === run?.match?.summary.matchId && !newRunFrom;
  const resultOpen = tableOpen && !!snapshot?.view.gameEnded && !presentation.playing;
  const editable = run && !run.resultPending && !actPending && ['preparing', 'upgrading'].includes(run.phase);
  const workbench = editable && (surface === 'workbench' || surface === 'new-cards');
  const earnedPack = run && pendingCampaignPack(run);
  const scenePending = !!earnedPack && !!run?.aftermath && !run.aftermath.sceneSeen;
  const aftermathSurface = scenePending ? 'scene' : 'pack';
  const showAftermath = !!earnedPack && (surface === 'scene' || surface === 'pack');
  const beats = run && showAftermath && scenePending ? aftermathBeats(run) : [];
  const finale = run?.phase === 'claimingFinish' || run?.phase === 'completed';
  const continueLabel = scenePending ? 'Continue story' : earnedPack ? 'Open your pack'
    : run?.phase === 'claimingFinish' ? 'Open Champion’s Cache' : 'Review deck and retry';
  const stuckCard = snapshot?.report?.stuck.find(item => (item.card.cost ?? 0) >= 5)?.card.cardName;
  const resultNext = (run?.balanceVersion ?? 0) >= 3 && run?.aftermath?.outcome === 'loss' && encounter
    ? stuckCard ? `${stuckCard} stayed in your hand. Consider swapping a copy for a cheaper play before the rematch.`
      : campaignRivalIntel(encounter.id, run.starter).counterplay
    : scenePending ? 'Next: The aftermath and your reward pack.' : undefined;
  const tools = run && profile && !choosingStarter && !tableOpen ? <CampaignHubTools run={run} profile={profile} busy={busy}
    soundEnabled={sound.enabled} toggleSound={sound.toggle} newRun={openNewCampaign} reset={openReset} exit={exit}
    equipRoom={room => void apply(() => equipEnvironment(scope, room), value => { setProfile(value.profile); sound.cue('reward-lock'); })}
    openInBuilder={openInBuilder} /> : null;

  return <section className="play-mode campaign-mode" data-onboarding={choosingStarter ? (showInvitation ? 'invitation' : 'crews') : undefined}
    data-campaign-board={!choosingStarter && (!tableOpen || resultOpen) || undefined} data-environment={profile?.equipped ?? 'default'}
    onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
    {tableOpen && !resultOpen && <ReactiveRoom />}
    {tableOpen && snapshot && displayedMatch ? <PlayTable key={snapshot.matchId} scope={`${scope}:campaign`} snapshot={displayedMatch} names={snapshot.names}
      playback={presentation.playback} feedback={presentation.feedback} reduced={presentation.reduced} cue={sound.cue}
      campaign={run && encounter && {
        title: encounter.title,
        act: Math.floor(run.encounter / 3) + 1,
        rival: <CampaignRivalSeat encounter={encounter.id} starter={run.starter} quote={quote} dialogue={dialogue} toggle={toggleDialogue}
          legends={knownRivalLegendSlugs(displayedMatch).map(slug => ({ slug }))} inspect={inspectCard} />,
        encounter: encounter.id,
        dialogue,
        continueLabel,
        next: resultNext,
        reload: reloadSavedState,
      }}
      busy={busy || presentation.playing} error={error} send={move} rematch={continueResult}
      edit={() => leaveTable('workbench')}
      navigation={<button className="btn quiet" onClick={() => leaveTable('hub')}>Campaign board</button>}
      audio={<><button type="button" className="btn quiet" aria-pressed={sound.enabled} onClick={sound.toggle}>Game effects <b>{sound.enabled ? 'On' : 'Off'}</b></button>
        <label className="play-sound-level">FX volume <input type="range" aria-label="Game effects volume" min="0" max="1" step=".05" value={sound.volume} onChange={e => sound.changeVolume(Number(e.target.value))} /></label></>}
      controls={<>
        {exit && <button className="btn quiet" onClick={exit}>Free Play</button>}
        {error && <button className="btn quiet" onClick={reloadSavedState}>{workerFailed.current ? 'Reload page' : 'Reload saved match'}</button>}
        {!snapshot.view.gameEnded && <button type="button" className="btn danger-ghost" disabled={busy || presentation.playing}
          onClick={() => setConcede(true)}>Concede</button>}
        {run && <button type="button" className="btn danger-ghost" disabled={busy} onClick={openReset}>Reset campaign</button>}
      </>} />
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
        ? <CampaignWorkbench run={run} titleRef={focusTitle} busy={busy} error={error} issues={issues} canUndo={!!run.deckUndo}
          fromPack={surface === 'new-cards'} packNew={!!currentPack && currentPack !== reviewedPack} acknowledgePack={acknowledgePack}
          printings={campaignPrintings} inspect={inspectCard} review={reviewCard} quantity={quantity}
          manage={(slot, incoming) => setCrewEdit({ id: run.id, revision: run.revision, slot, incoming })}
          undo={() => edit('undo')} restore={saved => edit('restore', saved)} back={() => changeSurface('hub')} />
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
            tearSeal={() => apply(() => openCampaignPack(scope, run, earnedPack.id), value => {
              setRun(value.run); sound.cue('pack-open');
            })}
            showBonus={show => apply(() => showCampaignBonus(scope, run, earnedPack.id, show), value => setRun(value.run))}
            flipSlot={slot => apply(() => revealCampaignSlot(scope, run, earnedPack.id, slot), value => setRun(value.run))}
            revealSound={tier => sound.cue(tier === 'foil' ? 'pack-foil' : tier === 'rare' ? 'pack-rare' : 'pack-reveal')}
            choose={slug => void apply(() => chooseReward(scope, run, earnedPack.id, slug), value => {
              const actBriefing = needsActBriefing(value.run);
              setRun(value.run);
              changeSurface(actBriefing ? 'hub' : 'new-cards');
              sound.cue(actBriefing ? 'act-arrival' : 'reward-lock');
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
          : <CampaignHub run={run} titleRef={focusTitle} tools={tools} issues={issues} busy={busy} printings={campaignPrintings}
            inspect={inspectCard} tune={() => changeSurface('workbench')} reviewNew={editable && latestReward ? () => changeSurface('new-cards') : undefined}
            preparationOnly={preparationOnly} primary={run.resultPending || run.phase === 'inMatch' ? resume : earnedPack ? () => changeSurface(aftermathSurface) : launch} />)}
    </div>}
    {reviewed && run && workbench && <CampaignUpgradeDialog key={reviewed.slug} run={run} slug={reviewed.slug} printingId={reviewed.printingId} printings={campaignPrintings}
      swap={reviewed.swap} busy={busy} error={error} close={() => setReviewed(undefined)}
      commit={deck => edit(deck, () => setReviewed(undefined), reviewed)} />}
    {crewEdit && run && workbench && <CampaignCrewEditor run={run} printings={campaignPrintings}
      slot={crewEdit.slot} incoming={crewEdit.incoming} busy={busy} error={error} inspect={inspectCard}
      close={() => setCrewEdit(undefined)} commit={deck => edit(deck, () => setCrewEdit(undefined), crewEdit)} />}
    <dialog ref={inspection} className="campaign-inspection" onClose={() => setInspected(undefined)} aria-label={inspectedCard?.display ?? 'Card details'}>
      <button className="btn quiet" onClick={() => setInspected(undefined)}>Close card</button>
      {inspected && inspectedCard && <div><CampaignRewardArt pull={{ slug: inspected.slug, printing: inspectedPrinting }} alt={inspectedCard.display} exact={choosingStarter || !!inspectedPrinting} /><section>
        {inspectedPrinting && <p className="campaign-variant-label">{packRarityLabel(inspectedPrinting.rarity)} · No. {inspectedPrinting.num}</p>}
        <h2>{inspectedCard.display}</h2>
        {inspectedPrinting && <p className="campaign-card-facts">{inspectedCard.color} · {inspectedCard.type}{inspectedCard.type !== 'Legend' && inspectedCard.cost != null ? ` · Cost ${inspectedCard.cost}` : ''}{inspectedCard.ram != null ? ` · RAM ${inspectedCard.ram}` : ''}</p>}
        <p>{inspectedCard.text}</p>
        {workbench && run && !crewEdit && equippedSlot >= 0 && <button type="button" className="btn quiet" disabled={busy} onClick={() => {
          setInspected(undefined);
          setCrewEdit({ id: run.id, revision: run.revision, slot: equippedSlot });
        }}>Replace this Legend</button>}
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
