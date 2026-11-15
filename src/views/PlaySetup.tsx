import { useEffect, useRef, useState } from 'react';
import { CardImg, Pip } from '../components/bits';
import { VaultSelect } from '../components/VaultSelect';
import { ViewTabs } from '../components/ui';
import { communityPopularityLabel } from '../lib/communityPopularity';
import { totalCopies, type DeckDraft } from '../lib/deckDraft';
import { preloadArt } from '../lib/play/cardArt';
import { freePlaySkillKey, rivalSkills } from '../lib/play/freePlayPreferences';
import { browseRivals, freePlayRoster, rivalCategories, rivalMatchesSearch, rivalSorts, type RivalCategory, type RivalSort } from '../lib/play/freePlayRoster';
import { DEFAULT_PLAY_DECK_KEY, curatedOpponents, deckColors, IMPORT_LIMIT, opponentIssues, readOpponentText } from '../lib/play/opponents';
import type { RivalSkill } from '../lib/play/protocol';
import type { Deck } from '../lib/store';
import { FreePlayRivalPortrait } from './FreePlayRivalPortrait';
import { FreePlayMatchup } from './FreePlayMatchup';
import './play-setup.css';

const sources = [{ id: 'curated', label: 'Curated decks' }, { id: 'saved', label: 'My decks' }, { id: 'import', label: 'Import list' }] as const;
type Source = typeof sources[number]['id'];
type RivalTileData = { key: string; deck: Deck; label: string; category: string; portrait?: (typeof freePlayRoster)[number]['portrait'] };

function initialSkill(scope: string): RivalSkill {
  try {
    const value = localStorage.getItem(freePlaySkillKey(scope)) ?? localStorage.getItem(freePlaySkillKey());
    return rivalSkills.find(skill => skill.id === value)?.id ?? 'sharp';
  } catch { return 'sharp'; }
}

function RivalTile({ row, source, selected, choose }: { row: RivalTileData; source: Source; selected: boolean; choose: (key: string) => void }) {
  const { key, deck, label, category, portrait } = row;
  const colors = deckColors(deck);
  return <label className="opponent-row" data-selected={selected}>
    <input className="sr-only" type="radio" name={`opponent-${source}`} checked={selected} onChange={() => choose(key)} />
    <span className="opponent-row-art" aria-hidden="true">
      {portrait ? <FreePlayRivalPortrait portrait={portrait} fallback={deck.legends[0]} /> : deck.legends[0] && <CardImg slug={deck.legends[0]} alt="" />}
    </span>
    <span className="opponent-row-copy"><small>{portrait?.alias ?? category}</small><strong>{deck.name}</strong>{label && <span>{label}</span>}</span>
    <span className="opponent-row-meta">
      {colors.length > 0 && <span role="img" aria-label={colors.join(' / ')}>{colors.map(color => <Pip key={color} color={color} bare />)}</span>}
      <small>{source === 'saved' && opponentIssues(deck).length ? 'Needs fixes' : `${totalCopies(deck.cards)} main`}</small>
    </span>
  </label>;
}

export function PlaySetup({ scope, draft, savedDecks, initialRival, initialOpponent, initialCuratedId, busy, onStart }: {
  scope: string; draft?: DeckDraft; savedDecks: Deck[]; initialRival?: string; initialOpponent?: Deck; initialCuratedId?: string; busy: boolean;
  onStart: (draft: DeckDraft, rival: Deck, skill: RivalSkill, key: string) => void;
}) {
  const openedCurated = initialOpponent && freePlayRoster.find(item => item.id === initialCuratedId);
  const [source, setSource] = useState<Source>('curated');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<RivalCategory>('all');
  const [sort, setSort] = useState<RivalSort>('recommended');
  const [selected, setSelected] = useState(() => openedCurated?.key ?? (initialOpponent ? 'external' :
    curatedOpponents.find(row => row.key === initialRival || row.id === initialRival)?.key ?? 'curated:smasher-surge'));
  const [playerKey, setPlayerKey] = useState(initialOpponent ? '' : draft ? 'current' : DEFAULT_PLAY_DECK_KEY);
  const [skill, setSkill] = useState(() => initialSkill(scope));
  const [text, setText] = useState('');
  const [imported, setImported] = useState<ReturnType<typeof readOpponentText>>();
  const [fileError, setFileError] = useState('');
  const file = useRef<HTMLInputElement>(null), fileRead = useRef(0);
  const matchupHeading = useRef<HTMLHeadingElement>(null);
  const saved = savedDecks.map(deck => ({ key: `saved:${deck.id}`, deck, category: 'Saved deck', label: '' }));
  const choices = [...(draft ? [{ key: 'current', deck: draft.deck, category: 'Current draft' }] : []), ...saved, ...curatedOpponents];
  const yourDeck = choices.find(choice => choice.key === playerKey)?.deck;
  const curated = freePlayRoster.find(choice => choice.key === selected);
  const rival = selected === 'mirror' ? yourDeck : selected === 'external' || selected === openedCurated?.key ? initialOpponent :
    selected === 'import' ? imported?.deck : curated?.deck ?? saved.find(choice => choice.key === selected)?.deck;
  useEffect(() => {
    if (!yourDeck || !rival) return;
    return preloadArt([...yourDeck.legends, ...Object.keys(yourDeck.cards)]);
  }, [yourDeck, rival]);

  const issues = rival ? (selected === 'import' ? imported?.issues ?? [] : opponentIssues(rival)) : [];
  const yourIssues = yourDeck ? opponentIssues(yourDeck) : [];
  const { rows: curatedRows, counts } = browseRivals(source === 'curated' ? search : '', category, sort);
  const savedRows = saved.filter(row => rivalMatchesSearch(row, source === 'saved' ? search : ''));
  const activeRows = source === 'curated' ? curatedRows : savedRows;
  const hiddenSelection = rival && (selected.startsWith('curated:') || selected.startsWith('saved:')) &&
    (source === 'import' || !activeRows.some(row => row.key === selected));
  const chooseSource = (value: Source) => { setSource(value); setSearch(''); };
  const editText = (value: string) => { fileRead.current++; setText(value); setImported(undefined); setFileError(''); if (selected === 'import') setSelected(''); };
  async function loadFile(input: HTMLInputElement) {
    const upload = input.files?.[0];
    input.value = '';
    if (!upload) return;
    const id = ++fileRead.current;
    setFileError('');
    if (upload.size > IMPORT_LIMIT) { setFileError('Choose a text decklist under 128 KB.'); return; }
    try { const value = await upload.text(); if (id === fileRead.current) editText(value); }
    catch { if (id === fileRead.current) setFileError('Could not read that file. Try pasting the decklist.'); }
  }
  const canStart = !!yourDeck && !!rival && !issues.length && !yourIssues.length && !busy;
  return <div className="opponent-workbench" aria-busy={busy}>
    <section className="panel opponent-library" aria-labelledby="opponent-library-title">
      <header className="opponent-section-head">
        <h2 id="opponent-library-title">Choose your rival</h2>
        <div className="opponent-library-actions">
          <button type="button" className="btn ghost opponent-review" onClick={() => matchupHeading.current?.focus()}>Review matchup <span aria-hidden="true">↓</span></button>
          <button type="button" className="btn ghost opponent-mirror" disabled={!yourDeck || !!yourIssues.length || busy} aria-pressed={selected === 'mirror'} onClick={() => setSelected('mirror')}><span aria-hidden="true">⇄</span> Mirror match</button>
        </div>
      </header>
      {initialOpponent && !openedCurated && <button type="button" className="btn quiet opponent-opened" disabled={busy} aria-pressed={selected === 'external'} onClick={() => setSelected('external')}>Opened deck: {initialOpponent.name}</button>}
      <ViewTabs id="opponents" label="Opponent sources" tabs={sources} value={source} onChange={chooseSource} />
      {hiddenSelection && <p className="opponent-hidden-selection" role="status"><strong>{rival.name}</strong> is still selected.</p>}
      {sources.map(tab => {
        const rows = tab.id === 'curated' ? curatedRows : savedRows;
        return <div key={tab.id} id={`opponents-panel-${tab.id}`} role="tabpanel" aria-labelledby={`opponents-tab-${tab.id}`} hidden={source !== tab.id}>
          {tab.id === 'import' ? <div className="opponent-import">
            <label htmlFor="rival-list">Paste a decklist</label><p>Vault, Melee or NetDeck text. Include full Legend names and subtitles.</p>
            <textarea id="rival-list" className="input" rows={9} value={text} maxLength={IMPORT_LIMIT} onChange={event => editText(event.target.value)} placeholder={'# Rival deck\n// Legends\n1 Jackie Welles: Pour One Out For Me\n…'} disabled={busy} />
            <div className="play-actions">
              <button className="btn" disabled={!text.trim() || busy} onClick={() => { setImported(readOpponentText(text)); setSelected('import'); }}>Preview list</button>
              <button className="btn quiet" disabled={busy} onClick={() => file.current?.click()}>Choose text file</button>
              <input ref={file} className="sr-only" type="file" accept=".txt,text/plain" onChange={event => void loadFile(event.currentTarget)} tabIndex={-1} aria-label="Import opponent text file" />
            </div>
            {fileError && <p className="play-error" role="alert">{fileError}</p>}
          </div> : <>
            <div className="opponent-search-box">
              <span aria-hidden="true" />
              <label className="sr-only" htmlFor={`rival-search-${tab.id}`}>Search {tab.label.toLowerCase()}</label>
              <input id={`rival-search-${tab.id}`} type="search" className="input opponent-search" placeholder={tab.id === 'curated' ? 'Search decks, archetypes, Legends or rivals…' : 'Search your decks or Legends…'} value={source === tab.id ? search : ''} onChange={event => setSearch(event.target.value)} />
            </div>
            {tab.id === 'curated' && <div className="opponent-filters">
              <div className="opponent-categories" role="group" aria-label="Deck category">
                {rivalCategories.map(filter => <button type="button" className="btn ghost" key={filter.id} aria-pressed={category === filter.id} onClick={() => setCategory(filter.id)}>
                  {filter.label} <span>({counts[filter.id]})</span>
                </button>)}
              </div>
              <div className="opponent-sort"><label htmlFor="opponent-sort">Sort</label>
                <VaultSelect id="opponent-sort" value={sort} onValueChange={value => setSort(value as RivalSort)} options={[...rivalSorts]} />
              </div>
            </div>}
            {tab.id === 'curated' && sort === 'popularity' && <p className="opponent-popularity">{communityPopularityLabel}</p>}
            <p className={tab.id === 'curated' ? 'sr-only' : 'opponent-result-count'} role="status">{rows.length} {rows.length === 1 ? 'deck' : 'decks'}</p>
            {rows.length ? <fieldset className="opponent-rows" disabled={busy}>
              <legend className="sr-only">Rival deck</legend>
              {rows.map(row => <RivalTile key={row.key} row={row} source={tab.id} selected={selected === row.key} choose={setSelected} />)}
            </fieldset> : <div className="opponent-empty">
              <h3>{tab.id === 'saved' && !saved.length ? 'No saved decks yet' : 'No matching decks'}</h3>
              {tab.id === 'saved' && !saved.length ? <p>Save a deck in Deck Builder, choose a curated rival, or import a list.</p> :
                <button type="button" className="btn quiet" onClick={() => { setSearch(''); if (tab.id === 'curated') setCategory('all'); }}>Clear search and filters</button>}
            </div>}
          </>}
        </div>;
      })}
    </section>
    <FreePlayMatchup heading={matchupHeading} playerKey={playerKey} playerDeck={yourDeck} choices={choices.map(choice => ({ value: choice.key, label: `${choice.deck.name} · ${choice.category}` }))}
      choosePlayer={setPlayerKey} rival={rival} curated={curated} selected={selected} skill={skill}
      chooseSkill={value => { setSkill(value); try { localStorage.setItem(freePlaySkillKey(scope), value); } catch { /* Optional. */ } }}
      playerIssues={yourIssues} rivalIssues={issues} busy={busy} canStart={canStart}
      start={() => { if (yourDeck && rival) onStart({ deck: structuredClone(yourDeck), dirty: playerKey === 'current' && !!draft?.dirty }, structuredClone(rival), skill, selected); }} />
  </div>;
}
