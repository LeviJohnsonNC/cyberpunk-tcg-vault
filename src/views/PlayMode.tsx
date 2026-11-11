import { ReactiveRoom } from './ReactiveRoom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CardImg, Pip } from '../components/bits';
import { ConfirmDialog, Masthead } from '../components/ui';
import { BY_SLUG, RECOMMENDED } from '../lib/data';
import type { DeckDraft } from '../lib/deckDraft';
import { deckFromRecommended } from '../lib/decks';
import { openPlayMatch, resumePlayMatch } from '../lib/play/matchClient';
import type { MatchSnapshot, MatchSummary, Move, RivalSkill } from '../lib/play/protocol';
import { visibleCards } from '../lib/play/matchView';
import { preloadArt, preloadFaces } from '../lib/play/cardArt';
import { PlayTable } from './PlayTable';
import { useTableSound } from './useTableSound';
import { useMatchPresentation } from './useMatchPresentation';
import './play-mode.css';

const rivalPlans = [
  { id: 'smasher-surge', style: 'Aggro', note: 'Fast pressure that punishes a slow start.' },
  { id: 'chrome-syndicate', style: 'Midrange', note: 'Value and pressure from an equipped board.' },
  { id: 'lowball-netrun-plus', style: 'Tempo', note: 'Cheap Programs and fast follow-up plays.' },
  { id: 'nomad-convoy', style: 'Board control', note: 'Builds a field and trades its way ahead.' },
];
// How the rival thinks, weakest first. Every level decides from what a player could see.
const skills: { id: RivalSkill; label: string; note: string }[] = [
  { id: 'standard', label: 'Standard', note: 'Follows a fixed order of priorities. A forgiving first opponent.' },
  { id: 'sharp', label: 'Sharp', note: 'Looks a few moves ahead and weighs your likely replies.' },
  { id: 'masterful', label: 'Masterful', note: 'Plans ahead and also reads card abilities and timing.' },
];
const skillPreference = 'cptv.play.rival-skill.v1';
function savedSkill(): RivalSkill {
  try {
    const saved = localStorage.getItem(skillPreference);
    if (skills.some(({ id }) => id === saved)) return saved as RivalSkill;
  } catch { /* Use the default for this visit. */ }
  return 'sharp';
}
const rivals = rivalPlans.flatMap((plan) => {
  const list = RECOMMENDED.find(({ id }) => id === plan.id);
  return list ? [{ ...plan, list }] : [];
});

type Client = Awaited<ReturnType<typeof openPlayMatch>>;
type Confirm = 'replace' | 'restart' | 'concede';

export default function PlayMode({ scope, draft, saved, initialRival, rememberRival, onCheckpoint, onEdit }: {
  scope: string; draft?: DeckDraft; saved?: MatchSummary; initialRival?: string; rememberRival: (id: string) => void;
  onCheckpoint: (snapshot: MatchSnapshot) => void; onEdit: () => void;
}) {
  const [rivalId, setRivalId] = useState(() => rivals.some(({ id }) => id === initialRival) ? initialRival : rivals[0]?.id);
  const [resume] = useState(!draft);
  const [skill, setSkill] = useState(savedSkill);
  const [resumeAttempt, setResumeAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [busy, setBusy] = useState(resume);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<Confirm>();
  const client = useRef<Client | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const rival = rivals.find(({ id }) => id === rivalId);
  const deck = draft?.deck;
  const name = deck?.name.trim() || 'Untitled deck';
  const matchId = snapshot?.matchId;
  const presentation = useMatchPresentation(snapshot);
  const sound = useTableSound();

  useLayoutEffect(() => {
    if (matchId) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [matchId]);

  // Both lists are known at the door. Fetch their art while the player picks a rival.
  useEffect(() => {
    if (deck && !snapshot) preloadArt([...deck.legends, ...Object.keys(deck.cards), ...(rival ? [...rival.list.legends, ...Object.keys(rival.list.cards)] : [])]);
  }, [deck, rival, snapshot]);
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

  async function run(action: (isCurrent: () => boolean) => Promise<MatchSnapshot>) {
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
        onCheckpoint(next);
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
    if (!rival || !draft) return;
    if (saved && !saved.ended && !replace) {
      setConfirm('replace');
      return;
    }
    const rivalDeck = deckFromRecommended(rival.id);
    if (!rivalDeck) return;
    void run(async (isCurrent) => {
      const next = await openPlayMatch(scope, draft, rivalDeck, saved?.matchId, skill);
      if (isCurrent()) {
        client.current = next;
        rememberRival(rival.id);
      } else next.close();
      return next.opening;
    });
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
          <Masthead eyebrow="The Afterlife / Practice table" title="Play Mode" sub="Local practice ◆ Best of one">
            <button type="button" className="btn quiet" disabled={busy} onClick={onEdit}>Back to draft</button>
          </Masthead>
          <p>Bring your deck to the back room and see how it holds up against a rival crew.</p>
        </div>
        <div className="play-setup">
          <section className="panel play-rival-panel">
            <div className="play-setup-title"><span className="play-eyebrow">01 / Matchup</span><h2>Choose a rival</h2></div>
            <fieldset className="play-rivals" disabled={busy}>
              <legend className="sr-only">Rival deck</legend>
              {rivals.map(({ id, list, style, note }) => <label key={id} className="play-rival" data-selected={id === rivalId}>
                <input type="radio" name="play-rival" checked={id === rivalId} onChange={() => setRivalId(id)} />
                <span className="play-rival-copy">
                  <span className="play-eyebrow">{style} <span aria-hidden="true">◆</span> Vault list</span>
                  <strong>{list.name}</strong>
                  <span>{note}</span>
                </span>
                <span className="play-rival-art" aria-hidden="true">
                  {list.legends.slice(0, 2).map((slug) => <CardImg key={slug} slug={slug} alt="" priority />)}
                </span>
              </label>)}
            </fieldset>
            <fieldset className="play-skills" disabled={busy}>
              <legend className="play-eyebrow">Rival skill</legend>
              {skills.map(({ id, label, note }) => <label key={id} className="play-skill" data-selected={id === skill}>
                <input type="radio" name="play-skill" checked={id === skill} onChange={() => {
                  setSkill(id);
                  try { localStorage.setItem(skillPreference, id); } catch { /* Keep the choice for this visit. */ }
                }} />
                <strong>{label}</strong><span>{note}</span>
              </label>)}
              <p>Every level plays from what a player could see. None of them reads your hand or the decks.</p>
            </fieldset>
          </section>
          <aside className="panel play-loadout">
            <div className="play-setup-title"><span className="play-eyebrow">02 / Your loadout</span><h2 title={name}>{name}</h2></div>
            <div className="play-loadout-crew">{deck.legends.map((slug) => {
              const card = BY_SLUG.get(slug);
              return <div key={slug}><CardImg slug={slug} alt="" priority /><span>{card?.name ?? slug}</span></div>;
            })}</div>
            <div className="play-loadout-metrics"><b>{deck.legends.length}</b> Legends <span>◆</span> <b>{Object.values(deck.cards).reduce((n, count) => n + count, 0)}</b> main deck</div>
            <p>Practice with a snapshot of your draft. Choose how to pay as you play.</p>
            {error && <p className="play-error" role="alert">{error}</p>}
            <div className="play-loadout-footer">
              {rival && <div className="play-selected-rival">
                <span>Rival</span><strong>{rival.list.name}</strong><em>{skills.find(({ id }) => id === skill)?.label}</em>
                <span>{rival.list.colors.map((color) => <Pip key={color} color={color} bare />)}</span>
              </div>}
              <button type="button" className="btn play-start" disabled={busy || !rival} onClick={() => start()}>{busy ? 'Dealing…' : 'Start match'}</button>
            </div>
          </aside>
        </div>
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
