import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { combatContext } from '../lib/play/matchPresentation';
import type { PlayerView } from '../lib/play/protocol';
import { CardFace } from './PlayCard';

type Line = { key: string; x1: number; y1: number; x2: number; y2: number };
/** A live beam from the attacker to whatever it is attacking. */
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
    function point(element: HTMLElement) {
      const box = element.getBoundingClientRect();
      return box.width > 0 ? { x: box.left + box.width / 2, y: box.top + box.height / 2, top: box.top, bottom: box.bottom } : undefined;
    }
    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const a = point(source!), b = point(target!);
        const next = a && b ? { key: combatKey, x1: a.x, y1: b.y > a.y ? a.bottom - 6 : a.top + 6, x2: b.x, y2: b.y > a.y ? b.top + 4 : b.bottom - 4 } : undefined;
        setLine((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      });
    }
    const observer = new ResizeObserver(update);
    observer.observe(scope); observer.observe(source); observer.observe(target);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    // Cards settle into their combat stance after the frame arrives.
    const settle = window.setTimeout(update, 320);
    update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(settle); window.removeEventListener('resize', update); document.removeEventListener('scroll', update, true); };
  }, [attackerId, defenderId, defendingSeat, combatKey, root]);
  if (!line || line.key !== combatKey || !attackerId) return null;
  const bend = (line.x2 - line.x1) * 0.18;
  const path = `M${line.x1} ${line.y1} C${line.x1 + bend} ${(line.y1 * 2 + line.y2) / 3},${line.x2 - bend} ${(line.y1 + line.y2 * 2) / 3},${line.x2} ${line.y2}`;
  return <svg className="play-combat-arrow" aria-hidden="true"><defs><marker id="combat-arrow-head" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7 1.8 3.5Z" /></marker></defs>
    <path className="play-combat-glow" d={path} />
    <path className="play-combat-beam" d={path} markerEnd="url(#combat-arrow-head)" />
    <circle cx={line.x1} cy={line.y1} r="5" /></svg>;
}

/** The fight, stated on the table: who attacks, what they hit, and the power on each side. */
export function CombatBanner({ view, controls, watching }: { view: PlayerView; controls?: ReactNode; watching: boolean }) {
  const combat = combatContext(view);
  if (!combat) return null;
  const { attacker, defender } = combat;
  return <section className="play-combat-banner" aria-label="Combat" data-responding={combat.responding && !watching} data-attacker={combat.attackerSeat}>
    <div className="play-versus" aria-hidden="true">
      <span className="play-versus-side" data-role="attacker">{attacker && <CardFace card={attacker} />}<b>{attacker?.effectivePower ?? '?'}</b></span>
      <i>vs</i>
      <span className="play-versus-side" data-role="defender">{defender ? <><b>{defender.effectivePower}</b><CardFace card={defender} /></>
        : <em>{combat.defendingSeat === 'player' ? 'Your Gigs' : 'Rival Gigs'}</em>}</span>
    </div>
    <div className="play-combat-copy"><h3>{combat.title}</h3><p>{combat.caption}</p></div>
    <span className="play-combat-instruction">{watching ? 'Watching the rival’s move' : combat.hint}</span>
    <div className="play-combat-controls">{controls}</div>
  </section>;
}
