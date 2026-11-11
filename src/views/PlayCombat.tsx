import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { combatContext } from '../lib/play/matchPresentation';
import type { PlayerView } from '../lib/play/protocol';

type Line = { key: string; x1: number; y1: number; x2: number; y2: number };
export function CombatArrow({ view, root }: { view: PlayerView; root: RefObject<HTMLDivElement | null> }) {
  const [line, setLine] = useState<Line>();
  const attackerId = view.attackState?.attackerId;
  const defenderId = view.attackState?.defenderId;
  const combatKey = `${attackerId ?? ''}:${defenderId ?? 'gigs'}`;
  const defendingSeat = combatContext(view)?.defendingSeat;
  useEffect(() => {
    const scope = root.current;
    if (!scope || !attackerId || !defendingSeat) return;
    const source = scope.querySelector<HTMLElement>(`.play-table [data-board-card="${CSS.escape(attackerId)}"]`);
    const target = defenderId ? scope.querySelector<HTMLElement>(`.play-table [data-board-card="${CSS.escape(defenderId)}"]`)
      : scope.querySelector<HTMLElement>(`[data-drop-zone="gigs:${defendingSeat}"]`);
    if (!source || !target) return;
    // Reveal combatants horizontally without moving the player's page position.
    for (const card of [source, target]) {
      const row = card.closest<HTMLElement>('.play-card-row');
      if (!row || row.scrollWidth <= row.clientWidth) continue;
      const box = card.getBoundingClientRect(), clip = row.getBoundingClientRect();
      if (box.left < clip.left || box.right > clip.right) row.scrollTo({ left: row.scrollLeft + box.left + box.width / 2 - clip.left - clip.width / 2,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
    function point(element: HTMLElement) {
      const box = element.getBoundingClientRect();
      const row = element.closest('.play-card-row')?.getBoundingClientRect();
      const left = Math.max(box.left, row?.left ?? 0, 0), right = Math.min(box.right, row?.right ?? innerWidth, innerWidth);
      const top = Math.max(box.top, row?.top ?? 0, 0), bottom = Math.min(box.bottom, row?.bottom ?? innerHeight, innerHeight);
      return right > left && bottom > top && box.width > 0 ? { x: (left + right) / 2, y: (top + bottom) / 2, top, bottom } : undefined;
    }
    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const a = point(source!), b = point(target!);
        const next = a && b ? { key: combatKey, x1: a.x, y1: b.y > a.y ? a.bottom - 3 : a.top + 3, x2: b.x, y2: b.y > a.y ? b.top + 3 : b.bottom - 3 } : undefined;
        setLine((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      });
    }
    const observer = new ResizeObserver(update);
    observer.observe(scope); observer.observe(source); observer.observe(target);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', update); document.removeEventListener('scroll', update, true); };
  }, [attackerId, defenderId, defendingSeat, combatKey, root]);
  if (!line || line.key !== combatKey || !attackerId) return null;
  return <svg className="play-combat-arrow" aria-hidden="true"><defs><marker id="combat-arrow-head" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0 7 4 0 8" /></marker></defs>
    <path d={`M${line.x1} ${line.y1} C${line.x1 + 50} ${line.y1},${line.x2 + 50} ${line.y2},${line.x2} ${line.y2}`} markerEnd="url(#combat-arrow-head)" />
    <circle cx={line.x1} cy={line.y1} r="5" /></svg>;
}

export function CombatBanner({ view, controls, watching }: { view: PlayerView; controls?: ReactNode; watching: boolean }) {
  const combat = combatContext(view);
  if (!combat) return null;
  return <section className="play-combat-banner" aria-label="Combat" data-responding={combat.responding && !watching}>
    <div><h3>{combat.title}</h3><p>{combat.caption}</p></div>
    <span className="play-combat-instruction">{watching ? 'Watching the rival’s move' : combat.hint}</span>
    <div className="play-combat-controls">{controls}</div>
  </section>;
}
