import type { CSSProperties } from 'react';
import { ENCOUNTERS, type EncounterId } from '../lib/play/campaign';
import './campaign-rival-portrait.css';

export function CampaignRivalPortrait({ encounter }: { encounter: EncounterId }) {
  const index = ENCOUNTERS.findIndex(contract => contract.id === encounter);
  const style = { '--portrait-x': `${index % 3 * 50}%`, '--portrait-y': `${Math.floor(index / 3) * 50}%` } as CSSProperties;
  return <span className="campaign-rival-portrait" style={style} aria-hidden="true" />;
}
