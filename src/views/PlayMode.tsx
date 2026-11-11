import { ReactiveRoom } from './ReactiveRoom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConfirmDialog, Masthead } from '../components/ui';
import type { DeckDraft } from '../lib/deckDraft';
import type { Deck } from '../lib/store';
import { PlaySetup } from './PlaySetup';
import { openPlayMatch, resumePlayMatch } from '../lib/play/matchClient';
import type { MatchSnapshot, MatchSummary, Move, RivalSkill } from '../lib/play/protocol';
import { visibleCards } from '../lib/play/matchView';
import { preloadFaces } from '../lib/play/cardArt';
import { PlayTable } from './PlayTable';
import { useTableSound } from './useTableSound';
import { useMatchPresentation } from './useMatchPresentation';
import './play-mode.css';
import './play-tactics.css';

type Client = Awaited<ReturnType<typeof openPlayMatch>>;
type Confirm = 'replace' | 'restart' | 'concede';

export default function PlayMode({ scope, draft, saved, initialRival, initialOpponent, savedDecks, rememberRival, onCheckpoint, onEdit }: {
  scope: string; draft?: DeckDraft; saved?: MatchSummary; initialRival?: string; initialOpponent?: Deck; savedDecks: Deck[]; rememberRival: (id: string) => void;
  onCheckpoint: (snapshot: MatchSnapshot, draft?: DeckDraft) => void; onEdit: () => void;
}) {
  const [resume] = useState(!draft);
  const [resumeAttempt, setResumeAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [busy, setBusy] = useState(resume);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<Confirm>();
  const client = useRef<Client | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const deck = draft?.deck;
  const pendingStart = useRef<{ draft: DeckDraft; rival: Deck; skill: RivalSkill; key: string } | undefined>(undefined);
  const matchId = snapshot?.matchId;
  const presentation = useMatchPresentation(snapshot);
  const sound = useTableSound();

  useLayoutEffect(() => {
    if (matchId) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [matchId]);

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
      const next = await openPlayMatch(scope, pending.draft, pending.rival, saved?.matchId, pending.skill);
      if (isCurrent()) { client.current = next; rememberRival(pending.key); }
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
    <section className="play-mode" onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
      <ReactiveRoom />
      {snapshot ? <>
        <PlayTable key={snapshot.matchId} scope={scope} snapshot={presentation.displayed ?? snapshot} names={snapshot.names}
          playback={presentation.playback} feedback={presentation.feedback} reduced={presentation.reduced} diceImpact={sound.impact} cue={sound.cue}
          busy={busy || presentation.playing} error={error} send={send} rematch={rematch} edit={onEdit} controls={<>
            <button type="button" className="btn quiet play-dice-sound" aria-label="Table sound" aria-pressed={sound.enabled}
              onClick={sound.toggle}>Sound <b>{sound.enabled ? 'On' : 'Off'}</b></button>
            <label className="play-sound-level" title="Game effects volume">FX <input type="range" aria-label="Game effects volume" min="0" max="1" step=".05" value={sound.volume} onChange={(e) => sound.changeVolume(Number(e.target.value))} /></label>
            {live && <button type="button" className="btn quiet" disabled={busy || presentation.playing} onClick={() => setConfirm('restart')}>Restart match</button>}
            {live && <button type="button" className="btn danger-ghost" disabled={busy || presentation.playing} onClick={() => setConfirm('concede')}>Concede</button>}
            <button type="button" className="btn quiet" disabled={busy} onClick={() => { presentation.playback?.skip(); onEdit(); }}>Back to draft</button>
          </>} />
      </> : deck ? <>
        <div className="play-entrance">
          <Masthead eyebrow="The Afterlife / Practice table" title="Pick your matchup" sub="Local practice ◆ Best of one">
            <button type="button" className="btn quiet" disabled={busy} onClick={onEdit}>Back to draft</button>
          </Masthead>
        </div>
        <PlaySetup draft={draft!} savedDecks={savedDecks} initialRival={initialRival} initialOpponent={initialOpponent} busy={busy} error={error}
          onStart={(draft, rival, skill, key) => { pendingStart.current = { draft, rival, skill, key }; start(); }} />
      </> : <div className="panel">
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
