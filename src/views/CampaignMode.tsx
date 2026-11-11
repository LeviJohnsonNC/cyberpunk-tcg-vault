import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, Masthead } from '../components/ui';
import { CardImg } from '../components/bits';
import { BY_SLUG, CARDS } from '../lib/data';
import { STARTERS, type StarterKey } from '../lib/starters';
import type { Deck } from '../lib/store';
import { totalCopies } from '../lib/deckDraft';
import { ENCOUNTERS, ENVIRONMENTS, campaignDeckIssues, type CampaignProfile, type CampaignRun } from '../lib/play/campaign';
import { readCampaign, startCampaign, chooseReward, saveCampaignDeck, claimEnvironment, equipEnvironment, campaignStatus, revealCampaignPack } from '../lib/play/campaignStorage';
import type { CampaignWorkerResponse } from '../lib/play/campaign.worker';
import type { MatchSnapshot, Move } from '../lib/play/protocol';
import { useMatchPresentation } from './useMatchPresentation';
import { useTableSound } from './useTableSound';
import { PlayTable } from './PlayTable';
import { ReactiveRoom } from './ReactiveRoom';
import './campaign.css';

export function CampaignMode({ scope, exit, openInBuilder }: { scope: string; exit: () => void; openInBuilder: (deck: Deck) => void }) {
  const [run, setRun] = useState<CampaignRun>();
  const [profile, setProfile] = useState<CampaignProfile>();
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [showTable, setShowTable] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [replace, setReplace] = useState<StarterKey>();
  const [undo, setUndo] = useState<Deck>();
  const [inspected, setInspected] = useState<string>();
  const inspection = useRef<HTMLDialogElement>(null);
  const worker = useRef<Worker>(null);
  const serial = useRef(0);
  const requests = useRef(new Map<number, { resolve: (data: CampaignWorkerResponse) => void; reject: (error: Error) => void }>());
  const presentation = useMatchPresentation(snapshot);
  const sound = useTableSound();

  const send = useCallback((action: { type: 'start'; revision: number } | { type: 'resume' } | { type: 'move'; matchId: string; stateID: number; move: Move }) =>
    new Promise<CampaignWorkerResponse>((resolve, reject) => {
      if (!worker.current) return reject(new Error('Campaign engine is not ready.'));
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
    const pending = requests.current;
    worker.current = current;
    const receive = ({ data }: MessageEvent<CampaignWorkerResponse>) => {
      const pending = requests.current.get(data.id);
      if (!pending) return;
      requests.current.delete(data.id);
      if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data);
    };
    current.addEventListener('message', receive);
    const failed = () => { setError('The campaign engine stopped. Reload the page to restore the saved match.'); for (const request of pending.values()) request.reject(new Error('The campaign engine stopped.')); pending.clear(); };
    current.addEventListener('error', failed);
    void recover().catch(cause => { if (active) setError(String(cause)); }).finally(() => { if (active) setBusy(false); });
    async function recover() {
      const value = await readCampaign(scope);
      if (!active) return;
      setRun(value.run); setProfile(value.profile);
      if (value.run?.phase === 'inMatch') {
        const resumed = await send({ type: 'resume' });
        if (active) { setSnapshot(resumed.snapshot); setShowTable(true); }
      } else if (value.run?.match) {
        // A second tab may have finished the match while this one was out of focus.
        setShowTable(false);
      }
    }
    const focus = () => { void recover().catch(() => {}); };
    window.addEventListener('focus', focus);
    return () => { active = false; window.removeEventListener('focus', focus); current.removeEventListener('message', receive); current.removeEventListener('error', failed); current.terminate(); worker.current = null;
      for (const request of pending.values()) request.reject(new Error('Campaign closed.')); pending.clear(); };
  }, [scope, send]);

  async function apply<T>(task: () => Promise<T>, update: (value: T) => void) {
    if (busy) return;
    setBusy(true); setError(undefined);
    try { update(await task()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your campaign.'); }
    finally { setBusy(false); }
  }

  function create(starter: StarterKey, abandon = false) {
    if (run && run.phase !== 'completed' && !abandon) { setReplace(starter); return; }
    void apply(() => startCampaign(scope, starter, abandon), value => {
      setRun(value.run); setProfile(value.profile); setShowTable(false); setSnapshot(undefined); setUndo(undefined);
    });
  }

  function launch() {
    if (!run) return;
    void apply(() => send({ type: 'start', revision: run.revision }), value => {
      setRun(value.run); setProfile(value.profile); setSnapshot(value.snapshot); setShowTable(true);
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  function move(move: Move) {
    if (!run || !snapshot || presentation.playing) return;
    void apply(() => send({ type: 'move', matchId: snapshot.matchId, stateID: snapshot.view.stateID, move }), value => {
      setRun(value.run); setProfile(value.profile); setSnapshot(value.snapshot);
    });
  }

  function edit(deck: Deck) {
    if (!run) return;
    const before = structuredClone(run.deck);
    void apply(() => saveCampaignDeck(scope, run.revision, deck), value => { setUndo(before); setRun(value.run); });
  }

  function quantity(slug: string, amount: number) {
    if (!run) return;
    const have = run.deck.cards[slug] ?? 0;
    if (have + amount < 0 || have + amount > (run.inventory[slug] ?? 0) || have + amount > 3) return;
    const cards = { ...run.deck.cards, [slug]: have + amount };
    if (!cards[slug]) delete cards[slug];
    edit({ ...run.deck, cards });
  }

  function swapLegend(next: string, prior: string) {
    if (!run) return;
    edit({ ...run.deck, legends: run.deck.legends.map(slug => slug === prior ? next : slug) });
  }

  function takeDeckToBuilder() {
    if (!run || run.phase !== 'completed') return;
    openInBuilder(run.deck);
  }

  function reloadSavedState() {
    void apply(async () => {
      const value = await readCampaign(scope);
      const resumed = value.run?.phase === 'inMatch' ? await send({ type: 'resume' }) : undefined;
      return { ...value, snapshot: resumed?.snapshot };
    }, value => { setRun(value.run); setProfile(value.profile); setSnapshot(value.snapshot); setShowTable(!!value.snapshot); });
  }

  const encounter = run && ENCOUNTERS[run.encounter];
  const reward = run?.rewards[run.encounter];
  const reveal = run?.revealed ?? 0;
  const issues = run ? campaignDeckIssues(run, run.deck) : [];
  const inventory = run && CARDS.filter(card => (run.inventory[card.slug] ?? 0) > 0 && card.type !== 'Legend')
    .sort((a, b) => (run.deck.cards[b.slug] ?? 0) - (run.deck.cards[a.slug] ?? 0) || (a.cost ?? 0) - (b.cost ?? 0) || a.display.localeCompare(b.display));

  return <section className="play-mode campaign-mode" data-environment={profile?.equipped ?? 'default'} onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
    <ReactiveRoom />
    {showTable && snapshot ? <PlayTable key={snapshot.matchId} scope={`${scope}:campaign`} snapshot={presentation.displayed ?? snapshot} names={snapshot.names}
      playback={presentation.playback} feedback={presentation.feedback} reduced={presentation.reduced} diceImpact={sound.impact} cue={sound.cue}
      busy={busy || presentation.playing} error={error} send={move} rematch={() => { presentation.playback?.skip(); setShowTable(false); }}
      edit={() => setShowTable(false)} resultContinueLabel={snapshot.view.winnerId === 'player' ? run?.phase === 'claimingFinish' ? 'Open Champion’s Cache' : 'Open your pack' : 'Review deck and retry'}
      controls={<><button className="btn quiet" onClick={() => { presentation.playback?.skip(); setShowTable(false); }}>Campaign board</button>
        {error && <button className="btn" onClick={reloadSavedState}>Reload saved match</button>}
        <button className="btn quiet" onClick={exit}>Free Play</button>
        <button className="btn quiet" onClick={sound.toggle}>Sound {sound.enabled ? 'On' : 'Off'}</button>
        <label className="play-sound-level">FX <input type="range" aria-label="Game effects volume" min="0" max="1" step=".05" value={sound.volume} onChange={e => sound.changeVolume(Number(e.target.value))} /></label></>} />
    : <div className="campaign-hub">
      <header className="campaign-head"><Masthead eyebrow="The Afterlife / A deck to make your own" title="Campaign" sub="Two starters. Nine tables. One seat at the top." />
        <p className="campaign-save-note">Saved in this browser for this Vault. Campaign cards stay in this run.</p></header>
      {error && <div className="play-error" role="alert">{error} <button className="btn quiet" onClick={reloadSavedState}>Reload campaign</button></div>}
      {busy && !profile && <p role="status">Opening the table…</p>}
      {!busy && profile && !run && <div className="campaign-starters">{STARTERS.map(starter => <article key={starter.key}>
        <div className="campaign-crew-art">{starter.legends.map(slug => <CardImg key={slug} slug={slug} alt="" priority />)}</div>
        <p className="play-eyebrow">Official starter / {starter.colors.join(' + ')}</p><h2>{starter.name}</h2>
        <p>{starter.key === 'the-heist' ? 'Blue and Yellow. Gear, tempo and a crew that knows how to improvise.' : 'Green and Red. Arasaka power and the patience to hit back harder.'}</p>
        <button className="btn" disabled={busy} onClick={() => create(starter.key)}>Start with {starter.name}</button>
      </article>)}</div>}
      {run && profile && <>
        <div className="campaign-progress"><span>ACT {Math.floor(run.encounter / 3) + 1} / 3</span><strong>{campaignStatus(run)}</strong><span>{Math.min(run.encounter + 1, 9)} / 9</span></div>
        <ol className="campaign-route" aria-label="Nine campaign contracts">{ENCOUNTERS.map((item, index) => <li key={item.id} data-state={index < run.encounter || ['claimingFinish', 'completed'].includes(run.phase) ? 'cleared' : index === run.encounter ? 'current' : 'locked'} title={`${index + 1}. ${item.title}`} aria-label={`Contract ${index + 1}, ${item.title}: ${index < run.encounter || ['claimingFinish', 'completed'].includes(run.phase) ? 'cleared' : index === run.encounter ? run.phase === 'rewardPending' ? 'pack ready' : 'current' : 'upcoming'}`}><span>{String(index + 1).padStart(2, '0')}</span></li>)}</ol>
        {run.phase === 'rewardPending' && reward && <section className="campaign-reward panel hot">
          <p className="play-eyebrow">Contract cleared / Pack {run.encounter + 1}</p><h2>Your take from the table</h2>
          <p>Seven cards are yours. Reveal them, then pick one more.</p>
          {reveal === 0 && <button className="campaign-sealed-pack" disabled={busy} onClick={() => void apply(() => revealCampaignPack(scope, run.revision, 1), value => { setRun(value.run); sound.cue('draw'); })} aria-label="Tear the seal and reveal the first card"><span className="campaign-pack-code">AF / AFTERLIFE<br />CONTRACT {String(run.encounter + 1).padStart(2, '0')}</span><strong>YOUR TAKE.</strong><span className="campaign-pack-seal">◆ Tear the seal ◆</span><span className="campaign-pack-count">07 CARDS + 01 CHOICE</span></button>}
          <div className="campaign-pack-actions"><button className="btn" onClick={() => void apply(() => revealCampaignPack(scope, run.revision, Math.min(7, reveal + 1)), value => { setRun(value.run); sound.cue('draw'); })} disabled={busy || reveal >= 7}>{reveal ? 'Reveal next card' : 'Tear the seal'}</button><button className="btn quiet" disabled={busy || reveal >= 7} onClick={() => void apply(() => revealCampaignPack(scope, run.revision, 7), value => { setRun(value.run); sound.cue('draw'); })}>Reveal all</button></div>
          {reveal > 0 && <div className="campaign-reward-cards">{reward.cards.map((slug, index) => <div key={slug} className="campaign-reward-card" data-hidden={index >= reveal}>{index < reveal ? <CardImg slug={slug} alt={BY_SLUG.get(slug)?.display ?? slug} /> : <span aria-label="Unrevealed card">◆</span>}<strong>{index < reveal ? BY_SLUG.get(slug)?.display : 'Sealed'}</strong></div>)}</div>}
          {reveal >= 7 && <><h3>Choose your eighth card</h3><p>Pick one. The other two are left behind.</p><div className="campaign-offers">{reward.offers.map(slug => { const offered = BY_SLUG.get(slug); const prior = run.deck.legends.find(legend => BY_SLUG.get(legend)?.color === offered?.color && (BY_SLUG.get(legend)?.ram ?? 0) <= (offered?.ram ?? 0)); return <article key={slug}><CardImg slug={slug} alt="" /><strong>{offered?.display}</strong><small>{offered?.type === 'Legend' ? `Crew option · ${offered.color} RAM ${offered.ram} · Can replace ${BY_SLUG.get(prior ?? '')?.name ?? 'a Legend'}` : `${offered?.color} / ${offered?.type} · Cost ${offered?.cost ?? '—'}`}</small>
            <button className="btn quiet" onClick={() => setInspected(slug)}>Inspect card</button><button className="btn ghost" disabled={busy} onClick={() => void apply(() => chooseReward(scope, run.revision, slug), value => { setRun(value.run); sound.cue('draw'); })}>Choose this card</button></article>; })}</div></>}
        </section>}
        {run.phase === 'claimingFinish' && <section className="campaign-reward panel hot"><p className="play-eyebrow">The final table is yours</p><h2>Choose your new room</h2><p>Your finished deck and this environment are yours to keep.</p><div className="campaign-environments">{ENVIRONMENTS.filter(item => !profile.environments.includes(item.id) || profile.environments.length === ENVIRONMENTS.length).map(item => <button key={item.id} className="campaign-environment" data-environment={item.id} disabled={busy} onClick={() => void apply(() => claimEnvironment(scope, run.revision, item.id), value => { setRun(value.run); setProfile(value.profile); })}><strong>{item.name}</strong><span>{item.description}</span></button>)}</div></section>}
        {run.phase === 'completed' && <section className="panel hot campaign-finale"><h2>You earned your seat.</h2><p>Completed with {STARTERS.find(item => item.key === run.starter)?.name}. Your deck can become a separate draft in Deck Builder; earned cards do not become physical Vault holdings.</p><button className="btn" onClick={takeDeckToBuilder}>Open deck as draft</button><button className="btn quiet" onClick={exit}>Go to Free Play</button><p>Start again with another crew:</p>{STARTERS.map(starter => <button className="btn quiet" key={starter.key} onClick={() => create(starter.key)}>{starter.name}</button>)}</section>}
        {['preparing', 'upgrading', 'inMatch'].includes(run.phase) && <div className="campaign-workspace">
          <section className="campaign-brief panel hot"><p className="play-eyebrow">Contract {run.encounter + 1} / {ENCOUNTERS.length} · {encounter?.skill}</p><h2>{encounter?.title}</h2><p>{encounter?.brief}</p>
            <p className="play-eyebrow">Rival crew · {run.opponents[run.encounter]?.name}</p><div className="campaign-rival-crew">{run.opponents[run.encounter]?.legends.map(slug => <button key={slug} title={`Inspect ${BY_SLUG.get(slug)?.display}`} onClick={() => setInspected(slug)}><CardImg slug={slug} alt={BY_SLUG.get(slug)?.display ?? slug} /></button>)}</div>
            {run.phase === 'inMatch' ? <button className="btn" disabled={busy} onClick={() => void apply(() => send({ type: 'resume' }), value => { setSnapshot(value.snapshot); setShowTable(true); })}>Return to match</button>
              : <button className="btn" disabled={busy || issues.length > 0} onClick={launch}>{run.attempts ? 'Retry contract' : 'Take the contract'}</button>}
            {issues.length > 0 && <p className="play-error">{issues.join(' ')}</p>}
            <small>Wins unlock the next table. Losses keep your cards{run.attempts > 1 ? ' · Review your reserve and try another legal swap.' : '.'}</small>
          </section>
          <section className="campaign-workshop panel"><div className="campaign-section-heading"><div><p className="play-eyebrow">Your campaign deck</p><h2>Make the next move.</h2></div><span>{totalCopies(run.deck.cards)} cards · {run.deck.legends.length} Legends</span></div>
            <div className="campaign-crew-art campaign-active-crew">{run.deck.legends.map(slug => <div key={slug}><CardImg slug={slug} alt={BY_SLUG.get(slug)?.display ?? slug} priority /><strong>{BY_SLUG.get(slug)?.name}</strong></div>)}</div>
            {run.phase !== 'inMatch' && <><div className="campaign-workshop-actions"><button className="btn quiet" disabled={!undo || busy} onClick={() => undo && edit(undo)}>Undo last edit</button><button className="btn quiet" disabled={busy} onClick={() => edit(structuredClone(run.lastLegal))}>Restore last legal deck</button></div>
              <p>Cards in reserve are always yours. Choose a card to inspect it in full art, then add or swap copies below.</p>
              <div className="campaign-inventory">{inventory?.map(card => <article key={card.slug} data-new={!!run.rewards[run.encounter - 1]?.cards.includes(card.slug) || run.rewards[run.encounter - 1]?.choice === card.slug}>
                <CardImg slug={card.slug} alt={card.display} /><div><strong>{card.display}</strong><small>{card.color} · {card.type} · Cost {card.cost ?? '—'} · RAM {card.ram ?? '—'}</small><small>In deck {run.deck.cards[card.slug] ?? 0} / Earned {run.inventory[card.slug]}</small>
                <div className="campaign-quantity"><button className="btn quiet" onClick={() => setInspected(card.slug)}>Details</button><button className="btn quiet" aria-label={`Remove ${card.display}`} disabled={busy || !run.deck.cards[card.slug]} onClick={() => quantity(card.slug, -1)}>−</button><button className="btn ghost" aria-label={`Add ${card.display}`} disabled={busy || (run.deck.cards[card.slug] ?? 0) >= run.inventory[card.slug]} onClick={() => quantity(card.slug, 1)}>+</button></div></div>
              </article>)}</div>
              <h3>Earned Legends</h3><div className="campaign-legend-swaps">{run.deck.legends.map(prior => { const legend = BY_SLUG.get(prior); const options = CARDS.filter(card => card.type === 'Legend' && card.color === legend?.color && card.slug !== prior && (run.inventory[card.slug] ?? 0) > 0 && !run.deck.legends.some(slug => BY_SLUG.get(slug)?.name === card.name)); return <div key={prior}><strong>Replace {legend?.display}</strong>{options.map(card => <button className="btn ghost" key={card.slug} disabled={busy} onClick={() => swapLegend(card.slug, prior)}>{card.display} · RAM {card.ram}</button>)}</div>; })}</div>
            </>}
          </section>
        </div>}
        {!!profile.environments.length && <section className="campaign-locker"><h2>Your rooms</h2>{ENVIRONMENTS.filter(item => profile.environments.includes(item.id)).map(item => <button key={item.id} className="btn quiet" disabled={busy || profile.equipped === item.id} onClick={() => void apply(() => equipEnvironment(scope, item.id), value => setProfile(value.profile))}>{profile.equipped === item.id ? 'On your table: ' : 'Equip '}{item.name}</button>)}</section>}
        {!!profile.history?.length && <details className="campaign-history panel"><summary>Previous runs · {profile.history.length}</summary><div>{[...profile.history].reverse().map(item => <article key={item.id}><span>{item.completed ? 'Cleared all nine tables' : `Stopped after ${item.cleared} wins`} · {STARTERS.find(starter => starter.key === item.starter)?.name}</span>{item.completed && <button className="btn quiet" onClick={() => openInBuilder(item.deck)}>Open finished deck as draft</button>}</article>)}</div></details>}
        {!['completed', 'claimingFinish'].includes(run.phase) && <div className="campaign-restart"><button className="btn danger-ghost" disabled={busy} onClick={() => create(run.starter === 'the-heist' ? 'embracing-power' : 'the-heist')}>Start with a different starter</button></div>}
      </>}
      <button className="btn quiet campaign-free-link" onClick={exit}>Free Play · Any deck, any opponent</button>
    </div>}
    <dialog ref={inspection} className="campaign-inspection" onClose={() => setInspected(undefined)} aria-label={inspected ? BY_SLUG.get(inspected)?.display : 'Card details'}>
      <button className="btn quiet" onClick={() => setInspected(undefined)}>Close card</button>
      {inspected && <div><CardImg slug={inspected} alt={BY_SLUG.get(inspected)?.display ?? inspected} /><section><h2>{BY_SLUG.get(inspected)?.display}</h2><p>{BY_SLUG.get(inspected)?.text}</p>{!!run?.inventory[inspected] && <p>Earned {run.inventory[inspected]} · In deck {run.deck.cards[inspected] ?? (run.deck.legends.includes(inspected) ? 1 : 0)}</p>}</section></div>}
    </dialog>
    <ConfirmDialog open={!!replace} title="Start a new campaign?" confirmLabel="Abandon current run" onCancel={() => setReplace(undefined)} onConfirm={() => { const starter = replace; setReplace(undefined); if (starter) create(starter, true); }}><p>Your current run and its cards will be replaced. Earned environments stay yours.</p></ConfirmDialog>
  </section>;
}
