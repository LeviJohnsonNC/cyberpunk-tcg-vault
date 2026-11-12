import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, Masthead } from '../components/ui';
import { CardImg } from '../components/bits';
import { BY_SLUG, CARDS, PRINTING_INDEX, type Printing } from '../lib/data';
import { STARTERS, type StarterKey } from '../lib/starters';
import type { Deck } from '../lib/store';
import { totalCopies } from '../lib/deckDraft';
import { ENCOUNTERS, ENVIRONMENTS, campaignDeckIssues, encounterSkill, type CampaignProfile, type CampaignRun } from '../lib/play/campaign';
import { readCampaign, startCampaign, chooseReward, saveCampaignDeck, claimEnvironment, equipEnvironment, campaignStatus, revealCampaignPack, acknowledgeCampaignAct } from '../lib/play/campaignStorage';
import type { CampaignWorkerResponse } from '../lib/play/campaign.worker';
import type { MatchSnapshot, Move } from '../lib/play/protocol';
import { useMatchPresentation } from './useMatchPresentation';
import { useTableSound } from './useTableSound';
import { PlayTable } from './PlayTable';
import { ReactiveRoom } from './ReactiveRoom';
import { campaignPulls, packRarityLabel } from '../lib/play/campaignPack';
import { CampaignRewardArt } from './CampaignRewardArt';
import { needsActBriefing } from '../lib/play/campaignPresentation';
import { CampaignArrival, CampaignPack, CampaignRecap, CampaignRooms } from './CampaignMoments';
import { CampaignNewCards, CampaignDeckNumbers, CampaignUpgradeDialog } from './CampaignDeckReview';
import { CampaignInvitation, CampaignRivalBrief, CampaignRivalFarewell, CampaignRivalSeat, CampaignStoryJournal } from './CampaignStory';
import { useRivalDialogue } from './useRivalDialogue';
import './campaign.css';
import './campaign-moments.css';

type CardSelection = { slug: string; printingId?: string };

export function CampaignMode({ scope, exit, openInBuilder }: { scope: string; exit: () => void; openInBuilder: (deck: Deck) => void }) {
  const introKey = `cptv.campaign.lastCallIntro:${scope}`;
  const dialogueKey = `cptv.campaign.rivalDialogue:${scope}`;
  const [introSeen, setIntroSeen] = useState(() => {
    try { return localStorage.getItem(introKey) === 'seen'; } catch { return false; }
  });
  const [dialogue, setDialogue] = useState(() => {
    try { return localStorage.getItem(dialogueKey) !== 'off'; } catch { return true; }
  });
  const [opening, setOpening] = useState<{ matchId: string; retry: boolean }>();
  const focusStarter = useRef(false);
  const [run, setRun] = useState<CampaignRun>();
  const [profile, setProfile] = useState<CampaignProfile>();
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [showTable, setShowTable] = useState(false);
  const [busy, setBusy] = useState(true);
  const actionLock = useRef(false);
  const recoveryVersion = useRef(0);
  const workerFailed = useRef(false);
  const [error, setError] = useState<string>();
  const [newRunFrom, setNewRunFrom] = useState<Pick<CampaignRun, 'id' | 'revision'>>();
  const [replace, setReplace] = useState<StarterKey>();
  const [undo, setUndo] = useState<Deck>();
  const [editFeedback, setEditFeedback] = useState('');
  const [inspected, setInspected] = useState<CardSelection>();
  const [reviewed, setReviewed] = useState<CardSelection>();
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
    setIntroSeen(true);
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
    void recover().catch(cause => { if (active) setError(String(cause)); }).finally(() => { if (active) setBusy(false); });
    async function recover() {
      const version = ++recoveryVersion.current;
      const value = await readCampaign(scope);
      if (!active || actionLock.current || version !== recoveryVersion.current) return;
      setRun(value.run); setProfile(value.profile);
      if (value.run?.phase === 'inMatch') {
        const resumed = await send({ type: 'resume' });
        if (active && !actionLock.current && version === recoveryVersion.current) { setSnapshot(resumed.snapshot); setShowTable(true); }
      } else if (value.run?.match) {
        // A second tab may have finished the match while this one was out of focus.
        setShowTable(false);
      }
    }
    const focus = () => { if (!actionLock.current) void recover().catch(() => {}); };
    window.addEventListener('focus', focus);
    return () => { active = false; window.removeEventListener('focus', focus); current.removeEventListener('message', receive); current.removeEventListener('error', failed); current.terminate(); worker.current = null;
      for (const request of pending.values()) request.reject(new Error('Campaign closed.')); pending.clear(); };
  }, [scope, send]);

  async function apply<T>(task: () => Promise<T>, update: (value: T) => void) {
    if (busy || actionLock.current) return;
    actionLock.current = true;
    recoveryVersion.current++;
    setBusy(true); setError(undefined);
    try { update(await task()); } catch (cause) { setError(workerFailed.current ? 'The campaign engine stopped. Reload the page to restore the saved match.' : cause instanceof Error ? cause.message : 'Could not save your campaign.'); }
    finally { actionLock.current = false; setBusy(false); }
  }

  function openNewCampaign() {
    if (!run) return;
    setNewRunFrom({ id: run.id, revision: run.revision });
    setIntroSeen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function create(starter: StarterKey, abandon = false) {
    if (run && run.phase !== 'completed' && !abandon) { setReplace(starter); return; }
    void apply(() => startCampaign(scope, starter, newRunFrom), value => {
      setRun(value.run); setProfile(value.profile); setNewRunFrom(undefined); setShowTable(false); setSnapshot(undefined); setOpening(undefined); setUndo(undefined); setEditFeedback(''); setReviewed(undefined);
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
    const before = structuredClone(run.deck);
    void apply(() => saveCampaignDeck(scope, run.revision, deck), value => { setUndo(before); setRun(value.run); setEditFeedback(`Deck saved · ${totalCopies(value.run.deck.cards)} main cards · ${value.run.deck.legends.length} Legends`); saved?.(); sound.cue('reward-lock'); });
  }

  function quantity(slug: string, amount: number) {
    if (!run) return;
    const have = run.deck.cards[slug] ?? 0;
    if (have + amount < 0 || have + amount > (run.inventory[slug] ?? 0) || have + amount > 3) return;
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
    }, value => { setRun(value.run); setProfile(value.profile); setNewRunFrom(undefined); setSnapshot(value.snapshot); setShowTable(!!value.snapshot); });
  }

  const choosingStarter = !run || !!newRunFrom;
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
  const inspectCard = (slug: string, printingId?: string) => setInspected({ slug, printingId });
  const reviewCard = (slug: string, printingId = iconicPrintings.get(slug)?.id) => setReviewed({ slug, printingId });
  const inspectedCard = inspected && BY_SLUG.get(inspected.slug);
  const inspectedPrinting = PRINTING_INDEX.get(inspected?.printingId ?? '')?.printing;
  const starterColours = STARTERS.find(starter => starter.key === run?.starter)?.colors;
  const alternateLegends = [...iconicPrintings].filter(([slug]) => BY_SLUG.get(slug)?.type === 'Legend');
  const inventory = run && CARDS.filter(card => (run.inventory[card.slug] ?? 0) > 0 && card.type !== 'Legend')
    .sort((a, b) => (run.deck.cards[b.slug] ?? 0) - (run.deck.cards[a.slug] ?? 0) || (a.cost ?? 0) - (b.cost ?? 0) || a.display.localeCompare(b.display));

  return <section className="play-mode campaign-mode" data-environment={profile?.equipped ?? 'default'} onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
    <ReactiveRoom />
    {showTable && snapshot && !newRunFrom ? <PlayTable key={snapshot.matchId} scope={`${scope}:campaign`} snapshot={presentation.displayed ?? snapshot} names={snapshot.names}
      playback={presentation.playback} feedback={presentation.feedback} reduced={presentation.reduced} cue={sound.cue}
      campaign={run && encounter && {
        title: encounter.title,
        rival: <CampaignRivalSeat encounter={encounter.id} starter={run.starter} quote={quote} dialogue={dialogue} toggle={toggleDialogue} />,
        farewell: dialogue && quote && ['playerWon', 'rivalWon', 'draw'].includes(quote.moment)
          ? <CampaignRivalFarewell encounter={encounter.id} quote={quote} /> : undefined,
      }}
      busy={busy || presentation.playing} error={error} send={move} rematch={() => { presentation.playback?.skip(); setShowTable(false); window.scrollTo({ top: 0, behavior: 'instant' }); }}
      edit={() => setShowTable(false)} resultContinueLabel={snapshot.view.winnerId === 'player' ? run?.phase === 'claimingFinish' ? 'Open Champion’s Cache' : 'Open your pack' : 'Review deck and retry'}
      controls={<><button className="btn quiet" onClick={() => { presentation.playback?.skip(); setShowTable(false); window.scrollTo({ top: 0, behavior: 'instant' }); }}>Campaign board</button>
        {error && <button className="btn" onClick={reloadSavedState}>{workerFailed.current ? 'Reload page' : 'Reload saved match'}</button>}
        <button className="btn quiet" onClick={exit}>Free Play</button>
        <button className="btn quiet" onClick={sound.toggle}>Sound {sound.enabled ? 'On' : 'Off'}</button>
        <label className="play-sound-level">FX <input type="range" aria-label="Game effects volume" min="0" max="1" step=".05" value={sound.volume} onChange={e => sound.changeVolume(Number(e.target.value))} /></label></>} />
    : <div className="campaign-hub" ref={hub} tabIndex={-1}>
      <header className="campaign-head"><Masthead eyebrow="The Afterlife / A deck to make your own" title="Campaign" sub="Two starters. Nine tables. One seat at the top." />
        <div className="campaign-hub-tools">{run && <CampaignStoryJournal run={run} />}<button className="btn quiet" onClick={sound.toggle}>Sound {sound.enabled ? 'On' : 'Off'}</button><p className="campaign-save-note">Saved in this browser for this Vault.<br />Campaign cards stay in this run.</p></div></header>
      {error && <div className="play-error" role="alert">{error} <button className="btn quiet" onClick={reloadSavedState}>{workerFailed.current ? 'Reload page' : 'Reload campaign'}</button></div>}
      {busy && !profile && <p role="status">Opening the table…</p>}
      {newRunFrom && <button type="button" className="btn quiet campaign-intro-revisit" disabled={busy}
        onClick={() => { setNewRunFrom(undefined); hub.current?.focus(); }}>Back to current campaign</button>}
      {profile && choosingStarter && (!introSeen ? <CampaignInvitation proceed={proceedToStarters} /> : <section aria-labelledby="campaign-starter-title">
        <h2 id="campaign-starter-title" className="campaign-starter-heading" tabIndex={-1} ref={node => {
          if (node && focusStarter.current) { focusStarter.current = false; node.focus(); }
        }}>Choose your crew</h2>
        <button type="button" className="btn quiet campaign-intro-revisit" onClick={() => setIntroSeen(false)}>Read the introduction</button>
        <div className="campaign-starters">{STARTERS.map(starter => <article key={starter.key}>
        <div className="campaign-crew-art">{starter.legends.map(slug => <CardImg key={slug} slug={slug} alt="" priority />)}</div>
        <p className="play-eyebrow">{run?.starter === starter.key ? 'Current starter' : 'Official starter'} / {starter.colors.join(' + ')}</p><h2>{starter.name}</h2>
        <p>{starter.key === 'the-heist' ? 'Blue and Yellow. Gear, tempo and a crew that knows how to improvise.' : 'Green and Red. Arasaka power and the patience to hit back harder.'}</p>
        <button className="btn" disabled={busy} onClick={() => create(starter.key)}>Start with {starter.name}</button>
      </article>)}</div></section>)}
      {run && profile && !choosingStarter && <>
        <div className="campaign-progress"><span>ACT {Math.floor(run.encounter / 3) + 1} / 3</span><strong>{campaignStatus(run)}</strong><span>{Math.min(run.encounter + 1, 9)} / 9</span></div>
        <ol className="campaign-route" aria-label="Nine campaign contracts">{ENCOUNTERS.map((item, index) => <li key={item.id} data-state={index < run.encounter || ['claimingFinish', 'completed'].includes(run.phase) ? 'cleared' : index === run.encounter ? 'current' : 'locked'} title={`${index + 1}. ${item.title}`} aria-label={`Contract ${index + 1}, ${item.title}: ${index < run.encounter || ['claimingFinish', 'completed'].includes(run.phase) ? 'cleared' : index === run.encounter ? run.phase === 'rewardPending' ? 'pack ready' : 'current' : 'upcoming'}`}><span>{String(index + 1).padStart(2, '0')}</span></li>)}</ol>
        {run.phase === 'rewardPending' && run.rewards[run.encounter] && <CampaignPack key={run.rewards[run.encounter].id} run={run} busy={busy} inspect={inspectCard}
          revealTo={count => void apply(() => revealCampaignPack(scope, run.revision, count), value => { setRun(value.run); sound.cue((run.revealed ?? 0) === 0 ? 'pack-open' : 'pack-reveal'); })}
          choose={slug => void apply(() => chooseReward(scope, run.revision, slug), value => { setRun(value.run); sound.cue(needsActBriefing(value.run) ? 'act-arrival' : 'reward-lock'); window.scrollTo({ top: 0, behavior: 'instant' }); hub.current?.focus({ preventScroll: true }); })} />}
        {actPending && <CampaignArrival run={run} busy={busy} continueToDeck={() => void apply(() => acknowledgeCampaignAct(scope, run.revision), value => { setRun(value.run); hub.current?.focus({ preventScroll: true }); })} />}
        {['claimingFinish', 'completed'].includes(run.phase) && <CampaignRecap run={run} inspect={inspectCard} />}
        {run.phase === 'claimingFinish' && <CampaignRooms action="claim" allOwned={profile.environments.length === ENVIRONMENTS.length} rooms={ENVIRONMENTS.filter(item => !profile.environments.includes(item.id) || profile.environments.length === ENVIRONMENTS.length).map(item => item.id)} busy={busy}
          onSelect={id => void apply(() => claimEnvironment(scope, run.revision, id), value => { setRun(value.run); setProfile(value.profile); sound.cue('reward-lock'); hub.current?.focus({ preventScroll: true }); })} />}
        {run.phase === 'completed' && <section className="panel hot campaign-finale"><p className="play-eyebrow">The next chapter is yours</p><h2>Keep the deck. Keep the room.</h2><p>Open your finished list in Deck Builder to save it and take it into Free Play. Campaign cards stay separate from your physical Vault.</p><button className="btn" onClick={takeDeckToBuilder}>Open deck as draft</button><button className="btn quiet" onClick={exit}>Go to Free Play</button><button type="button" className="btn quiet" disabled={busy} onClick={openNewCampaign}>Start another campaign</button></section>}
        {!actPending && ['preparing', 'upgrading', 'inMatch'].includes(run.phase) && <div className="campaign-workspace">
          <section className="campaign-brief panel hot"><p className="play-eyebrow">Contract {run.encounter + 1} / {ENCOUNTERS.length} · {encounterSkill(run)}</p><h2>{encounter?.title}</h2><p>{encounter?.brief}</p>
            {encounter && <CampaignRivalBrief encounter={encounter.id} starter={run.starter} />}
            <p className="play-eyebrow">Rival crew · {run.opponents[run.encounter]?.name}</p><div className="campaign-rival-crew">{run.opponents[run.encounter]?.legends.map(slug => <button key={slug} title={`Inspect ${BY_SLUG.get(slug)?.display}`} onClick={() => inspectCard(slug)}><CardImg slug={slug} alt={BY_SLUG.get(slug)?.display ?? slug} /></button>)}</div>
            {run.phase === 'inMatch' ? <button className="btn" disabled={busy} onClick={() => void apply(() => send({ type: 'resume' }), value => { setSnapshot(value.snapshot); setShowTable(true); })}>Return to match</button>
              : <button className="btn" disabled={busy || issues.length > 0} onClick={launch}>{run.attempts ? 'Retry contract' : 'Take the contract'}</button>}
            {issues.length > 0 && <p className="play-error">{issues.join(' ')}</p>}
            <small>Wins unlock the next table. Losses keep your cards{run.attempts > 1 ? ' · Review your reserve and try another legal swap.' : '.'}</small>
          </section>
          <section className="campaign-workshop panel"><div className="campaign-section-heading"><div><p className="play-eyebrow">Your campaign deck</p><h2>Make the next move.</h2></div><span>{totalCopies(run.deck.cards)} cards · {run.deck.legends.length} Legends</span></div>
            <CampaignDeckNumbers deck={run.deck} /><p className="campaign-edit-feedback" role="status">{editFeedback}</p><div className="campaign-crew-art campaign-active-crew">{run.deck.legends.map(slug => <div key={slug}><CardImg slug={slug} alt={BY_SLUG.get(slug)?.display ?? slug} priority /><strong>{BY_SLUG.get(slug)?.name}</strong></div>)}</div>
            {run.phase !== 'inMatch' && <><CampaignNewCards run={run} review={reviewCard} inspect={inspectCard} /><div className="campaign-workshop-actions"><button className="btn quiet" disabled={!undo || busy} onClick={() => undo && edit(undo)}>Undo last edit</button><button className="btn quiet" disabled={busy} onClick={() => edit(structuredClone(run.lastLegal))}>Restore last legal deck</button></div>
              <p>Your full reserve. Compare a card before adding or swapping it, or adjust copies directly.</p>
              <div className="campaign-inventory">{inventory?.map(card => <article key={card.slug} data-new={!!run.rewards[run.encounter - 1]?.cards.includes(card.slug) || run.rewards[run.encounter - 1]?.choice === card.slug}>
                {iconicPrintings.has(card.slug) ? <CampaignRewardArt pull={{ slug: card.slug, printing: iconicPrintings.get(card.slug) }} alt={card.display} /> : <CardImg slug={card.slug} alt={card.display} />}<div><strong>{card.display}</strong><small>{card.color} · {card.type} · Cost {card.cost ?? '—'} · RAM {card.ram ?? '—'}</small><small>In deck {run.deck.cards[card.slug] ?? 0} / Earned {run.inventory[card.slug]}</small>
                <div className="campaign-quantity"><button className="btn quiet" onClick={() => starterColours?.includes(card.color) ? reviewCard(card.slug) : inspectCard(card.slug, iconicPrintings.get(card.slug)?.id)}>{starterColours?.includes(card.color) ? 'Compare' : 'Inspect'}</button><button className="btn quiet" aria-label={`Remove ${card.display}`} disabled={busy || !run.deck.cards[card.slug]} onClick={() => quantity(card.slug, -1)}>−</button><button className="btn ghost" aria-label={`Add ${card.display}`} disabled={busy || !starterColours?.includes(card.color) || (run.deck.cards[card.slug] ?? 0) >= Math.min(3, run.inventory[card.slug]) || totalCopies(run.deck.cards) >= 50} onClick={() => quantity(card.slug, 1)}>+</button></div></div>
              </article>)}</div>
              <h3>Earned Legends</h3><div className="campaign-legend-swaps">{run.deck.legends.map(prior => { const legend = BY_SLUG.get(prior); const options = CARDS.filter(card => card.type === 'Legend' && card.color === legend?.color && card.slug !== prior && (run.inventory[card.slug] ?? 0) > 0 && !run.deck.legends.some(slug => BY_SLUG.get(slug)?.name === card.name)); return <div key={prior}><strong>Replace {legend?.display}</strong>{options.map(card => <button className="btn ghost" key={card.slug} disabled={busy} onClick={() => reviewCard(card.slug)}>{card.display} · RAM {card.ram}</button>)}</div>; })}</div>
              {alternateLegends.length > 0 && <div className="campaign-workshop-actions" aria-label="Alternate-art Legends">
                {alternateLegends.map(([slug, printing]) => <button key={slug} className="btn quiet" onClick={() => inspectCard(slug, printing.id)}>{BY_SLUG.get(slug)?.name} · {packRarityLabel(printing.rarity)}</button>)}
              </div>}
            </>}
          </section>
        </div>}
        {!!profile.environments.length && run.phase !== 'claimingFinish' && <CampaignRooms action="equip" rooms={profile.environments} selected={profile.equipped} busy={busy} onSelect={id => void apply(() => equipEnvironment(scope, id), value => { setProfile(value.profile); sound.cue('reward-lock'); })} />}
        {!!profile.history?.length && <details className="campaign-history panel"><summary>Previous runs · {profile.history.length}</summary><div>{[...profile.history].reverse().map(item => <article key={item.id}><span>{item.completed ? 'Cleared all nine tables' : `Stopped after ${item.cleared} wins`} · {STARTERS.find(starter => starter.key === item.starter)?.name}</span>{item.completed && <button className="btn quiet" onClick={() => openInBuilder(item.deck)}>Open finished deck as draft</button>}</article>)}</div></details>}
        {!['completed', 'claimingFinish'].includes(run.phase) && <div className="campaign-restart"><button className="btn danger-ghost" disabled={busy} onClick={openNewCampaign}>Start a new campaign</button></div>}
      </>}
      <button className="btn quiet campaign-free-link" onClick={exit}>Free Play · Any deck, any opponent</button>
    </div>}
    {reviewed && run && ['preparing', 'upgrading'].includes(run.phase) && <CampaignUpgradeDialog key={reviewed.slug} run={run} slug={reviewed.slug} printingId={reviewed.printingId} busy={busy} error={error} close={() => setReviewed(undefined)} commit={deck => edit(deck, () => setReviewed(undefined))} />}
    <dialog ref={inspection} className="campaign-inspection" onClose={() => setInspected(undefined)} aria-label={inspectedCard?.display ?? 'Card details'}>
      <button className="btn quiet" onClick={() => setInspected(undefined)}>Close card</button>
      {inspected && inspectedCard && <div><CampaignRewardArt pull={{ slug: inspected.slug, printing: inspectedPrinting }} alt={inspectedCard.display} /><section>
        {inspectedPrinting && <p className="campaign-variant-label">{packRarityLabel(inspectedPrinting.rarity)} · No. {inspectedPrinting.num}</p>}
        <h2>{inspectedCard.display}</h2><p>{inspectedCard.text}</p>
        {!!run?.inventory[inspected.slug] && <p>Earned {run.inventory[inspected.slug]} · In deck {run.deck.cards[inspected.slug] ?? (run.deck.legends.includes(inspected.slug) ? 1 : 0)}</p>}
      </section></div>}
    </dialog>
    <ConfirmDialog open={!!replace} title={replace ? `Start with ${STARTERS.find(starter => starter.key === replace)?.name}?` : 'Start a new campaign?'} confirmLabel="Abandon and start new run" onCancel={() => setReplace(undefined)} onConfirm={() => { const starter = replace; setReplace(undefined); if (starter) create(starter, true); }}><p>Your current run and its cards will be replaced. Earned environments stay yours.</p></ConfirmDialog>
  </section>;
}
