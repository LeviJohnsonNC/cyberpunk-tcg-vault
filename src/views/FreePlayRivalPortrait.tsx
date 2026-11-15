import { useState } from 'react';
import { CardImg } from '../components/bits';
import type { freePlayRoster } from '../lib/play/freePlayRoster';
import { CampaignRivalPortrait } from './CampaignRivalPortrait';

type Portrait = NonNullable<(typeof freePlayRoster)[number]['portrait']>;

const artwork = import.meta.glob<string>('../assets/play/free-play-rivals/*.webp', {
  eager: true, import: 'default', query: '?url',
});

export function FreePlayRivalPortrait({ portrait, fallback }: { portrait: Portrait; fallback?: string }) {
  const [failed, setFailed] = useState(false);
  if ('encounter' in portrait) return <CampaignRivalPortrait encounter={portrait.encounter} />;
  const src = artwork[`../assets/play/free-play-rivals/${portrait.art}.webp`];
  if (!src || failed) return fallback ? <CardImg slug={fallback} alt="" /> : null;
  return <img className="free-play-rival-portrait" src={src} alt="" width={400} height={400} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
