import { useEffect, useState } from 'react';
import { Masthead } from '../components/ui';
import { lastPlayMode, playDestination, playHref, playModes } from '../lib/playNavigation';
import { readCampaign } from '../lib/play/campaignStorage';
import { readCircuitProgress } from '../lib/play/matchStorage';
import type { MatchSummary } from '../lib/play/protocol';

export function PlayLanding({ scope, saved, matchUnavailable, mobile }: {
  scope: string; saved?: MatchSummary; matchUnavailable?: boolean; mobile?: boolean;
}) {
  const [status, setStatus] = useState<'loading' | 'choose' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    const origin = window.location.hash;
    void Promise.allSettled([readCampaign(scope), readCircuitProgress(scope)]).then(([campaign, circuit]) => {
      if (!active || window.location.hash !== origin) return;
      const campaignProgress = campaign.status === 'fulfilled' && (Boolean(campaign.value.run)
        || Object.values(campaign.value.profile.completions ?? {}).some(count => count > 0) || Boolean(campaign.value.profile.history?.length));
      const freeProgress = Boolean(saved) || circuit.status === 'fulfilled' && circuit.value.matches > 0;
      const mode = playDestination({ campaign: campaignProgress, free: freeProgress, activeMatch: Boolean(saved && !saved.ended) }, lastPlayMode(scope));
      if (mode) window.location.replace(playHref(mode));
      else setStatus(matchUnavailable || campaign.status === 'rejected' || circuit.status === 'rejected' ? 'error' : 'choose');
    });
    return () => { active = false; };
  }, [scope, saved, matchUnavailable]);

  if (status === 'loading') return <p className="callout" role="status">Checking for saved play progress…</p>;
  return <PlayModePicker mobile={mobile} error={status === 'error'} />;
}

function PlayModePicker({ mobile, error }: { mobile?: boolean; error: boolean }) {
  return <section className="panel play-landing" aria-label="Choose how to play">
    <Masthead eyebrow="The Afterlife / Open table" title="Choose how to play" />
    {error && <p role="status">Saved play progress could not be checked.</p>}
    <div className="play-landing-options">
      {playModes.map(mode => <a key={mode.id} className="btn quiet" href={playHref(mode.id)}>
        <strong>{mode.label}</strong><span>{mobile && mode.id === 'free' ? 'Matches on desktop' : mode.detail}</span>
      </a>)}
    </div>
  </section>;
}
