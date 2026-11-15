import manifest from '../../../vendor/cyberpunk-engine/card-art.json';
import { imageUrl } from '../data';
import { vaultCard } from './cardDisplay';
import { engineSlug } from './engineCards';
import type { CardView } from './protocol';

const directArt: Partial<Record<string, string>> = manifest;
const visible = Symbol('visible');
const priorities = { background: 1, next: 2, visible: 3 } as const;
const capacity = { 1: 2, 2: 4, 3: 6 };
type Priority = (typeof priorities)[keyof typeof priorities];
type Job = { requests: Map<symbol, Priority>; running: boolean };
const jobs = new Map<string, Job>();
const ready = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();
const retryAfter = new Map<string, number>();
const renderErrors = new Map<string, Set<string>>();
let active = 0;

export function tableArtSources(slug: string) {
  // The engine's N001 promo differs from the Vault catalog's Fresh Beginnings printings.
  const direct = slug === 'lucyna-kushinada-fresh-beginnings' ? undefined : directArt[engineSlug(slug)];
  return direct ? [direct, imageUrl(slug)] : [imageUrl(slug)];
}

export function tableArtSlug(card: CardView) {
  return card.zone === 'eddieArea' ? undefined : vaultCard(card)?.slug;
}

function decodeImage(src: string, priority: Priority) {
  return new Promise<boolean>(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = priority === priorities.visible ? 'high' : 'low';
    const finish = (success: boolean) => {
      clearTimeout(timeout);
      image.onload = image.onerror = null;
      if (!success) image.removeAttribute('src');
      resolve(success);
    };
    const timeout = setTimeout(() => finish(false), 6_000);
    image.onerror = () => finish(false);
    image.onload = () => {
      if (typeof image.decode === 'function') void image.decode().then(() => finish(true), () => finish(false));
      else finish(true);
    };
    image.src = src;
  });
}

async function trySources(slug: string, priority: Priority) {
  for (const src of tableArtSources(slug)) {
    if (!renderErrors.get(slug)?.has(src) && await decodeImage(src, priority)) return src;
  }
}

function notify(slug: string) {
  listeners.get(slug)?.forEach(listener => listener());
}

function drain() {
  if (typeof Image === 'undefined') return;
  while (active < capacity[priorities.visible]) {
    let choice: { slug: string; job: Job; priority: Priority } | undefined;
    for (const [slug, job] of jobs) {
      if (job.running || !job.requests.size) continue;
      const priority = Math.max(...job.requests.values()) as Priority;
      if (active < capacity[priority] && (!choice || priority > choice.priority)) choice = { slug, job, priority };
    }
    if (!choice) return;
    const { slug, job, priority } = choice;
    job.running = true;
    active++;
    void (async () => {
      let src = await trySources(slug, priority);
      // A background request may have become visible while its image was loading.
      if (!src && listeners.get(slug)?.size) {
        await new Promise(resolve => setTimeout(resolve, 750));
        if (listeners.get(slug)?.size) src = await trySources(slug, priorities.visible);
      }
      jobs.delete(slug);
      active--;
      if (src) {
        ready.set(slug, src);
        retryAfter.delete(slug);
        notify(slug);
      } else retryAfter.set(slug, Date.now() + 5_000);
      drain();
    })();
  }
}

function enqueue(slug: string, owner: symbol, priority: Priority) {
  if (ready.has(slug) || (retryAfter.get(slug) ?? 0) > Date.now()) return;
  let job = jobs.get(slug);
  if (!job) {
    job = { requests: new Map(), running: false };
    jobs.set(slug, job);
  }
  job.requests.set(owner, priority);
}

export function getTableArt(slug?: string) {
  return slug === undefined ? undefined : ready.get(slug);
}

export function subscribeTableArt(slug: string | undefined, listener: () => void) {
  if (!slug) return () => {};
  let watchers = listeners.get(slug);
  if (!watchers) {
    watchers = new Set();
    listeners.set(slug, watchers);
    // A new appearance on the table can retry a failed warm-up.
    retryAfter.delete(slug);
  }
  watchers.add(listener);
  enqueue(slug, visible, priorities.visible);
  drain();
  return () => {
    watchers.delete(listener);
    if (watchers.size) return;
    listeners.delete(slug);
    renderErrors.delete(slug);
    release(slug, visible);
  };
}

function release(slug: string, owner: symbol) {
  const job = jobs.get(slug);
  if (!job) return;
  job.requests.delete(owner);
  if (!job.running && !job.requests.size) jobs.delete(slug);
}

export function tableArtFailedToRender(slug: string, src: string) {
  if (ready.get(slug) !== src) return;
  ready.delete(slug);
  const errors = renderErrors.get(slug) ?? new Set<string>();
  errors.add(src);
  renderErrors.set(slug, errors);
  enqueue(slug, visible, priorities.visible);
  notify(slug);
  drain();
}

export function preloadArt(slugs: Iterable<string>, priority: 'background' | 'next' = 'background') {
  const owner = Symbol('preload');
  const requested = new Set(slugs);
  for (const slug of requested) enqueue(slug, owner, priorities[priority]);
  drain();
  return () => { for (const slug of requested) release(slug, owner); };
}

export function preloadFaces(cards: CardView[]) {
  return preloadArt(cards.flatMap(card => tableArtSlug(card) ?? []), 'next');
}
