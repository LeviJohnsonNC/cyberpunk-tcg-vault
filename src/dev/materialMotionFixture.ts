/** A preview-only media-query fixture. Production never imports this module. */
const nativeMatchMedia = window.matchMedia.bind(window);
const query = '(prefers-reduced-motion: reduce)';
let forced = false;
const observers = new Set<MediaQueryList>();
export function installMaterialMotionFixture() {
  window.matchMedia = (media: string) => {
    const result = nativeMatchMedia(media);
    if (media !== query) return result;
    const native = Object.getOwnPropertyDescriptor(MediaQueryList.prototype, 'matches')!.get!;
    Object.defineProperty(result, 'matches', { get: () => forced || native.call(result) });
    observers.add(result);
    return result;
  };
  return () => { window.matchMedia = nativeMatchMedia; observers.clear(); forced = false; };
}
export function setMaterialReducedMotion(value: boolean) {
  forced = value;
  for (const observer of observers) observer.dispatchEvent(new MediaQueryListEvent('change', { media: query, matches: observer.matches }));
}
