import { useLayoutEffect, useRef } from 'react';
import { dieContactPoint, paintDie, type DicePalette } from '../lib/play/diceMesh';
import { paintDiceSparks, sparkDuration, SPARK_HEIGHT, SPARK_WIDTH } from '../lib/play/diceSparks';
import { diceThrowFrame, diceThrowImpacts, layoutDiceThrow, type PointerRelease } from '../lib/play/diceThrow';
import { ROLL_CONTACT, ROLL_SETTLE, rollHold, rollOffset, rollTime } from '../lib/play/diceTiming';
import type { TableCue } from '../lib/play/tableSound';
import type { GigRoll } from '../lib/play/protocol';
import './play-gig-roll.css';

type Point = { x: number; y: number };
type Route = { source: Point; contact: Point; rest: Point; destination: Point; radius: number; slotRadius: number; throwing?: ReturnType<typeof layoutDiceThrow> };
const SIZE = 176;
const dieMotion: Record<string, { turns: number; bounce: number }> = {
  d4: { turns: .85, bounce: 7 },
  d6: { turns: 1.1, bounce: 10 },
  d8: { turns: 1.35, bounce: 12 },
  d10: { turns: 1.55, bounce: 14 },
  d12: { turns: 1.75, bounce: 15 },
  d20: { turns: 2, bounce: 17 },
};
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(n, high));
const progress = (n: number) => clamp(n, 0, 1);
const ease = (t: number) => 1 - (1 - t) ** 3;
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const between = (a: Point, b: Point, t: number) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

function layout(table: HTMLElement, field: Element | null, roll: GigRoll, seatIndex: number, seatCount: number, release?: PointerRelease): Route | undefined {
  const bounds = table.getBoundingClientRect();
  const zone = table.querySelector(`[data-drop-zone="gigs:${roll.seat}"]`);
  if (!zone) return;
  const die = table.querySelector(`.play-gigs [data-card-id="${CSS.escape(roll.dieId)}"]`);
  const fixer = table.querySelector(`[data-seat="${roll.seat}"] .play-mat-fixer`);
  const anchor = fixer?.querySelector(`[data-roll-source="${CSS.escape(roll.dieId)}"]`) ?? fixer;
  const center = (element: Element): Point => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - bounds.left, y: rect.top + rect.height / 2 - bounds.top };
  };
  const direction = roll.seat === 'player' ? 1 : -1;
  const destination = center(die ?? zone);
  const source = roll.origin === 'gainGig' && anchor ? center(anchor) : destination;
  const fieldRect = field?.getBoundingClientRect();
  const fieldBox = fieldRect?.width && fieldRect.height ? {
    left: fieldRect.left - bounds.left, top: fieldRect.top - bounds.top, width: fieldRect.width, height: fieldRect.height,
  } : undefined;
  const preferredRadius = clamp(bounds.width / Math.max(8, seatCount * 4), 36, 62);
  const radius = fieldBox ? Math.min(preferredRadius, fieldBox.height * .4, fieldBox.width * .3) : preferredRadius;
  const minY = Math.max(radius + 14, 66 - bounds.top + radius);
  const maxY = Math.min(bounds.height - radius - 30, innerHeight - bounds.top - radius - 30);
  const naturalY = fieldBox ? fieldBox.top + fieldBox.height / 2 : destination.y + direction * (radius + 20);
  const rest = {
    x: clamp(lerp(destination.x, bounds.width * (.5 - direction * .13), .68) + (seatIndex - (seatCount - 1) / 2) * radius * 1.8, radius + 10, bounds.width - radius - 10),
    y: minY <= maxY ? clamp(naturalY, minY, maxY) : clamp(naturalY, radius + 14, bounds.height - radius - 30),
  };
  const contact = { x: rest.x - direction * 18, y: rest.y + direction * 8 };
  const throwing = release && fieldBox && layoutDiceThrow(release, fieldBox, radius);
  return { source, destination, contact, rest, radius, throwing, slotRadius: die ? Math.max(10, die.getBoundingClientRect().height * .43) : 15 };
}

function pose(route: Route, roll: GigRoll, elapsed: number) {
  const dock = smooth(progress((elapsed - ROLL_SETTLE - rollHold(roll)) / (rollTime(roll) - ROLL_SETTLE - rollHold(roll))));
  const { turns, bounce: bounceHeight } = dieMotion[roll.dieType] ?? dieMotion.d6;
  const settledX = roll.dieType === 'd4' ? .67 : .43;
  if (route.throwing) {
    const { point, tilt, lift } = diceThrowFrame(route.throwing, elapsed);
    const scale = ease(progress(elapsed / 140));
    const radius = lerp(lerp(Math.min(23, route.throwing.radius), route.throwing.radius, scale), route.slotRadius, dock);
    return { point: between(point, route.destination, dock), radius, lift, dock,
      x: settledX + tilt.x * turns, y: -.24 + tilt.y * turns, z: .06 + tilt.z * turns };
  }
  const direction = roll.seat === 'player' ? 1 : -1;
  const beforeContact = elapsed < ROLL_CONTACT;
  const flight = progress(elapsed / ROLL_CONTACT);
  const bounce = progress((elapsed - ROLL_CONTACT) / (ROLL_SETTLE - ROLL_CONTACT));
  const onMat = beforeContact ? between(route.source, route.contact, flight) : between(route.contact, route.rest, ease(bounce));
  const point = between(onMat, route.destination, dock);
  const lift = beforeContact ? Math.sin(Math.PI * flight) * 36 : Math.sin(Math.PI * bounce) * bounceHeight;
  const radius = lerp(lerp(route.slotRadius, route.radius, ease(flight)), route.slotRadius, dock);
  const spin = beforeContact ? 1 - flight * .77 : .23 * (1 - ease(bounce));
  return {
    point, lift, radius,
    x: settledX + spin * Math.PI * turns * 2,
    y: -.24 + direction * spin * Math.PI * (turns + .45),
    z: .06 - direction * spin * Math.PI * (turns + .2),
    dock,
  };
}

function impactLocations(route: Route, roll: GigRoll) {
  const impacts = route.throwing ? diceThrowImpacts(route.throwing) : [
    { time: ROLL_CONTACT, strength: .67 },
    { time: ROLL_SETTLE, strength: .24 },
  ];
  return impacts.map(impact => {
    const { point, x, y, z, radius } = pose(route, roll, impact.time);
    const edge = dieContactPoint(roll.dieType, roll.result, [x, y, z], radius);
    const before = pose(route, roll, impact.time - 12).point;
    const velocity = { x: point.x - before.x, y: point.y - before.y };
    // For a stationary drop or an almost settled die, give the spray a slight sideways bias.
    return { ...impact, x: point.x + edge.x, y: point.y + edge.y,
      velocity: Math.hypot(velocity.x, velocity.y) >= .1 ? velocity : route.throwing?.direction ?? {
        x: route.rest.x - route.contact.x, y: route.rest.y - route.contact.y,
      } };
  });
}

function paletteFor(table: HTMLElement, roll: GigRoll): DicePalette {
  const styles = getComputedStyle(table);
  function read(token: string): [number, number, number] {
    const value = styles.getPropertyValue(token).trim();
    return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
  }
  return {
    resin: read('--color-canvas-deep'),
    light: read(roll.decisive ? '--color-ticket-muted' : '--color-divider'),
    rim: read(roll.seat === 'rival' && !roll.decisive ? '--color-accent' : '--color-ticket'),
    reflection: read('--color-accent'),
    number: read('--color-ticket'),
  };
}

function RollingDie({ roll, index, seatIndex, seatCount, release, cue }: {
  roll: GigRoll; index: number; seatIndex: number; seatCount: number; release?: PointerRelease;
  cue?: (name: TableCue, delayMs?: number, pan?: number) => (() => void) | undefined;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const caption = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const scene = root.current, surface = canvas.current, contactShadow = shadow.current, label = caption.current;
    const mat = scene?.closest<HTMLElement>('.play-table');
    const ctx = surface?.getContext('2d');
    if (!mat || !scene || !surface || !ctx || !contactShadow || !label) {
      if (scene) scene.dataset.phase = 'docked';
      return;
    }
    const target = mat.querySelector<HTMLElement>(`.play-gigs [data-card-id="${CSS.escape(roll.dieId)}"]`);
    const dice = target?.parentElement;
    if (target && dice && dice.scrollWidth > dice.clientWidth) {
      const die = target.getBoundingClientRect(), row = dice.getBoundingClientRect();
      if (die.right > row.right) dice.scrollLeft += die.right - row.right;
      else if (die.left < row.left) dice.scrollLeft -= row.left - die.left;
    }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    surface.width = surface.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sparkCanvases = Array.from(sparks.current?.querySelectorAll('canvas') ?? [], element => {
      element.width = SPARK_WIDTH * dpr;
      element.height = SPARK_HEIGHT * dpr;
      const context = element.getContext('2d');
      context?.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { element, context };
    });
    const palette = paletteFor(mat, roll);
    const field = mat.querySelector(`[data-zone="field:${roll.seat}"]`);
    let stopSound: (() => void) | undefined;
    let route = layout(mat, field, roll, seatIndex, seatCount, release);
    let impacts = route ? impactLocations(route, roll) : [];
    let dirty = false;
    let launched = false;
    let frame = 0;
    const start = performance.now();
    const resize = new ResizeObserver(() => { dirty = true; });
    resize.observe(mat);
    if (field) resize.observe(field);
    const remeasure = () => { dirty = true; };
    window.addEventListener('resize', remeasure);
    dice?.addEventListener('scroll', remeasure);
    target?.setAttribute('data-roll-pending', '');
    const animate = (now: number) => {
      const elapsed = now - start - rollOffset(index);
      if (dirty) {
        route = layout(mat, field, roll, seatIndex, seatCount, release);
        impacts = route ? impactLocations(route, roll) : [];
        dirty = false;
      }
      sparkCanvases.forEach(({ element, context }, i) => {
        const impact = impacts[i];
        const firstImpact = i === 0;
        const age = impact ? elapsed - impact.time : -1;
        const visible = context && impact && age >= 0 && age < sparkDuration(impact.strength, firstImpact);
        element.hidden = !visible;
        if (!visible) return;
        element.style.transform = `translate3d(${impact.x - SPARK_WIDTH / 2}px, ${impact.y - SPARK_HEIGHT / 2}px, 0)`;
        paintDiceSparks(context, age, impact.strength, impact.velocity, firstImpact);
      });
      if (route && elapsed >= 0) {
        if (!launched) {
          launched = true;
          if (elapsed < 100) stopSound = cue?.('dice-roll', 0, roll.seat === 'rival' ? .24 : -.24);
        }
        const motion = pose(route, roll, elapsed);
        const { point, radius, lift, dock } = motion;
        const phase = elapsed < ROLL_SETTLE ? 'air' : dock < 1 ? 'landed' : 'docked';
        if (scene.dataset.phase !== phase) scene.dataset.phase = phase;
        surface.style.transform = `translate3d(${point.x - SIZE / 2}px, ${point.y - SIZE / 2 - lift}px, 0)`;
        surface.style.opacity = dock > .8 ? String((1 - dock) * 5) : '1';
        contactShadow.style.transform = `translate3d(${point.x - 50}px, ${point.y + radius * .64 - 14}px, 0) scale(${radius / 50}, ${radius / 50})`;
        contactShadow.style.opacity = String((.92 - lift / 78) * (1 - dock));
        label.style.transform = `translate3d(${point.x}px, ${point.y + radius * .83 + 5}px, 0) translateX(-50%)`;
        label.style.opacity = elapsed < ROLL_SETTLE ? '0' : String(1 - dock);
        paintDie(ctx, roll.dieType, roll.result, [motion.x, motion.y, motion.z], radius, SIZE, palette, phase !== 'air');
        if (phase === 'docked') {
          target?.removeAttribute('data-roll-pending');
          target?.setAttribute('data-roll-docked', roll.decisive ? 'decisive' : '');
          return;
        }
      }
      if (elapsed < rollTime(roll) + 50) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('resize', remeasure);
      dice?.removeEventListener('scroll', remeasure);
      stopSound?.();
      target?.removeAttribute('data-roll-pending');
      target?.removeAttribute('data-roll-docked');
    };
  }, [roll, index, seatIndex, seatCount, release, cue]);

  return <div ref={root} className="play-gig-roll" data-phase="air" data-seat={roll.seat} data-die={roll.dieType}
    data-origin={roll.origin} data-launch={release ? 'drag' : undefined} data-result={roll.result} data-decisive={roll.decisive || undefined}>
    <span className="play-gig-shadow" ref={shadow} />
    <div className="play-gig-sparks" ref={sparks}>
      <canvas hidden style={{ width: SPARK_WIDTH, height: SPARK_HEIGHT }} />
      <canvas hidden style={{ width: SPARK_WIDTH, height: SPARK_HEIGHT }} />
    </div>
    <canvas className="play-gig-mesh" ref={canvas} />
    <span className="play-gig-roll-label" ref={caption}>{roll.seat === 'player' ? 'Your' : 'Rival'} {roll.dieType}{roll.origin === 'reroll' ? ' reroll' : ''}</span>
  </div>;
}

export function PlayGigRoll({ rolls, thrown, cue }: {
  rolls: GigRoll[]; thrown?: { dieId: string; release: PointerRelease }; cue?: (name: TableCue, delayMs?: number, pan?: number) => (() => void) | undefined;
}) {
  if (!rolls.length) return null;
  return <div className="play-gig-roll-layer" aria-hidden="true">
    {rolls.map((roll, index) => <RollingDie key={`${roll.dieId}:${index}`} roll={roll} index={index}
      seatIndex={rolls.slice(0, index).filter((other) => other.seat === roll.seat).length}
      seatCount={rolls.filter((other) => other.seat === roll.seat).length}
      release={roll.seat === 'player' && roll.origin === 'gainGig' && thrown?.dieId === roll.dieId ? thrown.release : undefined} cue={cue} />)}
  </div>;
}
