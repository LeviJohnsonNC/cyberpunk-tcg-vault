import { ROLL_SETTLE } from './diceTiming';

type Point = { x: number; y: number };
export type PointerSample = Point & { time: number };
export type PointerRelease = Point & { vx: number; vy: number };
type FieldBox = { left: number; top: number; width: number; height: number };
type Frame = { time: number; point: Point; lift: number; tilt: { x: number; y: number; z: number } };
export type DiceImpact = { time: number; strength: number; wall: boolean };
type ThrowLayout = ReturnType<typeof layoutDiceThrow>;

const MAX_SPEED = 2100;
const RECENT_MS = 85;
const STEP = 1000 / 120;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const shapeEnergy: Record<string, number> = { d4: .74, d6: .88, d8: .96, d10: 1, d12: 1.04, d20: 1.1 };

export function pointerRelease(samples: readonly PointerSample[], end: PointerSample): PointerRelease {
  const start = samples.find(sample => sample.time >= end.time - RECENT_MS && sample.time <= end.time - 8);
  if (!start) return { x: end.x, y: end.y, vx: 0, vy: 0 };
  const seconds = (end.time - start.time) / 1000;
  return { x: end.x, y: end.y, vx: (end.x - start.x) / seconds, vy: (end.y - start.y) / seconds };
}

export function releaseOnField(release: PointerRelease, field: FieldBox): PointerRelease {
  return { ...release, x: clamp((release.x - field.left) / field.width, 0, 1), y: clamp((release.y - field.top) / field.height, 0, 1) };
}

/** Precompute a bounded, fixed-step presentation trajectory. Game RNG never enters the simulation. */
export function layoutDiceThrow(release: PointerRelease, field: FieldBox, maxRadius: number, type = 'd6') {
  const origin = { x: field.left + field.width * release.x, y: field.top + field.height * release.y };
  const magnitude = Math.hypot(release.vx, release.vy);
  const speed = Math.min(MAX_SPEED, magnitude);
  const strength = speed / MAX_SPEED;
  const direction = magnitude ? { x: release.vx / magnitude, y: release.vy / magnitude } : { x: .45, y: -.8 };
  const radius = Math.min(maxRadius, field.height * .29, field.width * .23);
  const inset = radius * .8;
  const minX = Math.min(origin.x, field.left + inset), maxX = Math.max(origin.x, field.left + field.width - inset);
  const minY = Math.min(origin.y, field.top + inset), maxY = Math.max(origin.y, field.top + field.height - inset);
  const energy = shapeEnergy[type] ?? 1;
  const frames: Frame[] = [{ time: 0, point: { ...origin }, lift: 0, tilt: { x: 0, y: 0, z: 0 } }];
  const impacts: DiceImpact[] = [];
  let x = origin.x, y = origin.y, z = 0;
  let vx = direction.x * speed, vy = direction.y * speed;
  let vz = (100 + strength * 290) * Math.sqrt(energy);
  let angle = 0, angular = (5 + strength * 29) * energy;
  let floor = false, lastContact = 0;
  const dt = STEP / 1000;
  for (let time = STEP; time <= ROLL_SETTLE - 150; time += STEP) {
    x += vx * dt; y += vy * dt;
    const wallSpeed = Math.hypot(vx, vy);
    let wall = false;
    if (x < minX || x > maxX) { x = clamp(x, minX, maxX); vx *= -(.42 + strength * .16); wall = true; }
    if (y < minY || y > maxY) { y = clamp(y, minY, maxY); vy *= -(.42 + strength * .16); wall = true; }
    if (wall && wallSpeed > 220) {
      impacts.push({ time, strength: Math.min(.6, wallSpeed / MAX_SPEED * .65), wall: true });
      angular *= .78;
    }
    if (!floor) {
      z += vz * dt - 1800 * dt * dt / 2;
      vz -= 1800 * dt;
      if (z <= 0) {
        z = 0;
        impacts.push({ time, strength: clamp(Math.abs(vz) / 420, .12, 1), wall: false });
        vz = -vz * (.30 + strength * .26) * energy;
        vx *= .73; vy *= .73; angular *= .68;
        lastContact = time;
        if (vz < 48) { floor = true; vz = 0; }
      }
    }
    const drag = Math.exp(-(floor ? 15 : 1.55) * dt);
    vx *= drag; vy *= drag;
    angular *= Math.exp(-(floor ? 18 : .85) * dt);
    angle += angular * dt;
    frames.push({ time, point: { x, y }, lift: z,
      tilt: { x: direction.y * angle, y: -direction.x * angle, z: (direction.x - direction.y * .4) * angle * .32 } });
    if (floor && time - lastContact > 145 && Math.hypot(vx, vy) < 14) break;
  }
  const final = frames.at(-1)!;
  // A short damped rock closes the remaining motion onto the engine-selected face.
  const settle = Math.min(ROLL_SETTLE, final.time + 140);
  const finalTilt = final.tilt;
  for (const frame of frames) {
    frame.tilt = { x: finalTilt.x - frame.tilt.x, y: finalTilt.y - frame.tilt.y, z: finalTilt.z - frame.tilt.z };
  }
  for (let time = final.time + STEP; time < settle; time += STEP) {
    const t = (time - final.time) / (settle - final.time);
    const rock = Math.sin(t * Math.PI * 2) * (1 - t) ** 2 * (.07 + strength * .13);
    frames.push({ time, point: final.point, lift: 0, tilt: { x: rock, y: rock * .45, z: -rock * .2 } });
  }
  frames.push({ time: settle, point: final.point, lift: 0, tilt: { x: 0, y: 0, z: 0 } });
  return { origin, speed, strength, direction, radius, minX, maxX, minY, maxY, frames, impacts, settle };
}

export function diceThrowFrame(throwing: ThrowLayout, elapsed: number) {
  const { frames } = throwing;
  const time = clamp(elapsed, 0, throwing.settle);
  const nextIndex = frames.findIndex(frame => frame.time >= time);
  const b = frames[nextIndex < 0 ? frames.length - 1 : nextIndex];
  const a = frames[Math.max(0, nextIndex - 1)];
  const t = b.time === a.time ? 1 : (time - a.time) / (b.time - a.time);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { point: { x: mix(a.point.x, b.point.x), y: mix(a.point.y, b.point.y) }, lift: mix(a.lift, b.lift),
    tilt: { x: mix(a.tilt.x, b.tilt.x), y: mix(a.tilt.y, b.tilt.y), z: mix(a.tilt.z, b.tilt.z) } };
}

export function diceThrowImpacts(throwing: ThrowLayout) { return throwing.impacts; }
