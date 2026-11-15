import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import art from '../../../vendor/cyberpunk-engine/card-art.json';
import supportedSlugs from '../../../vendor/cyberpunk-engine/card-slugs.json';

class ControlledImage {
  static requests: ControlledImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url = '';
  decoding = '';
  fetchPriority = '';

  set src(url: string) {
    this.url = url;
    ControlledImage.requests.push(this);
  }
  removeAttribute() {}
  async decode() {}
}

describe('Play Mode card artwork', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('Image', ControlledImage);
    ControlledImage.requests = [];
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ships a direct source for the legal catalog and resolves Vault aliases', async () => {
    expect(Object.keys(art).sort()).toEqual(supportedSlugs);
    const { tableArtSources } = await import('./cardArt');
    expect(tableArtSources('muamar-reyes-el-capita-n')[0]).toBe(art['muamar-reyes-el-capitan']);
    expect(tableArtSources('lucyna-kushinada-fresh-beginnings')).toEqual([
      expect.stringContaining('/lucyna-kushinada-fresh-beginnings/image'),
    ]);
  });

  it('reserves capacity for visible cards and publishes one decoded source to all consumers', async () => {
    const { getTableArt, preloadArt, subscribeTableArt, tableArtSources } = await import('./cardArt');
    const [backgroundA, backgroundB, foreground, stale] = supportedSlugs;
    const cancel = preloadArt([backgroundA, backgroundB, stale]);
    expect(ControlledImage.requests).toHaveLength(2);
    const first = vi.fn();
    const second = vi.fn();
    subscribeTableArt(foreground, first);
    subscribeTableArt(foreground, second);
    expect(ControlledImage.requests).toHaveLength(3);
    expect(ControlledImage.requests[2].fetchPriority).toBe('high');
    expect(getTableArt(foreground)).toBeUndefined();
    ControlledImage.requests[2].onload?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(getTableArt(foreground)).toBe(tableArtSources(foreground)[0]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    cancel();
    ControlledImage.requests[0].onload?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(ControlledImage.requests).toHaveLength(3);
  });

  it('can recover a visible card after its direct source and fallback both fail once', async () => {
    const { getTableArt, subscribeTableArt, tableArtSources } = await import('./cardArt');
    const slug = 'rita-wheeler-no-stupid-questions';
    const sources = tableArtSources(slug);
    subscribeTableArt(slug, vi.fn());
    ControlledImage.requests[0].onerror?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(ControlledImage.requests[1].url).toBe(sources[1]);
    ControlledImage.requests[1].onerror?.();
    await vi.advanceTimersByTimeAsync(750);
    expect(ControlledImage.requests[2].url).toBe(sources[0]);
    ControlledImage.requests[2].onload?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(getTableArt(slug)).toBe(sources[0]);
  });
});
