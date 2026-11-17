import type { DicePalette } from './diceMesh';
type Point = { x: number; y: number };
export const SPARK_WIDTH = 400;
export const SPARK_HEIGHT = 240;
const X = SPARK_WIDTH / 2, Y = SPARK_HEIGHT / 2;
const color = (rgb: number[], alpha = 1) => `rgba(${rgb.join(',')},${alpha})`;
const noise = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

export function sparkDuration(strength: number, firstImpact: boolean) {
  return (firstImpact ? 330 : 220) + strength * 190;
}

/** Ballistic chips and hot tapered streaks, stable for the lifetime of each impact. */
export function paintDiceSparks(ctx: CanvasRenderingContext2D, age: number, strength: number,
  velocity: Point, firstImpact: boolean, palette: DicePalette, seed: number) {
  ctx.clearRect(0, 0, SPARK_WIDTH, SPARK_HEIGHT);
  const duration = sparkDuration(strength, firstImpact);
  const life = age / duration;
  if (life < 0 || life >= 1) return;
  const heading = Math.atan2(velocity.y, velocity.x);
  const seconds = age / 1000;
  const count = Math.round(7 + strength * (firstImpact ? 22 : 12));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // A small pool of light anchors the impact to the tabletop.
  ctx.save();
  ctx.translate(X, Y); ctx.scale(1, .24);
  const radius = 15 + strength * 55;
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  pool.addColorStop(0, color(palette.number, .8));
  pool.addColorStop(.14, color(palette.rim, .65));
  pool.addColorStop(.48, color(palette.light, .3));
  pool.addColorStop(1, color(palette.light, 0));
  ctx.globalAlpha = Math.exp(-life * 9) * (.35 + strength * .65);
  ctx.fillStyle = pool;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const n = seed * 37 + i * 13;
    const lifetime = .48 + noise(n + 1) * .52;
    if (life > lifetime) continue;
    const angle = heading + (noise(n + 2) - .5) * (i % 4 ? 2.3 : 6.28);
    const speed = (100 + strength * 520) * (.3 + noise(n + 3) * .7);
    const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed * .36;
    const up = 35 + noise(n + 4) * (75 + strength * 90);
    const position = (t: number) => ({ x: X + vx * (1 - Math.exp(-t * 2.8)) / 2.8,
      y: Y + vy * t - up * t + 320 * t * t });
    const head = position(seconds), tail = position(Math.max(0, seconds - .028 - noise(n + 5) * .06));
    const alpha = Math.min(1, (1 - life / lifetime) * 2.1);
    const tint = i % 5 === 0 ? palette.reflection : palette.rim;
    const trail = ctx.createLinearGradient(tail.x, tail.y, head.x + .01, head.y);
    trail.addColorStop(0, color(tint, 0));
    trail.addColorStop(.6, color(tint, alpha));
    trail.addColorStop(1, color(palette.number, alpha));
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y);
    ctx.strokeStyle = color(tint, alpha * .19); ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = trail; ctx.lineWidth = .9 + noise(n + 6) * 1.2; ctx.stroke();
    if (i % 3 === 0) {
      const r = (.7 + noise(n + 7) * 1.2) * alpha;
      ctx.fillStyle = color(palette.number, alpha * .85);
      ctx.beginPath(); ctx.moveTo(head.x, head.y - r * 1.8); ctx.lineTo(head.x + r, head.y);
      ctx.lineTo(head.x, head.y + r * 1.8); ctx.lineTo(head.x - r, head.y); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}
