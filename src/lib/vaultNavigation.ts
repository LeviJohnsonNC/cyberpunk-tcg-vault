import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

export const TABS = [
  { id: 'collection', label: 'Collection' },
  { id: 'prices', label: 'Price Book' },
  { id: 'builder', label: 'Deck Builder' },
  { id: 'play', label: 'Play' },
  { id: 'meta', label: 'Meta Intel' },
  { id: 'add', label: 'Add Cards' },
] as const;
export type PrimaryTab = (typeof TABS)[number]['id'];
export type TabId = PrimaryTab | 'about' | 'upgrade' | 'shared';
type Route = { tab: TabId; deck?: string };

const readHash = (): Route => {
  const [path, query] = window.location.hash.replace(/^#\/?/, '').split('?');
  const tab = path === 'about' || path === 'upgrade' || path === 'shared'
    ? path : TABS.find((item) => item.id === path)?.id ?? 'collection';
  return { tab, deck: new URLSearchParams(query).get('deck') ?? undefined };
};

const scrollKey = ({ tab, deck }: Route) => tab === 'shared' ? `shared:${deck ?? ''}` : tab;
const phone = () => window.matchMedia('(max-width: 760px)');
const subscribePhone = (update: () => void) => {
  const query = phone();
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
};

export function useVaultNavigation(scope: string, closeOverlays: () => void) {
  const mobile = useSyncExternalStore(subscribePhone, () => phone().matches);
  const [navigation, setNavigation] = useState(() => {
    const route = readHash();
    return { route, visited: new Set([route.tab]), arrival: { top: 0 } };
  });
  const currentRoute = useRef(navigation.route);
  const currentScope = useRef(scope);
  const positions = useRef(new Map<string, number>());

  useEffect(() => {
    const navigate = () => {
      const next = readHash();
      const current = currentRoute.current;
      if (next.tab === current.tab && next.deck === current.deck) return;
      if (mobile) positions.current.set(scrollKey(current), window.scrollY);
      closeOverlays();
      currentRoute.current = next;
      const fresh = next.tab === 'add' || next.tab === 'upgrade' || (next.tab === 'builder' && !!next.deck);
      const top = fresh ? 0 : positions.current.get(scrollKey(next)) ?? 0;
      setNavigation((prev) => ({ route: next, visited: new Set([...prev.visited, next.tab]), arrival: { top } }));
    };
    const restoration = window.history.scrollRestoration;
    if (mobile) window.history.scrollRestoration = 'manual';
    window.addEventListener('hashchange', navigate);
    return () => {
      window.removeEventListener('hashchange', navigate);
      if (mobile) window.history.scrollRestoration = restoration;
    };
  }, [mobile, closeOverlays]);

  useLayoutEffect(() => {
    const changedScope = currentScope.current !== scope;
    if (changedScope) {
      currentScope.current = scope;
      positions.current.clear();
    }
    if (mobile || navigation.route.tab === 'play') window.scrollTo(0, changedScope ? 0 : navigation.arrival.top);
  }, [mobile, navigation.arrival, navigation.route.tab, scope]);

  const consumeDeck = useCallback(() => {
    const current = currentRoute.current;
    if (current.tab !== 'builder' || !current.deck) return;
    const route: Route = { tab: 'builder' };
    window.history.replaceState(window.history.state, '', '#/builder');
    currentRoute.current = route;
    setNavigation((prev) => ({ ...prev, route }));
  }, []);

  return { route: navigation.route, visited: navigation.visited, mobile, consumeDeck };
}
