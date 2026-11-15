export const playModes = [
  { id: 'campaign', label: 'Campaign', detail: 'Play a nine-contract story run' },
  { id: 'free', label: 'Free Play', detail: 'Pick a rival and play a match' },
] as const;

export type PlayModeId = (typeof playModes)[number]['id'];

export function asPlayMode(value: string | null) {
  return value === 'campaign' || value === 'free' ? value : undefined;
}

export function playHref(mode?: PlayModeId, match?: string) {
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  if (match) params.set('match', match);
  return `#/play${params.size ? `?${params}` : ''}`;
}

const modeKey = (scope: string) => `cptv.playMode:${scope}`;

export function lastPlayMode(scope: string) {
  try { return asPlayMode(localStorage.getItem(modeKey(scope))); } catch { return undefined; }
}

export function rememberPlayMode(scope: string, mode: PlayModeId) {
  try { localStorage.setItem(modeKey(scope), mode); } catch { /* Optional preference. */ }
}

export function playDestination(progress: { campaign: boolean; free: boolean; activeMatch: boolean }, last?: PlayModeId) {
  if (!progress.campaign && !progress.free) return undefined;
  return last ?? (progress.activeMatch || !progress.campaign ? 'free' : 'campaign');
}
