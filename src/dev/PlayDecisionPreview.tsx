import { useState } from 'react';
import { PlayTable } from '../views/PlayTable';
import { useMatchPresentation } from '../views/useMatchPresentation';
import { CampaignRivalSeat } from '../views/CampaignRivalDossier';
import { createDecisionFixture, decisionFixtures, decisionSetup, resumeDecisionFixture, saveDecisionFixture, type DecisionFixture } from './decisionFixtures';
import type { Move } from '../lib/play/protocol';
import '../views/play-tactics.css';
import '../views/campaign.css';
import './play-decision-preview.css';

export function PlayDecisionPreview() {
  const [fixture, setFixture] = useState(() => resumeDecisionFixture());
  const [name, setName] = useState<DecisionFixture>('Turn order');
  const [expanded, setExpanded] = useState(true);
  const [campaign, setCampaign] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [error, setError] = useState('');
  const [lastMove, setLastMove] = useState('');
  const presentation = useMatchPresentation(fixture.snapshot);
  function load(next: DecisionFixture) {
    try { const nextFixture = createDecisionFixture(next); saveDecisionFixture(nextFixture.session); setFixture(nextFixture); setName(next); setError(''); setLastMove(''); }
    catch (cause) { setError(String(cause)); }
  }
  function send(move: Move) {
    try {
      const snapshot = fixture.session.move(fixture.snapshot.view.stateID, move);
      saveDecisionFixture(fixture.session); setFixture({ ...fixture, snapshot }); setError(''); setLastMove(move.move);
    } catch (cause) { setError(String(cause)); }
  }
  const snapshot = reduced ? fixture.snapshot : presentation.displayed!;
  return <div className="decision-preview" data-reduced={reduced || undefined}>
    <nav className="decision-preview-tools" aria-label="Decision fixtures">
      <button className="btn quiet" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide test controls' : 'Show test controls'}</button>
      {expanded && <><strong>Engine fixtures · isolated test saves</strong><label>Position <select value={name} onChange={e => load(e.target.value as DecisionFixture)}>{decisionFixtures.map(item => <option key={item}>{item}</option>)}</select></label>
        <button className="btn quiet" onClick={() => load(name)}>Reset fixture</button><button className="btn quiet" onClick={() => { setFixture(resumeDecisionFixture()); setError(''); }}>Resume saved fixture</button>
        <label><input type="checkbox" checked={campaign} onChange={e => setCampaign(e.target.checked)} />Campaign presentation</label>
        <label><input type="checkbox" checked={reduced} onChange={e => { presentation.playback?.skip(); setReduced(e.target.checked); }} />Reduced motion</label>
        <span role="status">{error || lastMove}</span></>}
    </nav>
    <div className="play-mode"><PlayTable scope="qa:command-bar" snapshot={snapshot} names={snapshot.names} busy={!reduced && presentation.playing}
      error={error || undefined} send={send} reduced={reduced || presentation.reduced} playback={reduced ? undefined : presentation.playback} feedback={presentation.feedback}
      rematch={() => load('Turn order')} edit={() => load('Main turn')}
      navigation={<button className="btn quiet" onClick={() => load('Main turn')}>{campaign ? 'Campaign board' : 'Free Play'}</button>}
      campaign={campaign ? { encounter: 'chrome-debt', title: 'Chrome Debt', act: 1, dialogue: true, continueLabel: 'Continue story', next: 'Test fixture',
        rival: <CampaignRivalSeat encounter="chrome-debt" starter="the-heist" legends={decisionSetup.rival.legends.map(slug => ({ slug }))}
          inspect={() => {}} dialogue quote={{ text: 'Please sit. The clock has been running.', moment: 'intro', sequence: 1 }} toggle={() => {}} /> } : undefined} />
    </div>
  </div>;
}
