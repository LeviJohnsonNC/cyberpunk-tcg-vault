import { useState, useSyncExternalStore } from 'react';
import { VaultSelect } from '../components/VaultSelect';
import { PhoneTable } from '../views/PhoneTable';
import { PlayTable } from '../views/PlayTable';
import { useMatchPresentation } from '../views/useMatchPresentation';
import { CampaignRivalSeat } from '../views/CampaignRivalDossier';
import { createDecisionFixture, decisionFixtures, decisionSetup, resumeDecisionFixture, saveDecisionFixture, type DecisionFixture } from './decisionFixtures';
import type { Move } from '../lib/play/protocol';
import '../views/play-tactics.css';
import '../views/campaign.css';
import './play-decision-preview.css';

const handset = window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 540px) and (max-width: 1000px)');
function subscribeHandset(update: () => void) {
  handset.addEventListener('change', update);
  return () => handset.removeEventListener('change', update);
}

type Position = ReturnType<typeof createDecisionFixture>;

function restore(initial: DecisionFixture, current?: Position) {
  try {
    const saved = resumeDecisionFixture(initial);
    if (saved) return { ...saved, storageNotice: '' };
    if (current) return { ...current, storageNotice: 'No saved position. Your current table is still open.' };
  } catch {
    if (current) return { ...current, storageNotice: 'Couldn’t read the saved position. Your current table is still open.' };
    return { ...createDecisionFixture(initial), storageNotice: 'Couldn’t read the saved position. Opened a fresh table.' };
  }
  return { ...createDecisionFixture(initial), storageNotice: '' };
}

export function PlayDecisionPreview({ initial = 'Turn order' }: { initial?: DecisionFixture }) {
  const phone = useSyncExternalStore(subscribeHandset, () => handset.matches);
  const [fixture, setFixture] = useState(() => restore(initial));
  const [name, setName] = useState<DecisionFixture>(initial);
  const [expanded, setExpanded] = useState(!phone);
  const [campaign, setCampaign] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [error, setError] = useState('');
  const [lastMove, setLastMove] = useState('');
  const presentation = useMatchPresentation(fixture.snapshot);
  function display(next: Position, positionName: DecisionFixture) {
    let storageNotice = '';
    try { saveDecisionFixture(next.session, positionName); }
    catch { storageNotice = 'Couldn’t save this position. You can keep playing in this tab.'; }
    setFixture({ ...next, storageNotice });
    setError('');
  }
  function load(next: DecisionFixture) {
    try {
      display(createDecisionFixture(next), next);
      if (next !== name) {
        const url = new URL(window.location.href);
        url.searchParams.set('decisions', next);
        window.history.replaceState(window.history.state, '', url);
        setName(next);
      }
      setLastMove('');
    }
    catch (cause) { setError(String(cause)); }
  }
  function send(move: Move) {
    try {
      const snapshot = fixture.session.move(fixture.snapshot.view.stateID, move);
      display({ session: fixture.session, snapshot }, name);
      setLastMove(move.move);
    } catch (cause) { setError(String(cause)); }
  }
  const snapshot = reduced ? fixture.snapshot : presentation.displayed!;
  return <div className="decision-preview" data-reduced={reduced || undefined}>
    <nav className="decision-preview-tools" aria-label="Decision fixtures">
      <button className="btn quiet" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide test controls' : 'Show test controls'}</button>
      {fixture.storageNotice && <span role="status">{fixture.storageNotice}</span>}
      {expanded && <><strong>Engine fixtures · isolated test saves</strong>
        <label htmlFor="qa-position">Position <VaultSelect id="qa-position" value={name} onValueChange={value => load(value as DecisionFixture)}
          options={decisionFixtures.map(item => ({ value: item, label: item }))} /></label>
        <button className="btn quiet" onClick={() => load(name)}>Reset fixture</button><button className="btn quiet" onClick={() => { setFixture(restore(name, fixture)); setError(''); setLastMove(''); }}>Resume saved fixture</button>
        <label><input type="checkbox" checked={campaign} onChange={e => setCampaign(e.target.checked)} />Campaign presentation</label>
        <label><input type="checkbox" checked={reduced} onChange={e => { presentation.playback?.skip(); setReduced(e.target.checked); }} />Reduced motion</label>
        <span role="status">{error || lastMove}</span></>}
    </nav>
    <div className="play-mode"><PlayTable key={name} coachSource={()=>({fixture:{setup:decisionSetup,checkpoint:fixture.session.checkpoint()}})} phoneLayout={phone ? PhoneTable : undefined} scope={`qa:command-bar:${name}`} snapshot={snapshot} names={snapshot.names} busy={!reduced && presentation.playing}
      error={error || undefined} send={send} reduced={reduced || presentation.reduced} playback={reduced ? undefined : presentation.playback} feedback={presentation.feedback} quick={presentation.quick} togglePace={presentation.togglePace}
      rematch={() => load('Turn order')} edit={() => load('Main turn')}
      navigation={<button className="btn quiet" onClick={() => load('Main turn')}>{campaign ? 'Campaign board' : 'Free Play'}</button>}
      campaign={campaign ? { encounter: 'chrome-debt', title: 'Chrome Debt', act: 1, dialogue: true, continueLabel: 'Continue story', next: 'Test fixture',
        rival: <CampaignRivalSeat encounter="chrome-debt" starter="the-heist" legends={decisionSetup.rival.legends.map(slug => ({ slug }))}
          inspect={() => {}} dialogue quote={{ text: 'Please sit. The clock has been running.', moment: 'intro', sequence: 1 }} toggle={() => {}} /> } : undefined} />
    </div>
  </div>;
}
