import { useEffect, useRef, useState, type RefObject } from 'react';
import { combatContext } from '../lib/play/matchPresentation';
import type { CardView, PlayerView } from '../lib/play/protocol';
import { CardFace } from './PlayCard';

type Line = { attacker: string; target: string; x1: number; y1: number; x2: number; y2: number };
/** A live beam from the attacker to whatever it is attacking. */
export function CombatArrow({ view, root, reduced, quick }: { view: PlayerView; reduced: boolean; quick: boolean; root: RefObject<HTMLDivElement | null> }) {
  const [line, setLine] = useState<Line>();
  const last = useRef<Line | undefined>(undefined);
  const attackerId = view.attackState?.attackerId;
  const defenderId = view.attackState?.defenderId;
  const defendingSeat = combatContext(view)?.defendingSeat;
  useEffect(() => {
    const scope = root.current;
    if (!scope || !attackerId || !defendingSeat) return;
    const source = scope.querySelector<HTMLElement>(`.play-table [data-board-card="${CSS.escape(attackerId)}"]`);
    const target = defenderId ? scope.querySelector<HTMLElement>(`.play-table [data-board-card="${CSS.escape(defenderId)}"]`)
      : scope.querySelector<HTMLElement>(`[data-drop-zone="gigs:${defendingSeat}"] .play-gig-threat`);
    if (!source || !target) {
      last.current = undefined;
      const clear = requestAnimationFrame(() => setLine(undefined));
      return () => cancelAnimationFrame(clear);
    }
    function point(element: HTMLElement) {
      const box = element.getBoundingClientRect();
      return box.width > 0 ? { x: box.left + box.width / 2, y: box.top + box.height / 2, top: box.top, bottom: box.bottom } : undefined;
    }
    let frame = 0;
    const origin = last.current;
    const redirect = !reduced && origin?.attacker === attackerId && origin.target !== (defenderId ?? 'gigs');
    const start = performance.now();
    const duration = quick ? 125 : 200;
    function update() {
      cancelAnimationFrame(frame);
      const a = point(source!), b = point(target!);
      if (!a || !b) { last.current = undefined; setLine(undefined); return; }
      const down = b.y > a.y;
      const lean = Math.min(10, Math.max(-10, (b.x - a.x) / 20)) * (down ? -1 : 1);
      source!.style.setProperty('--combat-lean', `${lean}deg`);
      const line = { attacker: attackerId!, target: defenderId ?? 'gigs', x1: a.x, y1: down ? a.bottom - 6 : a.top + 6,
        x2: b.x, y2: defenderId ? (down ? b.top + 12 : b.bottom - 12) : (down ? b.top - 3 : b.bottom + 3) };
      const t = Math.min(1, (performance.now() - start) / duration);
      if (redirect && origin && t < 1) {
        const remaining = (1 - t) ** 3;
        line.x2 += (origin.x2 - line.x2) * remaining;
        line.y2 += (origin.y2 - line.y2) * remaining;
        frame = requestAnimationFrame(update);
      }
      last.current = line;
      setLine(line);
    }
    const observer = new ResizeObserver(update);
    observer.observe(scope); observer.observe(source); observer.observe(target);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    // Cards settle into their combat stance after the frame arrives.
    const settle = window.setTimeout(update, 320);
    frame = requestAnimationFrame(update);
    return () => { observer.disconnect(); source.style.removeProperty('--combat-lean'); cancelAnimationFrame(frame); clearTimeout(settle); window.removeEventListener('resize', update); document.removeEventListener('scroll', update, true); };
  }, [attackerId, defenderId, defendingSeat, reduced, quick, root]);
  if (!line || line.attacker !== attackerId) return null;
  const bend = (line.x2 - line.x1) * 0.18;
  const path = `M${line.x1} ${line.y1} C${line.x1 + bend} ${(line.y1 * 2 + line.y2) / 3},${line.x2 - bend} ${(line.y1 + line.y2 * 2) / 3},${line.x2} ${line.y2}`;
  return <svg className="play-combat-arrow" data-aim={line.target} aria-hidden="true"><defs><marker id="combat-arrow-head" markerWidth="5.5" markerHeight="5.5" viewBox="0 0 7 7" refX="5" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7 1.8 3.5Z" /></marker></defs>
    <path className="play-combat-glow" d={path} />
    <path className="play-combat-beam" d={path} markerEnd="url(#combat-arrow-head)" />
    <circle cx={line.x1} cy={line.y1} r="5" /></svg>;
}

/** The fight, stated on the table: who attacks, what they hit, and the power on each side. */
export function CombatBanner({ view, watching, compact = false, inspect }: { view: PlayerView; watching: boolean; compact?: boolean; inspect?: (card: CardView, trigger: HTMLElement) => void }) {
  const combat = combatContext(view);
  if (!combat) return null;
  const { attacker, defender } = combat;
  const stage = view.prompt.choice ? 'Effect choice' : view.attackState?.step === 'react' ? 'Response window'
    : view.attackState?.step === 'attack' ? 'Attack declared' : 'Resolving combat';
  const participant = (card: CardView | undefined, role: string) => card ? <button type="button" className="play-combat-card" disabled={watching || !inspect}
    aria-label={`Inspect ${role}: ${card.cardName}, current power ${card.effectivePower}`} onClick={(event) => inspect?.(card, event.currentTarget)}>
    <CardFace card={card} /><span><small>{role}</small><strong>{card.cardName}</strong></span><b>{card.effectivePower}</b></button> : <span>{role}</span>;
  return <section className="play-combat-banner" aria-label="Combat" data-compact={compact} data-responding={combat.responding && !watching} data-attacker={combat.attackerSeat}>
    <div className="play-combat-stage"><small>Combat</small><strong>{stage}</strong></div>
    <div className="play-versus">
      {participant(attacker, 'Attacker')}
      <i>vs</i>
      <span className="play-versus-side" data-role="defender">{defender ? participant(defender, 'Defender')
        : <em>{combat.defendingSeat === 'player' ? 'Your Gigs' : 'Rival Gigs'}</em>}</span>
    </div>
    {!compact && <span className="play-combat-instruction">{watching ? 'Watching the move resolve' : combat.hint} <small>Power now, before further effects.</small></span>}
  </section>;
}
