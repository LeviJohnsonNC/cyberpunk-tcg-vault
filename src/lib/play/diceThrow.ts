import { ROLL_SETTLE } from './diceTiming';

type Point = { x: number; y: number };
export type PointerSample = Point & { time: number };
export type PointerRelease = Point & { vx: number; vy: number };
type FieldBox = { left: number; top: number; width: number; height: number };
type ThrowLayout = ReturnType<typeof layoutDiceThrow>;

const MAX_SPEED = 2100; // CSS pixels per second
const RECENT_MS = 85;
const REBOUND = .48;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function pointerRelease(samples: readonly PointerSample[], end: PointerSample): PointerRelease {
  // The last part of the gesture matters. Holding the die still before release drops it gently.
  const start = samples.find(sample => sample.time >= end.time - RECENT_MS && sample.time <= end.time - 8);
  if (!start) return { x: end.x, y: end.y, vx: 0, vy: 0 };
  const seconds = (end.time - start.time) / 1000;
  return { x: end.x, y: end.y, vx: (end.x - start.x) / seconds, vy: (end.y - start.y) / seconds };
}

/** Position relative to the field, so layout changes don't move a throw onto the wrong zone. */
export function releaseOnField(release: PointerRelease, field: FieldBox): PointerRelease {
  return { ...release, x: clamp((release.x - field.left) / field.width, 0, 1), y: clamp((release.y - field.top) / field.height, 0, 1) };
}

export function layoutDiceThrow(release: PointerRelease, field: FieldBox, maxRadius: number) {
  const origin = { x: field.left + field.width * release.x, y: field.top + field.height * release.y };
  const magnitude = Math.hypot(release.vx, release.vy);
  const speed = Math.min(MAX_SPEED, magnitude);
  const direction = magnitude ? { x: release.vx / magnitude, y: release.vy / magnitude } : { x: .45, y: -.8 };
  const radius = Math.min(maxRadius, field.height * .23, field.width * .23);
  const inset = radius * .72;
  return { origin, speed, direction, radius,
    // The first rendered frame is at release, including when the pointer is already at an edge.
    minX: Math.min(origin.x, field.left + inset), maxX: Math.max(origin.x, field.left + field.width - inset),
    minY: Math.min(origin.y, field.top + inset), maxY: Math.max(origin.y, field.top + field.height - inset),
  };
}

function rebound(origin: number, displacement: number, min: number, max: number) {
  let position = origin;
  while (Math.abs(displacement) > .1) {
    const next = position + displacement;
    if (next >= min && next <= max) return next;
    position = next < min ? min : max;
    displacement = (position - next) * REBOUND;
  }
  return position;
}

export function diceThrowFrame(throwing: ThrowLayout, elapsed: number) {
  const { origin, direction, speed } = throwing;
  const t = clamp(elapsed / ROLL_SETTLE, 0, 1);
  const strength = speed / MAX_SPEED;
  // Integrate a linear deceleration, so the velocity falls to zero at the settle frame.
  const travel = speed * ROLL_SETTLE / 1000 * t * (1 - t / 2);
  const contact = .23 + strength * .25;
  const secondBounce = contact + .2 + strength * .14;
  const lift = t < contact ? Math.sin(Math.PI * t / contact) * (9 + strength * 28)
    : t < secondBounce ? Math.sin(Math.PI * (t - contact) / (secondBounce - contact)) * (2 + strength * 10) : 0;
  const spin = (.13 + strength * 1.75) * Math.PI * 2 * (1 - t) ** 2;
  return {
    point: {
      x: rebound(origin.x, direction.x * travel, throwing.minX, throwing.maxX),
      y: rebound(origin.y, direction.y * travel, throwing.minY, throwing.maxY),
    },
    lift,
    tilt: { x: direction.y * spin, y: -direction.x * spin, z: (direction.x - direction.y * .4) * spin * .26 },
  };
}
