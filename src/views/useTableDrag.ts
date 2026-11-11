import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CardView } from '../lib/play/protocol';
import type { Destination } from '../lib/play/matchInteraction';

export interface TableDrag { card: CardView; x: number; y: number; destination?: Destination; width: number; originX: number; originY: number }

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

export function useTableDrag({ stateKey, enabled, eligible, accept, drop, begin, rejected }: {
  stateKey: string; enabled: boolean;
  eligible: (card: CardView) => boolean;
  accept: (card: CardView, destination: Destination) => boolean;
  drop: (card: CardView, destination: Destination) => void;
  begin: () => void; rejected: () => void;
}) {
  const [drag, setDrag] = useState<TableDrag>();
  const live = useRef({ stateKey, enabled, eligible, accept, drop, begin, rejected });
  useEffect(() => { live.current = { stateKey, enabled, eligible, accept, drop, begin, rejected }; });
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const suppress = useRef(false);
  useEffect(() => {
    cleanup.current?.();
  }, [stateKey, enabled]);
  useEffect(() => () => cleanup.current?.(), []);

  function cancel() { cleanup.current?.(); }
  function start(event: ReactPointerEvent<HTMLElement>, card: CardView) {
    if (!enabled || !eligible(card) || event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return;
    const source = event.currentTarget;
    const key = stateKey;
    const origin = { x: event.clientX, y: event.clientY };
    const rect = source.getBoundingClientRect();
    const width = rect.width;
    let moved = false;
    let point = origin;
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
    function abort() { finish(); }
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); } }
    function tick() {
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
      setDrag({ card, x: point.x, y: point.y, width, originX: sourceNow.x + sourceNow.width / 2, originY: sourceNow.y + sourceNow.height / 2, destination: target });
      frame = requestAnimationFrame(tick);
    }
    function move(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return;
      point = { x: e.clientX, y: e.clientY };
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
      finish();
      if (moved && allowed) {
        if (target) live.current.drop(card, target);
        else live.current.rejected();
      }
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
  return { drag, start, cancel, suppressClick: () => suppress.current };
}
