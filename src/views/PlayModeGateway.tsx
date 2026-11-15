import type { PlayModeId } from '../lib/playNavigation';
import { playHref } from '../lib/playNavigation';
import freePlayArt from '../assets/play/gateway-free-play.webp';
import campaignArt from '../assets/play/gateway-campaign.webp';
import './play-mode-gateway.css';

const choices = [
  { mode: 'free', name: 'Free Play', eyebrow: 'Open table', art: freePlayArt, action: 'Open table',
    description: ['Bring any deck. Pick any rival.', 'Practice without campaign stakes.'] },
  { mode: 'campaign', name: 'Campaign', eyebrow: 'Story run', art: campaignArt, action: 'Begin story',
    description: ['Start with a crew. Survive nine encounters.', 'Earn rewards and shape your run.'] },
] satisfies { mode: PlayModeId; name: string; eyebrow: string; art: string; action: string; description: string[] }[];

export function PlayModeGateway({ preparationOnly }: { preparationOnly?: boolean }) {
  return <section className="play-gateway" aria-labelledby="play-gateway-heading">
    <div className="play-gateway-inner">
      <h1 className="al-eyebrow play-gateway-heading" id="play-gateway-heading">
        <span className="al-eyebrow-mark" aria-hidden="true" />
        The Afterlife / Choose your night
      </h1>
      <div className="play-gateway-choices">
        {choices.map(({ mode, name, eyebrow, art, action, description }) => {
          const unavailable = preparationOnly && mode === 'free';
          const titleId = `play-gateway-${mode}-title`;
          const descriptionId = `play-gateway-${mode}-description`;
          const actionId = `play-gateway-${mode}-action`;
          const className = `play-gateway-choice play-gateway-choice--${mode}`;
          const panel = <>
            <span className="play-gateway-frame" aria-hidden="true">
              <span className="play-gateway-art">
                <img src={art} alt="" width="1180" height="1180" fetchPriority="high" />
              </span>
            </span>
            <div className="play-gateway-copy">
              <p className="play-gateway-eyebrow" aria-hidden="true">// {eyebrow}</p>
              <h2 className="al-title" id={titleId}>{name}<span className="al-bang">.</span></h2>
              <p className="play-gateway-description" id={descriptionId}>
                {description.map(line => <span key={line}>{line}</span>)}
              </p>
            </div>
            <span className="play-gateway-cta" id={actionId}>
              {unavailable ? 'Matches on desktop' : action}
              {!unavailable && <span className="play-gateway-arrow" aria-hidden="true">→</span>}
            </span>
          </>;
          return unavailable
            ? <article key={mode} className={className} aria-labelledby={titleId}>{panel}</article>
            : <a key={mode} className={className} href={playHref(mode)} aria-labelledby={`${titleId} ${actionId}`} aria-describedby={descriptionId}>{panel}</a>;
        })}
      </div>
    </div>
  </section>;
}
