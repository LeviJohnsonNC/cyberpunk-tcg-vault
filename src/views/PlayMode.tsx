import { ReactiveRoom } from './ReactiveRoom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ui';
import { readDeckDraft, type DeckDraft } from '../lib/deckDraft';
import type { Deck } from '../lib/store';
import { CircuitHub } from './CircuitHub';
import { equipTableFinish, readCircuitProgress } from '../lib/play/matchStorage';
import { type CircuitProgress, type TableFinish } from '../lib/play/circuit';
import { openPlayMatch, resumePlayMatch } from '../lib/play/matchClient';
import type { MatchSnapshot, MatchSummary, Move, RivalSkill } from '../lib/play/protocol';
import { visibleCards } from '../lib/play/matchView';
import { preloadFaces } from '../lib/play/cardArt';
import { PlayTable } from './PlayTable';
import { useTableSound } from './useTableSound';
import { useMatchPresentation } from './useMatchPresentation';
import './play-mode.css';
import './play-tactics.css';
import './circuit.css';

type Client = Awaited<ReturnType<typeof openPlayMatch>>;
type Confirm = 'replace' | 'restart' | 'concede';

export default function PlayMode({ scope, draft, saved, initialRival, initialOpponent, savedDecks, rememberRival, onCheckpoint, onEdit }: {
  scope: string; draft?: DeckDraft; saved?: MatchSummary; initialRival?: string; initialOpponent?: Deck; savedDecks: Deck[]; rememberRival: (id: string) => void;
  onCheckpoint: (snapshot: MatchSnapshot, draft?: DeckDraft) => void; onEdit: () => void;
}) {
  const [resume] = useState(!draft && !!saved);
  const [storedDraft] = useState(() => readDeckDraft(scope));
  const [resumeAttempt, setResumeAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [busy, setBusy] = useState(resume);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<Confirm>();
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
  const presentation = useMatchPresentation(snapshot);
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

  function openCircuit() { presentation.playback?.skip(); setProgress(undefined); setProgressError(undefined); setLobby(true); }

  useLayoutEffect(() => {
    if (matchId) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [matchId, lobby]);

  // The whole rival turn arrives at once. Warm its art before the moves play.
  useEffect(() => {
    if (snapshot) preloadFaces([snapshot.view, ...(snapshot.presentation?.beats ?? []).map((beat) => beat.view)].flatMap(visibleCards));
  }, [snapshot]);

  useEffect(() => () => {
    generation.current++;
    client.current?.close();
    client.current = null;
  }, []);

  useEffect(() => {
    if (!resume) return;
    let active = true;
    void resumePlayMatch(scope).then((next) => {
      if (active) {
        client.current = next;
        setSnapshot(next.opening);
        setBusy(false);
      } else next.close();
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'The saved match could not be opened.');
      setBusy(false);
    });
    return () => { active = false; };
  }, [resume, resumeAttempt, scope]);

  async function run(action: (isCurrent: () => boolean) => Promise<MatchSnapshot>, startedDraft?: DeckDraft) {
    if (locked.current) return;
    const current = generation.current;
    const isCurrent = () => current === generation.current;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const next = await action(isCurrent);
      if (isCurrent()) {
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
    if (current && snapshot) void run(() => current.rematch(snapshot));
  }

  const live = snapshot && !(presentation.displayed ?? snapshot).view.gameEnded;
  return (
    <section className="play-mode" data-finish={progress?.finish ?? 'afterlife'} onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
      <ReactiveRoom />
      {snapshot && !lobby ? <>
        <PlayTable key={snapshot.matchId} scope={scope} snapshot={presentation.displayed ?? snapshot} names={snapshot.names}
          playback={presentation.playback} feedback={presentation.feedback} reduced={presentation.reduced} diceImpact={sound.impact} cue={sound.cue}
          busy={busy || presentation.playing} error={error} send={send} rematch={rematch} edit={onEdit} circuit={openCircuit} controls={<>
            <button type="button" className="btn quiet" disabled={busy} onClick={openCircuit}>Circuit</button>
            <button type="button" className="btn quiet play-dice-sound" aria-label="Table sound" aria-pressed={sound.enabled}
              onClick={sound.toggle}>Sound <b>{sound.enabled ? 'On' : 'Off'}</b></button>
            <label className="play-sound-level" title="Game effects volume">FX <input type="range" aria-label="Game effects volume" min="0" max="1" step=".05" value={sound.volume} onChange={(e) => sound.changeVolume(Number(e.target.value))} /></label>
            {live && <button type="button" className="btn quiet" disabled={busy || presentation.playing} onClick={() => setConfirm('restart')}>Restart match</button>}
            {live && <button type="button" className="btn danger-ghost" disabled={busy || presentation.playing} onClick={() => setConfirm('concede')}>Concede</button>}
            <button type="button" className="btn quiet" disabled={busy} onClick={() => { presentation.playback?.skip(); onEdit(); }}>Back to draft</button>
          </>} />
      </> : !resume || lobby ? progress ? <CircuitHub progress={progress} draft={hubDraft} savedDecks={savedDecks} initialRival={initialRival} initialOpponent={initialOpponent}
        busy={busy || equipping} error={error ?? progressError} equip={equip} onEdit={onEdit} onResume={snapshot ? () => setLobby(false) : undefined}
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
    </section>
  );
}
