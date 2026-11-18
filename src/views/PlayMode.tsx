import { ReactiveRoom } from './ReactiveRoom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ui';
import { readDeckDraft, type DeckDraft } from '../lib/deckDraft';
import type { Deck } from '../lib/store';
import { CircuitHub } from './CircuitHub';
import { equipTableFinish, readCircuitProgress, resetFreePlay } from '../lib/play/matchStorage';
import { freePlaySkillKey } from '../lib/play/freePlayPreferences';
import { type CircuitProgress, type TableFinish } from '../lib/play/circuit';
import { openPlayMatch, resumePlayMatch } from '../lib/play/matchClient';
import type { MatchSnapshot, MatchSummary, Move, RivalSkill } from '../lib/play/protocol';
import { freePlayRivalProfile } from '../lib/play/freePlayDialogue';
import { rivalDialogueLine, rivalResult } from '../lib/play/rivalDialogue';
import { FreePlayRivalSeat } from './FreePlayRivalSeat';
import { PlayTable } from './PlayTable';
import { useTableSound } from './useTableSound';
import { useMatchPresentation } from './useMatchPresentation';
import { useRivalDialogue, useRivalDialoguePreference } from './useRivalDialogue';
import { playHref, rememberPlayMode, type PlayModeId } from '../lib/playNavigation';
import { PlayLanding } from './PlayLanding';
import './play-mode.css';
import './play-tactics.css';
import './circuit.css';
import { CampaignMode } from './CampaignMode';
import { readCampaign } from '../lib/play/campaignStorage';
import type { Environment } from '../lib/play/campaign';
import './campaign.css';

type Client = Awaited<ReturnType<typeof openPlayMatch>>;
type Confirm = 'replace' | 'restart' | 'concede';

type Props = {
  scope: string; mode?: PlayModeId; draft?: DeckDraft; saved?: MatchSummary; onMatchRead: (saved?: MatchSummary) => void;
  initialRival?: string; initialOpponent?: Deck; initialCuratedId?: string; savedDecks: Deck[]; rememberRival: (id: string) => void;
  requestedMatch?: string; onLeaveMatch: () => void;
  onCheckpoint: (snapshot: MatchSnapshot, draft?: DeckDraft) => void; onEdit: () => void; onCampaignDeck: (deck: Deck) => void;
  onFreePlayReset: () => void; preparationOnly?: boolean;
};

export default function PlayMode(props: Props) {
  const mode = props.mode ?? (props.draft || props.initialOpponent || props.requestedMatch ? 'free' : undefined);
  useEffect(() => { if (mode) rememberPlayMode(props.scope, mode); }, [mode, props.scope]);
  const resolveAfterReset = (from: string) => {
    if (window.location.hash === from) window.location.replace(playHref());
  };
  if (!mode) return <PlayLanding scope={props.scope} onMatchRead={props.onMatchRead} mobile={props.preparationOnly} />;
  if (mode === 'campaign') return <CampaignMode scope={props.scope} preparationOnly={props.preparationOnly} openInBuilder={props.onCampaignDeck}
    onReset={resolveAfterReset} />;
  if (props.preparationOnly) return <section className="panel play-landing"><h1 className="panel-title">Free Play</h1><p>Open the Vault on a desktop to play a match.</p></section>;
  return <FreePlayMode {...props} onFreePlayReset={(from) => {
    props.onFreePlayReset();
    resolveAfterReset(from);
  }} />;
}

function FreePlayMode({ scope, draft, saved, requestedMatch, initialRival, initialOpponent, initialCuratedId, savedDecks, rememberRival, onCheckpoint, onEdit, onFreePlayReset, onLeaveMatch }:
  Omit<Props, 'onFreePlayReset'> & { onFreePlayReset: (from: string) => void }) {
  const [environment, setEnvironment] = useState<Environment>();
  useEffect(() => { let active = true; void readCampaign(scope).then(value => { if (active) setEnvironment(value.profile.equipped); }).catch(() => {}); return () => { active = false; }; }, [scope]);
  const [resume, requestResume] = useState(() => !draft && !initialOpponent && !!saved && (!saved.ended || requestedMatch === saved.matchId));
  const [storedDraft] = useState(() => readDeckDraft(scope));
  const [resumeAttempt, setResumeAttempt] = useState(0);
  const manualResume = useRef(false);
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [opening, setOpening] = useState<{ matchId: string; retry: boolean }>();
  const { enabled: dialogue, toggle: toggleDialogue } = useRivalDialoguePreference(scope);
  const [busy, setBusy] = useState(resume);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<Confirm>();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string>();
  const [lobby, setLobby] = useState(false);
  const [progress, setProgress] = useState<CircuitProgress>();
  const [progressError, setProgressError] = useState<string>();
  const [progressAttempt, setProgressAttempt] = useState(0);
  const [equipping, setEquipping] = useState(false);
  const client = useRef<Client | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const hubDraft = draft ?? saved?.draft ?? storedDraft;
  const pendingStart = useRef<{ draft: DeckDraft; rival: Deck; skill: RivalSkill; key: string; contractId?: string } | undefined>(undefined);
  const matchId = snapshot?.matchId;
  // Keep the entry request fixed while the player moves between the table and the lobby.
  const [requestedOnEntry] = useState(requestedMatch);
  const presentation = useMatchPresentation(snapshot);
  const rivalKey = snapshot?.circuit?.rivalKey;
  const rivalDeckName = snapshot?.names.rival;
  const rival = useMemo(() => rivalDeckName ? freePlayRivalProfile(rivalKey, rivalDeckName) : undefined, [rivalKey, rivalDeckName]);
  const quote = useRivalDialogue(rival?.lines, snapshot, opening, presentation.playing, presentation.playback?.beat);
  const sound = useTableSound();

  useEffect(() => {
    let active = true;
    const load = () => { void readCircuitProgress(scope).then(value => {
      if (active) { setProgress(value); setProgressError(undefined); }
    }).catch(cause => { if (active) setProgressError(cause instanceof Error ? cause.message : 'Could not load Circuit progress.'); }); };
    load();
    window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('focus', load); };
  }, [scope, lobby, snapshot?.view.gameEnded, progressAttempt]);

  async function equip(finish: TableFinish) {
    setEquipping(true);
    try { setProgress(await equipTableFinish(scope, finish)); setProgressError(undefined); }
    catch (cause) { setProgressError(cause instanceof Error ? cause.message : 'Could not save this finish.'); }
    finally { setEquipping(false); }
  }

  function openCircuit() {
    presentation.playback?.skip();
    onLeaveMatch();
    // Returning to this table is a resume, even if it was left during setup.
    setSnapshot(current => current?.openingDeal ? { ...current, openingDeal: undefined } : current);
    setProgress(undefined); setProgressError(undefined); setLobby(true);
  }

  async function reset() {
    if (locked.current || busy || equipping) return;
    const from = window.location.hash;
    locked.current = true;
    setResetting(true);
    setResetError(undefined);
    try {
      await resetFreePlay(scope);
    } catch {
      setResetError('Free Play couldn’t be reset. Check that browser storage is available and try again.');
      setResetting(false);
      locked.current = false;
      return;
    }
    try { localStorage.setItem(freePlaySkillKey(scope), 'sharp'); } catch { /* Optional preference. */ }
    onFreePlayReset(from);
  }

  useLayoutEffect(() => {
    if (matchId) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [matchId, lobby]);

  useEffect(() => () => {
    generation.current++;
    client.current?.close();
    client.current = null;
  }, []);

  useEffect(() => {
    if (!resume) return;
    let active = true;
    void resumePlayMatch(scope).then((next) => {
      if (!active) { next.close(); return; }
      if (next.opening.view.gameEnded && requestedOnEntry !== next.opening.matchId) {
        next.close();
        setLobby(true);
      } else {
        client.current?.close();
        client.current = next;
        setSnapshot(manualResume.current ? { ...next.opening, openingDeal: undefined } : next.opening);
        setLobby(false);
      }
      setBusy(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'The saved match could not be opened.');
      setBusy(false);
    });
    return () => { active = false; };
  }, [resume, resumeAttempt, scope, requestedOnEntry]);

  function returnToMatch() {
    if (snapshot && !snapshot.view.gameEnded) {
      setLobby(false);
      return;
    }
    if (busy || !saved || saved.ended) return;
    manualResume.current = true;
    setBusy(true);
    setError(undefined);
    requestResume(true);
    setResumeAttempt(attempt => attempt + 1);
  }

  async function run(action: (isCurrent: () => boolean) => Promise<MatchSnapshot>, startedDraft?: DeckDraft, retry = false) {
    if (locked.current) return;
    const current = generation.current;
    const isCurrent = () => current === generation.current;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const next = await action(isCurrent);
      if (isCurrent()) {
        if (next.openingDeal) setOpening({ matchId: next.matchId, retry });
        setSnapshot(next);
        onCheckpoint(next, startedDraft);
      }
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'The match could not continue.');
    } finally {
      if (isCurrent()) {
        setBusy(false);
        locked.current = false;
      }
    }
  }

  function start(replace = false) {
    const pending = pendingStart.current;
    if (!pending) return;
    if (saved && !saved.ended && !replace) { setConfirm('replace'); return; }
    void run(async (isCurrent) => {
      const next = await openPlayMatch(scope, pending.draft, pending.rival, saved?.matchId, pending.skill, { rivalKey: pending.key, contractId: pending.contractId });
      if (isCurrent()) { client.current?.close(); client.current = next; rememberRival(pending.key); setLobby(false); }
      else next.close();
      return next.opening;
    }, pending.draft);
  }

  function send(move: Move) {
    const current = client.current;
    if (current && snapshot && !presentation.playing) void run(() => current.move(snapshot, move));
  }

  function rematch() {
    const current = client.current;
    if (current && snapshot) void run(() => current.rematch(snapshot), undefined, true);
  }

  const live = snapshot && !(presentation.displayed ?? snapshot).view.gameEnded;
  const practice = !snapshot?.circuit?.contractId;
  const practiceResult = snapshot && !lobby && practice && !live;
  const result = dialogue && snapshot && !live ? rivalResult(snapshot.view) : undefined;
  const resultQuote = rival && snapshot && result
    ? { rival: rival.name, text: rivalDialogueLine(rival.lines, result, snapshot.matchId) } : undefined;
  return (
    <section className="play-mode" data-practice-result={practiceResult || undefined}
      data-finish={progress?.finish ?? 'afterlife'} data-environment={environment ?? 'default'} onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
      {!practiceResult && <ReactiveRoom />}
      {snapshot && !lobby ? <>
        <PlayTable key={snapshot.matchId} scope={scope} snapshot={presentation.displayed ?? snapshot} names={snapshot.names}
          playback={presentation.playback} feedback={presentation.feedback} quick={presentation.quick} togglePace={presentation.togglePace} reduced={presentation.reduced} cue={sound.cue}
          freePlay={rival && { rival: <FreePlayRivalSeat profile={rival} deckName={snapshot.names.rival} quote={quote}
            enabled={dialogue} toggle={toggleDialogue} />, resultQuote }}
          busy={busy || presentation.playing} error={error} send={send} rematch={rematch} edit={onEdit} circuit={openCircuit}
          practiceLobby={practice ? openCircuit : undefined}
          navigation={<button type="button" className="btn quiet" disabled={busy} onClick={openCircuit}>Free Play lobby</button>}
          audio={<><button type="button" className="btn quiet" aria-label="Table sound" aria-pressed={sound.enabled}
            onClick={sound.toggle}>Game effects <b>{sound.enabled ? 'On' : 'Off'}</b></button>
            <label className="play-sound-level">FX volume <input type="range" aria-label="Game effects volume" min="0" max="1" step=".05" value={sound.volume} onChange={(e) => sound.changeVolume(Number(e.target.value))} /></label></>}
          controls={<>
            {live && <button type="button" className="btn quiet" disabled={busy || presentation.playing} onClick={() => setConfirm('restart')}>Restart match</button>}
            <button type="button" className="btn quiet" disabled={busy} onClick={() => { presentation.playback?.skip(); onEdit(); }}>Back to draft</button>
            {live && <button type="button" className="btn danger-ghost" disabled={busy || presentation.playing} onClick={() => setConfirm('concede')}>Concede</button>}
          </>} />
      </> : !resume || lobby ? progress ? <CircuitHub scope={scope} progress={progress} draft={hubDraft} savedDecks={savedDecks} initialRival={initialRival} initialOpponent={initialOpponent} initialCuratedId={initialCuratedId}
        busy={busy || equipping} error={error ?? progressError} equip={equip} onEdit={onEdit} onResume={(snapshot ? !snapshot.view.gameEnded : saved && !saved.ended) ? returnToMatch : undefined}
        onReset={() => { setResetError(undefined); setResetOpen(true); }}
        onStart={(draft, rival, skill, key, contractId) => { pendingStart.current = { draft, rival, skill, key, contractId }; start(); }} />
        : <div className="panel" role="status"><h1>Opening the Circuit</h1>{progressError ? <><p className="play-error">{progressError}</p><button className="btn" onClick={() => setProgressAttempt(value => value + 1)}>Try again</button><button className="btn quiet" onClick={onEdit}>Back to draft</button></> : <p>Checking your standing…</p>}</div>
      : <div className="panel">
        <h1 className="panel-title">Saved match</h1>
        {busy ? <p role="status">Restoring the table…</p> : <>
          {error && <p className="play-error" role="alert">{error}</p>}
          <div className="play-actions">
            <button type="button" className="btn" onClick={() => {
              setBusy(true);
              setError(undefined);
              setResumeAttempt((attempt) => attempt + 1);
            }}>Try again</button>
            <button type="button" className="btn quiet" onClick={openCircuit}>Free Play lobby</button>
            <button type="button" className="btn quiet" onClick={onEdit}>Back to draft</button>
          </div>
        </>}
      </div>}
      <ConfirmDialog open={!!confirm} title={confirm === 'concede' ? 'Concede this match?' : confirm === 'restart' ? 'Start a fresh match?' : 'Replace your saved match?'}
        confirmLabel={confirm === 'concede' ? 'Concede match' : confirm === 'restart' ? 'Restart match' : 'Replace match'} onCancel={() => setConfirm(undefined)}
        onConfirm={() => {
          setConfirm(undefined);
          if (confirm === 'replace') start(true);
          if (confirm === 'restart') rematch();
          if (confirm === 'concede') send({ move: 'concede' });
        }}>
        <p>{confirm === 'concede' ? 'The rival wins this match.' : confirm === 'restart' ? 'The current match ends and both decks are shuffled again.' : 'Starting a new match replaces the one in progress for this Vault.'}</p>
      </ConfirmDialog>
      <ConfirmDialog open={resetOpen} title="Reset Free Play?" confirmLabel="Reset Free Play" busy={resetting}
        onCancel={() => setResetOpen(false)} onConfirm={() => void reset()}>
        <p>This permanently clears your saved Free Play match, REP, contract marks, match history, and Free Play unlocks for this Vault in this browser.</p>
        <p>Your Campaign progress and rewards, collection, and Deck Builder decks are kept.</p>
        {resetError && <p className="play-error" role="alert">{resetError}</p>}
      </ConfirmDialog>
    </section>
  );
}
