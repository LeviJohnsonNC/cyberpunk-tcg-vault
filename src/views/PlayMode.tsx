import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CardImg, Pip } from '../components/bits';
import { ConfirmDialog, Masthead } from '../components/ui';
import { BY_SLUG, RECOMMENDED } from '../lib/data';
import { deckFromRecommended } from '../lib/decks';
import { openPlayMatch } from '../lib/play/matchClient';
import type { MatchSnapshot, Move } from '../lib/play/protocol';
import type { Deck } from '../lib/store';
import { PlayTable } from './PlayTable';
import './play-mode.css';

const rivalPlans = [
  { id: 'smasher-surge', style: 'Aggro', note: 'Fast pressure that punishes a slow start.' },
  { id: 'chrome-syndicate', style: 'Midrange', note: 'Value and pressure from an equipped board.' },
  { id: 'lowball-netrun-plus', style: 'Tempo', note: 'Cheap Programs and fast follow-up plays.' },
  { id: 'nomad-convoy', style: 'Board control', note: 'Builds a field and trades its way ahead.' },
];
const rivals = rivalPlans.flatMap((plan) => {
  const list = RECOMMENDED.find(({ id }) => id === plan.id);
  return list ? [{ ...plan, list }] : [];
});

type Client = Awaited<ReturnType<typeof openPlayMatch>>;
type Confirm = 'edit' | 'restart' | 'concede';

export default function PlayMode({ deck, initialRival, rememberRival, onEdit }: {
  deck: Deck; initialRival?: string; rememberRival: (id: string) => void; onEdit: () => void;
}) {
  const [rivalId, setRivalId] = useState(() => rivals.some(({ id }) => id === initialRival) ? initialRival : rivals[0]?.id);
  const [snapshot, setSnapshot] = useState<MatchSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<Confirm>();
  const client = useRef<Client | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const rival = rivals.find(({ id }) => id === rivalId);
  const name = deck.name.trim() || 'Untitled deck';
  const matchId = snapshot?.matchId;

  useLayoutEffect(() => {
    if (matchId) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [matchId]);

  useEffect(() => () => {
    generation.current++;
    client.current?.close();
    client.current = null;
  }, []);

  async function run(action: (isCurrent: () => boolean) => Promise<MatchSnapshot>) {
    if (locked.current) return;
    const current = generation.current;
    const isCurrent = () => current === generation.current;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const next = await action(isCurrent);
      if (isCurrent()) setSnapshot(next);
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'The match could not continue.');
    } finally {
      if (isCurrent()) {
        setBusy(false);
        locked.current = false;
      }
    }
  }

  function start() {
    if (!rival) return;
    const rivalDeck = deckFromRecommended(rival.id);
    if (!rivalDeck) return;
    void run(async (isCurrent) => {
      const next = await openPlayMatch(deck, rivalDeck);
      if (isCurrent()) {
        client.current = next;
        rememberRival(rival.id);
      } else next.close();
      return next.opening;
    });
  }

  function send(move: Move) {
    const current = client.current;
    if (current && snapshot) void run(() => current.move(snapshot, move));
  }

  function rematch() {
    const current = client.current;
    if (current && snapshot) void run(() => current.rematch(snapshot));
  }

  function edit() {
    if (snapshot && !snapshot.view.gameEnded) setConfirm('edit');
    else onEdit();
  }

  const live = snapshot && !snapshot.view.gameEnded;
  return (
    <section className="play-mode">
      {snapshot && rival ? <>
        <header className="play-match-header">
          <div className="play-match-identity">
            <p className="play-eyebrow">The Afterlife <span>/</span> Practice table</p>
            <h1 title={`${name} vs. ${rival.list.name}`}>{name} <span>vs.</span> {rival.list.name}</h1>
          </div>
          <div className="play-header-actions">
            {live && <button type="button" className="btn quiet" disabled={busy} onClick={() => setConfirm('restart')}>Restart match</button>}
            {live && <button type="button" className="btn danger-ghost" disabled={busy} onClick={() => setConfirm('concede')}>Concede</button>}
            <button type="button" className="btn quiet" disabled={busy} onClick={edit}>Back to draft</button>
          </div>
        </header>
        <PlayTable key={snapshot.matchId} snapshot={snapshot} names={{ player: name, rival: rival.list.name }}
          busy={busy} error={error} send={send} rematch={rematch} edit={onEdit} />
      </> : <>
        <div className="play-entrance">
          <Masthead eyebrow="The Afterlife / Practice table" title="Play Mode" sub="Local practice ◆ Best of one">
            <button type="button" className="btn quiet" disabled={busy} onClick={edit}>Back to draft</button>
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
                <span>Rival</span><strong>{rival.list.name}</strong>
                <span>{rival.list.colors.map((color) => <Pip key={color} color={color} bare />)}</span>
              </div>}
              <button type="button" className="btn play-start" disabled={busy || !rival} onClick={start}>{busy ? 'Dealing…' : 'Start match'}</button>
            </div>
          </aside>
        </div>
      </>}
      <ConfirmDialog open={!!confirm} title={confirm === 'concede' ? 'Concede this match?' : confirm === 'restart' ? 'Start a fresh match?' : 'Return to your draft?'}
        confirmLabel={confirm === 'concede' ? 'Concede match' : confirm === 'restart' ? 'Restart match' : 'Return to draft'} onCancel={() => setConfirm(undefined)}
        onConfirm={() => {
          setConfirm(undefined);
          if (confirm === 'edit') onEdit();
          if (confirm === 'restart') rematch();
          if (confirm === 'concede') send({ move: 'concede' });
        }}>
        <p>{confirm === 'concede' ? 'The rival wins this match.' : confirm === 'restart' ? 'The current match ends and both decks are shuffled again.' : 'The current match ends. Your draft is ready to edit in Deck Builder.'}</p>
      </ConfirmDialog>
    </section>
  );
}
