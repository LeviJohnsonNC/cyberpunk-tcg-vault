import { describe, expect, it } from 'vitest';
import { asPlayMode, playDestination, playHref } from './playNavigation';

describe('Play navigation', () => {
  it('opens the picker when neither mode has progress even if a mode was previously visited', () => {
    expect(playDestination({ campaign: false, free: false, activeMatch: false }, 'free')).toBeUndefined();
  });

  it('honours the last visited mode once either mode has progress', () => {
    const progress = { campaign: false, free: true, activeMatch: true };
    expect(playDestination(progress, 'campaign')).toBe('campaign');
    expect(playDestination({ campaign: true, free: false, activeMatch: false }, 'free')).toBe('free');
    expect(playDestination(progress)).toBe('free');
    expect(playDestination({ campaign: true, free: true, activeMatch: false })).toBe('campaign');
    expect(playDestination({ campaign: false, free: true, activeMatch: false })).toBe('free');
  });

  it('keeps explicit mode and match links distinct from the default entry', () => {
    expect(playHref()).toBe('#/play');
    expect(playHref('campaign')).toBe('#/play?mode=campaign');
    expect(playHref('free', 'match/7')).toBe('#/play?mode=free&match=match%2F7');
    expect(asPlayMode('unknown')).toBeUndefined();
  });
});
