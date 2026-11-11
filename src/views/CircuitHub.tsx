import { useState, type CSSProperties } from 'react';
import { CardImg } from '../components/bits';
import { Masthead, ViewTabs } from '../components/ui';
import { VaultSelect } from '../components/VaultSelect';
import { BY_SLUG } from '../lib/data';
import type { DeckDraft } from '../lib/deckDraft';
import type { Deck } from '../lib/store';
import { CIRCUIT_CONTRACTS, CIRCUIT_RANKS, TABLE_FINISHES, circuitMarks, contractCleared, contractUnlocked, finishUnlocked, rankIndex, skillLevel,
  type CircuitMark, type CircuitProgress, type CircuitReceipt, type TableFinish } from '../lib/play/circuit';
import { curatedOpponents, opponentIssues } from '../lib/play/opponents';
import type { RivalSkill } from '../lib/play/protocol';
import { PlaySetup } from './PlaySetup';

const tabs = [{ id: 'circuit', label: 'Contract board' }, { id: 'practice', label: 'Practice' }, { id: 'locker', label: 'Your locker' }, { id: 'record', label: 'Match record' }] as const;
type HubTab = typeof tabs[number]['id'];
const markNames: Record<CircuitMark, string> = { clear: 'Contract cleared', bonus: 'Bonus objective', masterful: 'Masterful win' };

/** Code-native enamel seal: scalable, legible, and in the same visual language as the dice. */
export function CircuitSeal({ level, small = false }: { level: number; small?: boolean }) {
  return <svg className="circuit-seal" data-small={small} viewBox="0 0 100 112" aria-hidden="true">
    <path className="seal-shadow" d="M50 3 94 27v52l-44 28L6 79V27Z" />
    <path className="seal-rim" d="m50 9 38 22v45l-38 24-38-24V31Z" />
    <path className="seal-inner" d="m50 20 28 16v33L50 87 22 69V36Z" />
    <path className="seal-cut" d="M36 34h32L56 62H28ZM43 51h28L56 78H28" />
    {Array.from({ length: Math.min(6, level + 1) }, (_, i) => <path key={i} className="seal-notch" d={`M${25 + i * 9} 92v5`} />)}
  </svg>;
}
function Marks({ marks = [] }: { marks?: CircuitMark[] }) {
  return <span className="circuit-marks" role="img" aria-label={`${marks.length} of 3 marks earned`}>{(['clear', 'bonus', 'masterful'] as const).map(mark =>
    <span key={mark} data-earned={marks.includes(mark)} title={`${markNames[mark]}${marks.includes(mark) ? ' · earned' : ''}`} aria-hidden="true">◆</span>)}</span>;
}
export function ReputationBar({ rep, before }: { rep: number; before?: number }) {
  const index = rankIndex(rep), rank = CIRCUIT_RANKS[index], next = CIRCUIT_RANKS[index + 1];
  const percent = next ? Math.min(100, (rep - rank.rep) / (next.rep - rank.rep) * 100) : 100;
  const start = before == null ? percent : next ? Math.max(0, (before - rank.rep) / (next.rep - rank.rep) * 100) : 0;
  return <div className="circuit-reputation"><div><strong>{rank.name}</strong><span>{next ? `${rep} / ${next.rep} REP` : `${rep} REP · Top rank`}</span></div>
    <div className="circuit-rep-track" role="progressbar" aria-label={`Reputation toward ${next?.name ?? rank.name}`} aria-valuenow={rep} aria-valuemin={rank.rep} aria-valuemax={next?.rep ?? rep}>
      <span style={{ '--rep-from': `${start}%`, width: `${percent}%` } as CSSProperties} data-animate={before != null} />
    </div><small>{next ? `${next.rep - rep} REP to ${next.name}` : rank.line}</small>
  </div>;
}

export function CircuitPayout({ receipt }: { receipt: CircuitReceipt }) {
  const promotion = receipt.rankAfter > receipt.rankBefore;
  const contract = CIRCUIT_CONTRACTS.find(item => item.id === receipt.contractId);
  return <section className="circuit-payout" aria-label="Circuit rewards" data-promotion={promotion}>
    <div className="circuit-payout-head"><CircuitSeal level={receipt.rankAfter} small /><div><p className="play-eyebrow">{promotion ? 'New rank earned' : receipt.marks.includes('clear') ? 'Contract closed' : 'Afterlife Circuit'}</p>
      <h3>{promotion ? CIRCUIT_RANKS[receipt.rankAfter].name : receipt.marks.includes('clear') ? contract?.title : 'Your reputation'}</h3></div><strong className="circuit-rep-earned">+{receipt.earned}<small>REP</small></strong></div>
    <ReputationBar rep={receipt.repAfter} before={receipt.repBefore} />
    {receipt.marks.length > 0 && <div className="circuit-earned-marks">{receipt.marks.map((mark, i) => <span key={mark} style={{ '--stamp-delay': `${i * 120}ms` } as CSSProperties}>◆ {markNames[mark]}</span>)}</div>}
    {receipt.unlocks.length > 0 && <p className="circuit-unlock">Unlocked in your locker: <strong>{receipt.unlocks.map(id => TABLE_FINISHES.find(finish => finish.id === id)!.name).join(' · ')}</strong></p>}
    <details className="circuit-payout-detail"><summary>Reward breakdown</summary><p>Match {receipt.baseRep} · First clear {receipt.contractRep} · New marks {receipt.markRep} REP. Rewards are saved automatically. Conceded matches earn no REP.</p></details>
  </section>;
}

function Locker({ progress, busy, equip }: { progress: CircuitProgress; busy: boolean; equip: (finish: TableFinish) => void }) {
  return <section className="circuit-locker" aria-label="Table finishes"><div className="circuit-section-heading"><div><p className="play-eyebrow">Earned, not bought</p><h2>Make the table yours.</h2></div><p>Cosmetic finishes. Same cards. Same rules.</p></div>
    <div className="circuit-finish-grid">{TABLE_FINISHES.map((finish, index) => { const open = finishUnlocked(progress, finish.id), equipped = progress.finish === finish.id; return <article key={finish.id} className="circuit-finish" data-finish={finish.id} data-locked={!open}>
      <div className="circuit-finish-preview"><span className="circuit-mini-mat"><i /><i /><i /></span><CircuitSeal level={index} /><span>{open ? equipped ? 'Equipped' : 'Unlocked' : 'Locked'}</span></div>
      <h3>{finish.name}</h3><p>{finish.note}</p><small>{finish.requirement}</small>
      <button type="button" className={`btn ${equipped ? 'quiet' : 'ghost'}`} disabled={!open || equipped || busy} onClick={() => equip(finish.id)}>{equipped ? 'On your table' : open ? `Equip ${finish.name}` : 'Keep climbing'}</button>
    </article>; })}</div>
    <div className="circuit-trophy-case"><div><p className="play-eyebrow">The six seals</p><h3>Your contract collection</h3></div>{CIRCUIT_CONTRACTS.map((contract, index) => <div key={contract.id} data-earned={contractCleared(progress, contract.id)}><CircuitSeal level={index} small /><strong>{contract.title}</strong><Marks marks={progress.contracts[contract.id]} /></div>)}</div>
  </section>;
}

function Record({ progress }: { progress: CircuitProgress }) {
  return <section className="circuit-record" aria-label="Match record"><div className="circuit-section-heading"><div><p className="play-eyebrow">Your nights at the table</p><h2>The record.</h2></div><p>Most recent 50 matches. Lifetime totals stay.</p></div>
    <dl className="circuit-record-stats">{[['Played', progress.matches], ['Won', progress.wins], ['Lost', progress.losses], ['Drawn', progress.draws], ['Best win streak', progress.bestStreak]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {progress.history.length ? <ol className="circuit-history">{progress.history.map(result => <li key={result.matchId} data-outcome={result.outcome}>
      <span className="circuit-outcome">{result.outcome === 'win' ? 'W' : result.outcome === 'loss' ? 'L' : 'D'}</span>
      <div><strong>{result.player}<span> vs. </span>{result.rival}</strong><small>{result.receipt.contractId ? CIRCUIT_CONTRACTS.find(item => item.id === result.receipt.contractId)?.title : 'Practice'} · {result.skill} · {result.turns} turns{result.conceded ? ' · Conceded' : ''}</small></div>
      <span className="circuit-history-score">{result.gigs} : {result.rivalGigs}<small>Gigs</small></span><b>+{result.receipt.earned} REP</b><time dateTime={new Date(result.finishedAt).toISOString()}>{new Date(result.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
    </li>)}</ol> : <div className="circuit-empty-record"><CircuitSeal level={0} /><h3>First night. Clean slate.</h3><p>Your finished matches will appear here. Pick a contract or warm up in Practice.</p></div>}
  </section>;
}

export function CircuitHub({ progress, draft, savedDecks, initialRival, initialOpponent, busy, error, onStart, onResume, onEdit, equip }: {
  progress: CircuitProgress; draft: DeckDraft; savedDecks: Deck[]; initialRival?: string; initialOpponent?: Deck; busy: boolean; error?: string;
  onStart: (draft: DeckDraft, rival: Deck, skill: RivalSkill, key: string, contractId?: string) => void;
  onResume?: () => void; onEdit: () => void; equip: (finish: TableFinish) => void;
}) {
  const [tab, setTab] = useState<HubTab>(initialOpponent ? 'practice' : 'circuit');
  const [selected, setSelected] = useState(() => CIRCUIT_CONTRACTS.find(contract => !contractCleared(progress, contract.id))?.id ?? CIRCUIT_CONTRACTS[0].id);
  const [playerKey, setPlayerKey] = useState(opponentIssues(draft.deck).length ? 'curated:heist-reloaded' : 'current');
  const [masterful, setMasterful] = useState(false);
  const contract = CIRCUIT_CONTRACTS.find(item => item.id === selected)!;
  const rival = curatedOpponents.find(item => item.key === `curated:${contract.rival}`)!;
  const choices = [{ key: 'current', deck: draft.deck, category: 'Current draft' }, ...savedDecks.map(deck => ({ key: `saved:${deck.id}`, deck, category: 'Saved deck' })), ...curatedOpponents];
  const yourDeck = choices.find(choice => choice.key === playerKey)?.deck;
  const issues = yourDeck ? opponentIssues(yourDeck) : ['Choose a deck.'];
  const open = contractUnlocked(progress, contract.id), cleared = contractCleared(progress, contract.id);
  const skill = masterful || contract.skill === 'masterful' ? 'masterful' : contract.skill;
  const rank = rankIndex(progress.rep), marks = circuitMarks(progress), clears = CIRCUIT_CONTRACTS.filter(item => contractCleared(progress, item.id)).length;
  const contractIndex = CIRCUIT_CONTRACTS.indexOf(contract);
  return <div className="circuit-hub">
    <header className="circuit-hero"><Masthead eyebrow="The Afterlife / Your name on the door" title="Afterlife Circuit" sub="Six contracts. Eighteen marks. Earn your seat." />
      <div className="circuit-hero-actions">{onResume && <button type="button" className="btn" disabled={busy} onClick={onResume}>Return to match</button>}<button type="button" className="btn quiet" disabled={busy} onClick={onEdit}>Deck Builder</button></div>
      <div className="circuit-credential"><CircuitSeal level={rank} /><div><span>Current standing</span><strong>{CIRCUIT_RANKS[rank].name}</strong><small>{CIRCUIT_RANKS[rank].line}</small></div></div>
    </header>
    <div className="circuit-standing"><ReputationBar rep={progress.rep} /><dl><div><dt>Contracts</dt><dd>{clears}<small>/6</small></dd></div><div><dt>Marks</dt><dd>{marks}<small>/18</small></dd></div><div><dt>Wins</dt><dd>{progress.wins}</dd></div><div><dt>Win streak</dt><dd>{progress.streak}</dd></div></dl></div>
    <ViewTabs id="circuit-hub" label="Play Mode" tabs={tabs} value={tab} onChange={setTab} />
    {error && <p className="play-error" role="alert">{error}</p>}
    <div id={`circuit-hub-panel-${tab}`} role="tabpanel" aria-labelledby={`circuit-hub-tab-${tab}`}>
      {tab === 'circuit' && <div className="circuit-board">
        <section className="circuit-route" aria-label="Contracts">
          <div className="circuit-section-heading"><div><p className="play-eyebrow">The house list</p><h2>{clears === 6 ? 'The room is yours.' : 'Your next move.'}</h2></div><span>{clears === 6 ? `${18 - marks} marks left to master` : 'Clear a job to open the next.'}</span></div>
          <div className="circuit-acts">{[0, 1, 2].map(act => <section className="circuit-act" key={act}><h3>{CIRCUIT_CONTRACTS[act * 2].act}</h3>{CIRCUIT_CONTRACTS.slice(act * 2, act * 2 + 2).map((item, i) => {
            const unlocked = contractUnlocked(progress, item.id), done = contractCleared(progress, item.id);
            const deck = curatedOpponents.find(opponent => opponent.key === `curated:${item.rival}`)!.deck;
            return <button type="button" key={item.id} className="circuit-contract" data-selected={selected === item.id} data-locked={!unlocked} data-cleared={done} aria-pressed={selected === item.id} aria-label={`${item.title}${done ? ', cleared' : unlocked ? ', available' : ', locked'}`} onClick={() => { setSelected(item.id); setMasterful(false); }}>
              <CardImg slug={deck.legends[0]} alt="" /><span className="circuit-contract-number">0{act * 2 + i + 1}</span><span className="circuit-contract-place">{item.location}</span><strong>{item.title}</strong><span className="circuit-contract-status">{done ? 'Contract closed' : unlocked ? `${item.skill} table` : 'Locked'}</span><Marks marks={progress.contracts[item.id]} />
            </button>;
          })}</section>)}</div>
          <div className="circuit-house-note"><span>◆</span><p>Three marks per job: <strong>win, bonus objective, Masterful win.</strong> Replay to collect the rest. You keep every mark you earn.</p></div>
          <details className="circuit-how"><summary>How reputation works</summary><p>Wins earn 75 / 100 / 125 REP at Standard / Sharp / Masterful. A finished loss or draw earns 25; a concession earns none. Each first contract clear adds 100, its first bonus mark adds 50, and its first Masterful mark adds 75. Practice also earns match REP. Ranks never go down.</p></details>
        </section>
        <aside className="circuit-brief" aria-label="Selected contract" key={selected}>
          <div className="circuit-brief-ticket"><span>Contract 0{contractIndex + 1}</span><Marks marks={progress.contracts[contract.id]} /></div>
          <p className="play-eyebrow">{contract.location} / {skill} table</p><h2>{contract.title}</h2><p className="circuit-hook">{contract.hook}</p>
          <p className="circuit-rival-name">Rival <strong>{rival.deck.name}</strong></p>
          {open ? <><label className="circuit-deck-label" htmlFor="circuit-player-deck">Your deck</label><VaultSelect id="circuit-player-deck" value={playerKey} disabled={busy} onValueChange={setPlayerKey} options={choices.map(choice => ({ value: choice.key, label: `${choice.deck.name} · ${choice.category}` }))} />
            {issues.length > 0 && <p className="play-error" role="alert">{issues.join(' ')}</p>}
            <button type="button" className="btn circuit-start" disabled={busy || !!issues.length || !yourDeck} onClick={() => { if (yourDeck) onStart({ deck: structuredClone(yourDeck), dirty: playerKey === 'current' ? draft.dirty : false }, structuredClone(rival.deck), skill, rival.key, contract.id); }}>{busy ? 'Opening the table…' : cleared ? 'Run it back' : 'Take the contract'} <span aria-hidden="true">↗</span></button>
            {skillLevel(contract.skill) < 2 && <label className="circuit-masterful"><input type="checkbox" checked={masterful} disabled={busy} onChange={e => setMasterful(e.target.checked)} /><span>Raise the stakes <small>Masterful rival · earn the third mark with a win</small></span></label>}
          </> : <div className="circuit-locked-note"><strong>Earn your way in.</strong><p>Clear {CIRCUIT_CONTRACTS[contractIndex - 1]?.title} to open this table.</p><button className="btn ghost" onClick={() => setSelected(CIRCUIT_CONTRACTS.find(item => !contractCleared(progress, item.id))!.id)}>Go to your next contract</button></div>}
          <div className="circuit-rival"><div>{rival.deck.legends.map(slug => <CardImg key={slug} slug={slug} alt={BY_SLUG.get(slug)?.display ?? slug} priority />)}</div></div>
          <div className="circuit-bonus"><span>◆ Bonus mark</span><p>{contract.bonus}</p></div>
          <details className="circuit-briefing"><summary>Read the briefing</summary><p>{contract.briefing}</p><p>All rival levels play from public information. Standard rules, best of one. No card or stat bonuses.</p></details>
        </aside>
      </div>}
      {tab === 'practice' && <PlaySetup draft={draft} savedDecks={savedDecks} initialRival={initialRival} initialOpponent={initialOpponent} busy={busy} onStart={onStart} />}
      {tab === 'locker' && <Locker progress={progress} busy={busy} equip={equip} />}
      {tab === 'record' && <Record progress={progress} />}
    </div>
    <p className="circuit-local-note">Circuit progress is saved in this browser, separately for each Vault. It is not cloud-synced. Clearing browser data removes it.</p>
  </div>;
}
