import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CardView } from '../lib/play/protocol';
import { pointerRelease, type PointerRelease, type PointerSample } from '../lib/play/diceThrow';
import type { Destination } from '../lib/play/matchInteraction';

export interface TableDrag { card: CardView; x: number; y: number; destination?: Destination; width: number; height: number; originX: number; originY: number; grabX: number; grabY: number; tilt: number }

function destinationsAt(x: number, y: number): Destination[] {
  const result: Destination[] = [];
  for (const element of document.elementsFromPoint(x, y)) {
    const card = element.closest<HTMLElement>('[data-board-card]') ?? element.closest('.play-card-shell')?.querySelector<HTMLElement>('[data-board-card]');
    if (card) result.push({ key: card.dataset.dropZone ?? 'card', cardId: card.dataset.boardCard });
    const zone = element.closest<HTMLElement>('[data-drop-zone]');
    if (zone) result.push({ key: zone.dataset.dropZone! });
  }
  return result;
}

export function useTableDrag({ stateKey, enabled, reduced, eligible, accept, drop, begin, rejected }: {
  stateKey: string; enabled: boolean; reduced: boolean;
  eligible: (card: CardView) => boolean;
  accept: (card: CardView, destination: Destination) => boolean;
  drop: (card: CardView, destination: Destination, release: PointerRelease, held?: TableDrag) => boolean;
  begin: () => void; rejected: () => void;
}) {
  const [drag, setDrag] = useState<TableDrag>();
  const [returning, setReturning] = useState<{ key: string; drag: TableDrag; left: number; top: number; rotation: number }>();
  const live = useRef({ stateKey, enabled, reduced, eligible, accept, drop, begin, rejected });
  useEffect(() => { live.current = { stateKey, enabled, reduced, eligible, accept, drop, begin, rejected }; });
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const suppress = useRef(false);
  useEffect(() => {
    cleanup.current?.();
  }, [stateKey, enabled]);
  useEffect(() => () => cleanup.current?.(), []);

  function cancel() { cleanup.current?.(); setReturning(undefined); }
  function start(event: ReactPointerEvent<HTMLElement>, card: CardView) {
    if (!enabled || !eligible(card) || event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return;
    const source = event.currentTarget;
    const key = stateKey;
    const origin = { x: event.clientX, y: event.clientY };
    setReturning(undefined);
    const face = source.querySelector<HTMLElement>('.play-card-art') ?? source;
    const rect = face.getBoundingClientRect();
    const width = rect.width;
    const grabX = (origin.x - rect.left) / (rect.width || 1);
    const grabY = (origin.y - rect.top) / (rect.height || 1);
    let lastX = origin.x, lastTime = performance.now(), tilt = 0;
    let held: TableDrag | undefined;
    let moved = false;
    let point = origin;
    const samples: PointerSample[] = [{ ...origin, time: event.timeStamp }];
    let target: Destination | undefined;
    let frame = 0;
    function valid() { return live.current.enabled && live.current.stateKey === key; }
    function finish() {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', abort);
      document.removeEventListener('visibilitychange', abort);
      if (source.hasPointerCapture(event.pointerId)) source.releasePointerCapture(event.pointerId);
      if (moved) { suppress.current = true; window.setTimeout(() => { suppress.current = false; }, 0); }
      setDrag(undefined);
      cleanup.current = undefined;
    }
    function returnToSlot() {
      if (!live.current.reduced && held && source.isConnected && source.matches('[data-board-card]')) {
        const home = face.getBoundingClientRect();
        const transform = getComputedStyle(source.closest('.play-card-shell') ?? source).rotate;
        setReturning({ key, drag: held, left: home.left, top: home.top, rotation: parseFloat(transform) || 0 });
      }
      finish();
    }
    function abort() { finish(); }
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); returnToSlot(); } }
    function tick(now: number) {
      if (!valid()) { finish(); return; }
      const row = document.elementsFromPoint(point.x, point.y).map((el) => el.closest<HTMLElement>('.play-card-row,.play-eddie-row')).find(Boolean);
      if (row && row.scrollWidth > row.clientWidth) {
        const box = row.getBoundingClientRect();
        const dx = point.x < box.left + 35 ? -9 : point.x > box.right - 35 ? 9 : 0;
        row.scrollLeft += dx;
      }
      if (point.y < 60) window.scrollBy(0, -7);
      else if (point.y > innerHeight - 45) window.scrollBy(0, 7);
      target = destinationsAt(point.x, point.y).find((destination) => live.current.accept(card, destination));
      const sourceNow = source.getBoundingClientRect();
      const elapsed = Math.max(1, now - lastTime);
      const lean = target || live.current.reduced ? 0 : Math.max(-9, Math.min(9, 7 * (point.x - lastX) / elapsed));
      tilt += (lean - tilt) * (1 - Math.exp(-elapsed / 48));
      lastX = point.x; lastTime = now;
      const angle = Math.round(tilt * 10) / 10;
      const originX = sourceNow.x + sourceNow.width / 2, originY = sourceNow.y + sourceNow.height / 2;
      if (!held || held.x !== point.x || held.y !== point.y || held.tilt !== angle
        || held.destination?.key !== target?.key || held.destination?.cardId !== target?.cardId
        || held.originX !== originX || held.originY !== originY) {
        held = { card, x: point.x, y: point.y, width, height: rect.height, grabX, grabY, tilt: angle, originX, originY, destination: target };
        setDrag(held);
      }
      frame = requestAnimationFrame(tick);
    }
    function move(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return;
      point = { x: e.clientX, y: e.clientY };
      for (const sample of e.getCoalescedEvents?.() ?? [])
        samples.push({ x: sample.clientX, y: sample.clientY, time: sample.timeStamp });
      samples.push({ ...point, time: e.timeStamp });
      if (samples.length > 64) samples.splice(0, samples.length - 64);
      if (!moved && Math.hypot(point.x - origin.x, point.y - origin.y) >= 6) {
        moved = true;
        source.setPointerCapture(event.pointerId);
        live.current.begin();
        frame = requestAnimationFrame(tick);
      }
      if (moved) e.preventDefault();
    }
    function up(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return;
      const allowed = valid();
      target = destinationsAt(e.clientX, e.clientY).find((destination) => live.current.accept(card, destination));
      if (!moved || !allowed) { finish(); return; }
      const sent = target && live.current.drop(card, target, pointerRelease(samples, { x: e.clientX, y: e.clientY, time: e.timeStamp }), held);
      if (!target) live.current.rejected();
      if (sent) finish(); else returnToSlot();
    }
    cleanup.current?.();
    cleanup.current = finish;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', abort);
    document.addEventListener('visibilitychange', abort);
  }
  return { drag, returning: !drag && !reduced && returning?.key === stateKey ? returning : undefined,
    finishReturn: () => setReturning(undefined), start, cancel, suppressClick: () => suppress.current };
}
