import { useId, useRef, type Ref } from 'react';
import { CardImg } from '../components/bits';
import { VaultSelect } from '../components/VaultSelect';
import { BY_SLUG } from '../lib/data';
import { totalCopies } from '../lib/deckDraft';
import { rivalSkills } from '../lib/play/freePlayPreferences';
import type { freePlayRoster } from '../lib/play/freePlayRoster';
import { deckColors, deckSize } from '../lib/play/opponents';
import type { RivalSkill } from '../lib/play/protocol';
import type { Deck } from '../lib/store';
import { CampaignRivalPortrait } from './CampaignRivalPortrait';

function DecklistDialog({ deck }: { deck: Deck }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const sections = [
    { label: 'Legends', cards: deck.legends.map(slug => [slug, 1] as const), count: deck.legends.length },
    { label: 'Main deck', cards: Object.entries(deck.cards), count: totalCopies(deck.cards) },
    { label: 'Sideboard', cards: Object.entries(deck.sideboard), count: totalCopies(deck.sideboard) },
  ];
  return <>
    <button type="button" className="opponent-inspect" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>Inspect decklist <span aria-hidden="true">↗</span></button>
    <dialog ref={dialog} className="al-dialog opponent-decklist" aria-labelledby={title}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="al-dialog-body">
        <header><h2 id={title}>{deck.name}</h2><button type="button" className="btn quiet" onClick={() => dialog.current?.close()}>Close</button></header>
        {sections.filter(section => section.cards.length).map(({ label, cards, count }) => <section key={label}>
          <h3>{label} <span>{count}</span></h3>
          {label === 'Sideboard' && <p>Sideboards stay out of best-of-one matches.</p>}
          <ul>{cards.map(([slug, copies], index) => <li key={`${slug}:${index}`}><b>{copies}×</b> {BY_SLUG.get(slug)?.display ?? slug}</li>)}</ul>
        </section>)}
      </div>
    </dialog>
  </>;
}

function DeckIssues({ title, issues }: { title: string; issues: string[] }) {
  if (!issues.length) return null;
  const list = <ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>;
  return <div className="opponent-errors" role="alert">
    <strong>{title}</strong>
    {issues.length > 4 ? <details><summary>Show {issues.length} issues</summary>{list}</details> : list}
  </div>;
}

export function FreePlayMatchup({ heading, playerKey, playerDeck, choices, choosePlayer, rival, curated, selected, skill,
  chooseSkill, playerIssues, rivalIssues, busy, canStart, start }: {
  heading: Ref<HTMLHeadingElement>;
  playerKey: string; playerDeck?: Deck; choices: { value: string; label: string }[]; choosePlayer: (key: string) => void;
  rival?: Deck; curated?: (typeof freePlayRoster)[number]; selected: string; skill: RivalSkill; chooseSkill: (skill: RivalSkill) => void;
  playerIssues: string[]; rivalIssues: string[]; busy: boolean; canStart: boolean; start: () => void;
}) {
  const label = selected === 'mirror' ? 'Mirror match' : selected === 'import' ? 'Imported rival' : selected === 'external' ? 'Opened rival' : 'Rival deck';
  const colors = rival ? deckColors(rival).join(' / ') : '';
  return <aside className="panel opponent-matchup" aria-labelledby="opponent-matchup-title" data-ready={canStart || undefined}>
    <header className="opponent-matchup-head">
      <h2 ref={heading} id="opponent-matchup-title" tabIndex={-1}>The matchup</h2>
      {canStart && <span role="status"><span aria-hidden="true">✓</span> Ready to play</span>}
    </header>
    <div className="opponent-own-label">
      <label htmlFor="your-practice-deck">Your deck</label>
      {playerDeck && <span className="opponent-size">{deckSize(playerDeck)}</span>}
    </div>
    <VaultSelect id="your-practice-deck" disabled={busy} value={playerKey} placeholder="Choose your deck" onValueChange={choosePlayer} options={choices} />
    <DeckIssues title="Your deck needs fixes" issues={playerIssues} />
    {rival ? <>
      <header className="opponent-selected-heading" key={rival.name} data-portrait={!!curated?.portrait || undefined}>
        {curated?.portrait && <CampaignRivalPortrait encounter={curated.portrait.encounter} />}
        <p className="play-eyebrow">{label}</p>
        <h3>{rival.name}</h3>
        {(colors || curated?.label) && <p className="opponent-style">{colors && <strong>{colors}</strong>}{colors && curated?.label && ' · '}{curated?.label}</p>}
      </header>
      <div className="opponent-brief" data-summary={!!curated?.summary || undefined}>
        {rival.legends.length > 0 && <ul className="opponent-crew" aria-label="Rival Legends">
          {rival.legends.map((slug, index) => <li key={`${slug}:${index}`}><CardImg slug={slug} alt={BY_SLUG.get(slug)?.display ?? slug} priority /></li>)}
        </ul>}
        {curated?.summary && <section className="opponent-intel"><h4>What to expect</h4><p>{curated.summary}</p></section>}
      </div>
      <div className="opponent-list-bar">
        <span className="opponent-size">{deckSize(rival)}</span>
        <DecklistDialog key={selected} deck={rival} />
      </div>
    </> : <p className="opponent-matchup-empty">Choose a rival or preview an imported list.</p>}
    <DeckIssues title="Resolve these before playing" issues={rivalIssues} />
    <fieldset className="opponent-skills" disabled={busy}>
      <legend>Rival difficulty</legend>
      <div className="opponent-skill-options">{rivalSkills.map(option => <label key={option.id} data-selected={skill === option.id}>
        <input type="radio" name="rival-skill" checked={skill === option.id} onChange={() => chooseSkill(option.id)} /><strong>{option.label}</strong>
      </label>)}</div>
      <p className="opponent-skill-note">{rivalSkills.find(option => option.id === skill)?.note}</p>
    </fieldset>
    <button type="button" className="btn opponent-start" disabled={!canStart} onClick={start}>
      {!busy && <span aria-hidden="true">▶</span>}
      {busy ? 'Opening the table…' : selected === 'mirror' ? 'Start mirror match' : rival ? `Play against ${rival.name}` : 'Start match'}
    </button>
  </aside>;
}
