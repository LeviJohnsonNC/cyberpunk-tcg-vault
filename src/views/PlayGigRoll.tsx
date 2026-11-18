import { useCallback, useLayoutEffect, useRef } from 'react';
import { dieContactPoint, paintDie } from '../lib/play/diceMesh';
import { paintDiceSparks, sparkDuration, SPARK_HEIGHT, SPARK_WIDTH } from '../lib/play/diceSparks';
import { diceThrowFrame, diceThrowImpacts, layoutDiceThrow, type PointerRelease } from '../lib/play/diceThrow';
import { rollHold, rollOffset, rollTime } from '../lib/play/diceTiming';
import type { TableSoundCue } from '../lib/play/tableSound';
import type { acquireCrystal } from '../lib/play/crystalRoll';
import { dicePalette } from '../lib/play/dicePalette';
import type { GigRoll } from '../lib/play/protocol';
import './play-gig-roll.css';

type Point = { x: number; y: number };
type Route = { destination: Point; slotRadius: number; throwing: ReturnType<typeof layoutDiceThrow> };
const SIZE = 176;
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
  const area = fieldBox ?? { left: 0, top: 0, width: bounds.width, height: bounds.height };
  const launch = release ?? { x: (source.x - area.left) / area.width, y: (source.y - area.top) / area.height,
    vx: (rest.x - source.x) * 3.4, vy: (rest.y - source.y) * 3.4 };
  const throwing = layoutDiceThrow(launch, area, radius, roll.dieType);
  return { destination, throwing, slotRadius: die ? Math.max(10, die.getBoundingClientRect().height * .43) : 15 };
}

function pose(route: Route, roll: GigRoll, elapsed: number) {
  const settle = route.throwing.settle;
  const dock = smooth(progress((elapsed - settle - rollHold(roll)) / (rollTime(roll, settle) - settle - rollHold(roll))));
  const { point, tilt, lift } = diceThrowFrame(route.throwing, elapsed);
  const scale = ease(progress(elapsed / 145));
  const radius = lerp(lerp(route.slotRadius, route.throwing.radius, scale), route.slotRadius, dock);
  return { point: between(point, route.destination, dock), radius, lift, dock,
    x: (roll.dieType === 'd4' ? .67 : .16) + tilt.x, y: -.13 + tilt.y, z: tilt.z };
}

function impactLocations(route: Route, roll: GigRoll) {
  return diceThrowImpacts(route.throwing).map(impact => {
    const { point, x, y, z, radius, lift } = pose(route, roll, impact.time);
    const edge = dieContactPoint(roll.dieType, roll.result, [x, y, z], radius);
    const before = pose(route, roll, impact.time - 12).point;
    const velocity = { x: point.x - before.x, y: point.y - before.y };
    return { ...impact, x: point.x + edge.x, y: point.y + radius * .64 - (impact.wall ? lift : 0),
      velocity: Math.hypot(velocity.x, velocity.y) >= .1 ? velocity : route.throwing.direction };
  });
}

function RollingDie({ roll, index, seatIndex, seatCount, release, cue, onDock }: {
  roll: GigRoll; index: number; seatIndex: number; seatCount: number; release?: PointerRelease;
  cue?: TableSoundCue; onDock: (id: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const mesh = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const caption = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const scene = root.current, surface = canvas.current, holder = mesh.current, contactShadow = shadow.current, label = caption.current;
    const mat = scene?.closest<HTMLElement>('.play-table');
    const ctx = surface?.getContext('2d');
    if (!mat || !scene || !surface || !holder || !ctx || !contactShadow || !label) {
      if (scene) scene.dataset.phase = 'docked';
      onDock(index);
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
    const palette = dicePalette(mat, roll.seat);
    let crystal: ReturnType<typeof acquireCrystal>;
    let finished = false;
    let gpuReady = false;
    let previousPose = '';
    const restoreCanvas = () => {
      crystal?.canvas.removeEventListener('webglcontextlost', restoreCanvas);
      crystal?.discard();
      crystal = undefined;
      gpuReady = false;
      surface.hidden = false;
      previousPose = '';
      scene.dataset.renderer = 'canvas';
    };
    const releaseCrystal = () => {
      finished = true;
      crystal?.canvas.removeEventListener('webglcontextlost', restoreCanvas);
      crystal?.release();
      crystal = undefined;
    };
    surface.hidden = false;
    scene.dataset.renderer = 'canvas';
    if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      void import('../lib/play/crystalRoll').then(async ({ acquireCrystal }) => {
        if (finished || document.hidden) return;
        crystal = acquireCrystal(roll.dieType, roll.result, palette);
        if (!crystal) return;
        crystal.canvas.addEventListener('webglcontextlost', restoreCanvas);
        await crystal.ready;
        if (finished || !crystal || document.hidden) return;
        gpuReady = true;
        previousPose = '';
      }).catch(() => { if (!finished) restoreCanvas(); });
    }
    const seed = [...roll.dieId].reduce((sum, char) => sum * 31 + char.charCodeAt(0) | 0, roll.result);
    const field = mat.querySelector(`[data-zone="field:${roll.seat}"]`);
    const sounds: (() => void)[] = [];
    const heard = new Set<number>();
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
      const firstFloor = impacts.findIndex(impact => !impact.wall);
      const visibleImpacts = impacts.map((impact, index) => ({ impact, index }))
        .filter(({ impact, index }) => elapsed >= impact.time && elapsed - impact.time < sparkDuration(impact.strength, index === firstFloor))
        .slice(-sparkCanvases.length);
      sparkCanvases.forEach(({ element, context }, i) => {
        const item = visibleImpacts[i];
        element.hidden = !item || !context;
        if (!item || !context) return;
        const { impact, index } = item;
        element.style.transform = `translate3d(${impact.x - SPARK_WIDTH / 2}px, ${impact.y - SPARK_HEIGHT / 2}px, 0)`;
        paintDiceSparks(context, elapsed - impact.time, impact.strength, impact.velocity, index === firstFloor, palette, seed + index);
      });
      impacts.forEach((impact, index) => {
        if (elapsed < impact.time || heard.has(index)) return;
        heard.add(index);
        if (elapsed - impact.time > 80) return;
        const stop = cue?.('dice-impact', 0, roll.seat === 'rival' ? .24 : -.24, { type: roll.dieType, strength: impact.strength });
        if (stop) sounds.push(stop);
      });
      if (route && elapsed >= 0) {
        if (!launched) {
          launched = true;
          if (elapsed < 100) {
            const stop = cue?.('dice-launch', 0, roll.seat === 'rival' ? .24 : -.24, { type: roll.dieType, strength: route.throwing.strength });
            if (stop) sounds.push(stop);
          }
        }
        const motion = pose(route, roll, elapsed);
        const { point, radius, lift, dock } = motion;
        const phase = elapsed < route.throwing.settle ? 'air' : dock < 1 ? 'landed' : 'docked';
        if (scene.dataset.phase !== phase) scene.dataset.phase = phase;
        const edge = dieContactPoint(roll.dieType, roll.result, [motion.x, motion.y, motion.z], radius);
        const grounding = (radius * .64 - edge.y) * (1 - dock);
        holder.style.transform = `translate3d(${point.x - SIZE / 2}px, ${point.y - SIZE / 2 + grounding - lift}px, 0)`;
        holder.style.opacity = dock > .8 ? String((1 - dock) * 5) : '1';
        contactShadow.style.transform = `translate3d(${point.x - 50}px, ${point.y + radius * .64 - 14}px, 0) scale(${radius / 50 * (1 + lift / 100)}, ${radius / 50 * (1 + lift / 80)})`;
        contactShadow.style.opacity = String(Math.max(.12, .86 - lift / 95) * (1 - dock));
        label.style.transform = `translate3d(${point.x}px, ${point.y + radius * .83 + 5}px, 0) translateX(-50%)`;
        label.style.opacity = elapsed < route.throwing.settle ? '0' : String(1 - dock);
        const angles: [number, number, number] = [motion.x, motion.y, motion.z];
        const poseKey = [radius, ...angles, phase].join(',');
        if (phase !== 'docked' && poseKey !== previousPose) {
          if (gpuReady && crystal) {
            try {
              crystal.render(angles, radius, SIZE);
              if (!surface.hidden) {
                holder.append(crystal.canvas);
                surface.hidden = true;
                scene.dataset.renderer = 'webgl';
              }
            } catch { restoreCanvas(); }
          }
          if (!gpuReady) paintDie(ctx, roll.dieType, roll.result, angles, radius, SIZE, palette, phase !== 'air');
          previousPose = poseKey;
        }
        if (phase === 'docked') {
          releaseCrystal();
          target?.removeAttribute('data-roll-pending');
          target?.setAttribute('data-roll-docked', roll.decisive ? 'decisive' : '');
          sparkCanvases.forEach(({ element }) => { element.hidden = true; });
          onDock(index);
          return;
        }
      }
      if (elapsed < rollTime(roll, route?.throwing.settle) + 50) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      releaseCrystal();
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('resize', remeasure);
      dice?.removeEventListener('scroll', remeasure);
      sounds.forEach(stop => stop());
      target?.removeAttribute('data-roll-pending');
      target?.removeAttribute('data-roll-docked');
    };
  }, [roll, index, seatIndex, seatCount, release, cue, onDock]);

  return <div ref={root} className="play-gig-roll" data-phase="air" data-seat={roll.seat} data-die={roll.dieType}
    data-origin={roll.origin} data-launch={release ? 'drag' : undefined} data-result={roll.result} data-decisive={roll.decisive || undefined}>
    <span className="play-gig-shadow" ref={shadow} />
    <div className="play-gig-sparks" ref={sparks}>
      {[0, 1, 2, 3].map(slot => <canvas key={slot} hidden style={{ width: SPARK_WIDTH, height: SPARK_HEIGHT }} />)}
    </div>
    <div className="play-gig-mesh" ref={mesh}><canvas ref={canvas} /></div>
    <span className="play-gig-roll-label" ref={caption}>{roll.seat === 'player' ? 'Your' : 'Rival'} {roll.dieType}{roll.origin === 'reroll' ? ' reroll' : ''}</span>
  </div>;
}

export function PlayGigRoll({ rolls, thrown, cue, onComplete, resultHold = 0 }: {
  rolls: GigRoll[]; thrown?: { dieId: string; release: PointerRelease }; cue?: TableSoundCue; onComplete?: () => void; resultHold?: number;
}) {
  const completed = useRef(new Set<number>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const completion = useRef({ onComplete, resultHold });
  useLayoutEffect(() => { completion.current = { onComplete, resultHold }; });
  useLayoutEffect(() => () => { clearTimeout(timer.current); completed.current.clear(); }, [rolls]);
  const onDock = useCallback((index: number) => {
    completed.current.add(index);
    if (completed.current.size === rolls.length) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => completion.current.onComplete?.(), 120 + completion.current.resultHold);
    }
  }, [rolls.length]);
  if (!rolls.length) return null;
  return <div className="play-gig-roll-layer" aria-hidden="true">
    {rolls.map((roll, index) => <RollingDie key={`${roll.dieId}:${index}`} roll={roll} index={index}
      seatIndex={rolls.slice(0, index).filter((other) => other.seat === roll.seat).length}
      seatCount={rolls.filter((other) => other.seat === roll.seat).length}
      release={roll.seat === 'player' && roll.origin === 'gainGig' && thrown?.dieId === roll.dieId ? thrown.release : undefined} cue={cue} onDock={onDock} />)}
  </div>;
}
