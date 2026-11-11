import { useEffect, useRef, useState } from 'react';
import { CardImg, Pip } from '../components/bits';
import { VaultSelect } from '../components/VaultSelect';
import { ViewTabs } from '../components/ui';
import { BY_SLUG } from '../lib/data';
import { totalCopies, type DeckDraft } from '../lib/deckDraft';
import type { Deck } from '../lib/store';
import { curatedOpponents, deckColors, deckSize, IMPORT_LIMIT, opponentIssues, readOpponentText } from '../lib/play/opponents';
import type { RivalSkill } from '../lib/play/protocol';
import { preloadArt } from '../lib/play/cardArt';
import './play-setup.css';

const sources = [{ id: 'curated', label: 'Curated decks' }, { id: 'saved', label: 'My decks' }, { id: 'import', label: 'Import list' }] as const;
type Source = typeof sources[number]['id'];
const skills: { id: RivalSkill; label: string; note: string }[] = [
  { id: 'standard', label: 'Standard', note: 'A forgiving rival with straightforward priorities.' },
  { id: 'sharp', label: 'Sharp', note: 'Looks ahead and weighs likely replies.' },
  { id: 'masterful', label: 'Masterful', note: 'Looks ahead with ability-aware tactics.' },
];
const skillKey = 'cptv.play.rival-skill.v1';
function initialSkill(): RivalSkill { try { const value = localStorage.getItem(skillKey); if (skills.some(s => s.id === value)) return value as RivalSkill; } catch { /* Optional. */ } return 'sharp'; }

function Crew({ deck }: { deck: Deck }) {
  return <div className="opponent-crew">{deck.legends.map((slug, index) => <div key={`${slug}:${index}`}><CardImg slug={slug} alt="" /><span>{BY_SLUG.get(slug)?.name ?? slug}</span></div>)}</div>;
}
function ListDetails({ deck }: { deck: Deck }) {
  return <details className="opponent-list"><summary>Inspect decklist</summary><ul>{deck.legends.map((slug, i) => <li key={`${slug}:${i}`}><b>1</b> {BY_SLUG.get(slug)?.display ?? slug} <small>Legend</small></li>)}{Object.entries(deck.cards).map(([slug, count]) => <li key={slug}><b>{count}</b> {BY_SLUG.get(slug)?.display ?? slug}</li>)}</ul>{totalCopies(deck.sideboard) > 0 && <p>Sideboard is not used in best-of-one matches.</p>}</details>;
}

export function PlaySetup({ draft, savedDecks, initialRival, initialOpponent, busy, error, onStart }: {
  draft: DeckDraft; savedDecks: Deck[]; initialRival?: string; initialOpponent?: Deck; busy: boolean; error?: string;
  onStart: (draft: DeckDraft, rival: Deck, skill: RivalSkill, key: string) => void;
}) {
  const [source, setSource] = useState<Source>('curated');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(initialOpponent ? 'external' : (curatedOpponents.some(r => r.key === initialRival || r.key === `curated:${initialRival}`) ? (initialRival!.startsWith('curated:') ? initialRival! : `curated:${initialRival}`) : 'curated:smasher-surge'));
  const [playerKey, setPlayerKey] = useState(initialOpponent ? '' : 'current');
  const [skill, setSkill] = useState(initialSkill);
  const [text, setText] = useState('');
  const [imported, setImported] = useState<ReturnType<typeof readOpponentText>>();
  const [fileError, setFileError] = useState('');
  const file = useRef<HTMLInputElement>(null), fileRead = useRef(0);
  const saved = savedDecks.map(deck => ({ key: `saved:${deck.id}`, deck, category: 'Saved deck', label: deck.legends.map(slug => BY_SLUG.get(slug)?.name ?? slug).join(' / ') }));
  const choices = [{ key: 'current', deck: draft.deck, category: 'Current draft', label: '' }, ...saved, ...curatedOpponents];
  const yourDeck = choices.find(choice => choice.key === playerKey)?.deck;
  const rival = selected === 'mirror' ? yourDeck : selected === 'external' ? initialOpponent : selected === 'import' ? imported?.deck : [...curatedOpponents, ...saved].find(choice => choice.key === selected)?.deck;
  useEffect(() => {
    if (yourDeck && rival) preloadArt([...yourDeck.legends, ...Object.keys(yourDeck.cards), ...rival.legends, ...Object.keys(rival.cards)]);
  }, [yourDeck, rival]);
  const issues = rival ? (selected === 'import' ? imported?.issues ?? [] : opponentIssues(rival)) : [];
  const yourIssues = yourDeck ? opponentIssues(yourDeck) : [];
  const rows = (source === 'curated' ? curatedOpponents : saved).filter(({ deck, label }) => `${deck.name} ${label} ${deck.legends.map(s => BY_SLUG.get(s)?.display).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const chooseSource = (value: Source) => { setSource(value); setSearch(''); };
  const editText = (value: string) => { fileRead.current++; setText(value); setImported(undefined); setFileError(''); if (selected === 'import') setSelected(''); };
  async function loadFile(input: HTMLInputElement) {
    const upload = input.files?.[0]; input.value = ''; if (!upload) return;
    const id = ++fileRead.current; setFileError('');
    if (upload.size > IMPORT_LIMIT) { setFileError('Choose a text decklist under 128 KB.'); return; }
    try { const value = await upload.text(); if (id === fileRead.current) editText(value); }
    catch { if (id === fileRead.current) setFileError('Could not read that file. Try pasting the decklist.'); }
  }
  const canStart = !!yourDeck && !!rival && !issues.length && !yourIssues.length && !busy;
  return <div className="opponent-workbench" aria-busy={busy}>
    <section className="panel opponent-library" aria-labelledby="opponent-library-title">
      <header className="opponent-section-head"><div><p className="play-eyebrow">01 / Across the table</p><h2 id="opponent-library-title">Choose your rival</h2></div><button type="button" className="btn ghost" disabled={!yourDeck || !!yourIssues.length || busy} aria-pressed={selected === 'mirror'} onClick={() => setSelected('mirror')}>Mirror match</button></header>
      {initialOpponent && <button type="button" className="btn quiet opponent-opened" disabled={busy} aria-pressed={selected === 'external'} onClick={() => setSelected('external')}>Opened deck: {initialOpponent.name}</button>}
      <ViewTabs id="opponents" label="Opponent sources" tabs={sources} value={source} onChange={chooseSource} />
      {sources.map(tab => <div key={tab.id} id={`opponents-panel-${tab.id}`} role="tabpanel" aria-labelledby={`opponents-tab-${tab.id}`} hidden={source !== tab.id}>
        {tab.id === 'import' ? <div className="opponent-import">
          <label htmlFor="rival-list">Paste a decklist</label><p>Vault, Melee or NetDeck text. Include full Legend names and subtitles.</p>
          <textarea id="rival-list" className="input" rows={9} value={text} maxLength={IMPORT_LIMIT} onChange={e => editText(e.target.value)} placeholder={'# Rival deck\n// Legends\n1 Jackie Welles: Pour One Out For Me\n…'} disabled={busy} />
          <div className="play-actions"><button className="btn" disabled={!text.trim() || busy} onClick={() => { const result = readOpponentText(text); setImported(result); setSelected('import'); }}>Preview list</button><button className="btn quiet" disabled={busy} onClick={() => file.current?.click()}>Choose text file</button><input ref={file} className="sr-only" type="file" accept=".txt,text/plain" onChange={e => void loadFile(e.currentTarget)} tabIndex={-1} aria-label="Import opponent text file" /></div>
          {fileError && <p className="play-error" role="alert">{fileError}</p>}
          <p>Your saved decks and collection stay unchanged.</p>
        </div> : <>
          <label className="sr-only" htmlFor={`rival-search-${tab.id}`}>Search {tab.label.toLowerCase()}</label><input id={`rival-search-${tab.id}`} type="search" className="input opponent-search" placeholder="Search decks, archetypes or Legends…" value={source === tab.id ? search : ''} onChange={e => setSearch(e.target.value)} />
          <p className="opponent-result-count" role="status">{rows.length} {rows.length === 1 ? 'deck' : 'decks'}</p>
          {rows.length ? <fieldset className="opponent-rows" disabled={busy}><legend className="sr-only">Rival deck</legend>{rows.map(({ key, deck, label, category }) => { const invalid = opponentIssues(deck); return <label className="opponent-row" key={key} data-selected={selected === key}><input type="radio" name={`opponent-${tab.id}`} checked={selected === key} onChange={() => setSelected(key)} /><span className="opponent-row-art" aria-hidden="true">{deck.legends.slice(0, 2).map((slug,i) => <CardImg key={`${slug}:${i}`} slug={slug} alt="" />)}</span><span className="opponent-row-copy"><small>{category}</small><strong>{deck.name}</strong><span>{label}</span></span><span className="opponent-row-meta"><span>{deckColors(deck).map(color => <Pip key={color} color={color} bare />)}</span><small>{invalid.length ? 'Needs fixes' : `${totalCopies(deck.cards)} main`}</small></span></label>; })}</fieldset> : <div className="opponent-empty"><h3>{search ? 'No matching decks' : 'No saved decks yet'}</h3><p>{search ? 'Try a deck name, archetype or Legend.' : 'Save a deck in Deck Builder, choose a curated rival, or import a list.'}</p></div>}
        </>}
      </div>)}
    </section>
    <aside className="panel opponent-matchup" aria-label="Match setup">
      <p className="play-eyebrow">02 / The matchup</p>
      <div className="opponent-own-label"><label htmlFor="your-practice-deck" className="opponent-label">Your deck</label>{yourDeck && <span className="opponent-size">{deckSize(yourDeck)}</span>}</div>
      <VaultSelect id="your-practice-deck" disabled={busy} value={playerKey} placeholder="Choose your deck" onValueChange={setPlayerKey} options={choices.map(choice => ({ value: choice.key, label: `${choice.deck.name} · ${choice.category}` }))} />
      {!!yourIssues.length && <div className="opponent-errors" role="alert"><strong>Your deck needs fixes</strong><ul>{yourIssues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      {rival ? <><div className="opponent-selected-heading"><span className="play-eyebrow">{selected === 'mirror' ? 'Mirror match' : selected === 'import' ? 'Imported rival' : 'Rival deck'}</span><h2>{rival.name}</h2></div><Crew deck={rival} /><p className="opponent-size">{deckSize(rival)}</p><ListDetails deck={rival} /></> : <p className="muted">Choose a rival or preview an imported list.</p>}
      {!!issues.length && <div className="opponent-errors" role="alert"><strong>Resolve these before playing</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      <fieldset className="opponent-skills" disabled={busy}><legend>Rival skill</legend><div className="opponent-skill-options">{skills.map(option => <label key={option.id} data-selected={skill === option.id}><input type="radio" name="rival-skill" checked={skill === option.id} onChange={() => { setSkill(option.id); try { localStorage.setItem(skillKey, option.id); } catch { /* Optional. */ } }} /><strong>{option.label}</strong></label>)}</div><p className="opponent-skill-note">{skills.find(option => option.id === skill)?.note}</p></fieldset>
      {error && <p className="play-error" role="alert">{error}</p>}
      <button type="button" className="btn opponent-start" disabled={!canStart} onClick={() => { if (yourDeck && rival) onStart({ deck: structuredClone(yourDeck), dirty: playerKey === 'current' ? draft.dirty : false }, structuredClone(rival), skill, selected); }}>{busy ? 'Dealing…' : selected === 'mirror' ? 'Start mirror match' : 'Play against this deck'}</button>
      <p className="opponent-fair">All levels play fair: no peeking at your hand or deck order.</p>
      <p className="opponent-footnote">Best of one · Sideboards stay out of play.</p>
    </aside>
  </div>;
}
