import { useSyncExternalStore } from 'react';

const query = '(max-width: 760px), (pointer: coarse) and (max-height: 540px) and (max-width: 1000px)';

function subscribe(update: () => void) {
  const viewport = window.matchMedia(query);
  viewport.addEventListener('change', update);
  return () => viewport.removeEventListener('change', update);
}

export function usePhoneTableLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
