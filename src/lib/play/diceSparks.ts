type Point = { x: number; y: number };

export const SPARK_WIDTH = 320;
export const SPARK_HEIGHT = 152;
const SPARK_X = SPARK_WIDTH / 2;
const SPARK_Y = SPARK_HEIGHT / 2;

const streaks = [
  { angle: -.35, reach: .87, fade: .94, color: '#ff559d' },
  { angle: .26, reach: .66, fade: .80, color: '#ffb055' },
  { angle: -.61, reach: .56, fade: .76, color: '#ffbd69' },
  { angle: .55, reach: .83, fade: .92, color: '#ff408f' },
  { angle: -.10, reach: 1, fade: 1, color: '#ff8bb8' },
  { angle: .08, reach: .74, fade: .75, color: '#ffbd69' },
  { angle: .76, reach: .62, fade: .86, color: '#62e9f4' },
  { angle: -.81, reach: .70, fade: .82, color: '#ff78ad' },
  { angle: .42, reach: .47, fade: .70, color: '#ffb055' },
];
const kickback = [
  { angle: 2.84, reach: .37, fade: .83, color: '#ff78ad' },
  { angle: -2.53, reach: .28, fade: .74, color: '#ffd49c' },
];

export function sparkDuration(strength: number, firstImpact: boolean) {
  return firstImpact ? 350 + strength * 125 : 200 + strength * 100;
}

export function paintDiceSparks(ctx: CanvasRenderingContext2D, age: number, strength: number, velocity: Point, firstImpact: boolean) {
  ctx.clearRect(0, 0, SPARK_WIDTH, SPARK_HEIGHT);
  const life = age / sparkDuration(strength, firstImpact);
  if (life < 0 || life >= 1) return;

  const spread = .65 + strength * .35;
  const heading = Math.atan2(velocity.y, velocity.x);
  const distance = (firstImpact ? 43 : 23) + strength * 100;
  const count = (firstImpact ? 4 : 2) + Math.round(strength * 5);
  const flash = (1 - life) ** 1.7;
  const radius = (firstImpact ? 32 : 18) + strength * 43;

  // A narrow pool of color stays at the contact point while the sparks move.
  ctx.save();
  ctx.translate(SPARK_X, SPARK_Y);
  ctx.scale(1, .28);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  pool.addColorStop(0, '#fff2d1');
  pool.addColorStop(.15, '#ff9b51');
  pool.addColorStop(.49, '#ff418cc2');
  pool.addColorStop(1, '#ff418c00');
  ctx.globalAlpha = ((firstImpact ? .64 : .32) + strength * .32) * flash;
  ctx.fillStyle = pool;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round';
  const forward = streaks.slice(0, count);
  const spray = firstImpact ? [...forward, ...kickback] : forward;
  for (const spark of spray) {
    const t = life / spark.fade;
    if (t >= 1) continue;
    const angle = heading + spark.angle * spread;
    const dx = Math.cos(angle), dy = Math.sin(angle) * .49;
    const travel = distance * spark.reach;
    const head = travel * (.16 + .84 * (1 - (1 - t) ** 2));
    const tail = Math.max(0, head - travel * (.53 - t * .32));
    const brightness = Math.min(1, (firstImpact ? .79 : .54) + .35 * strength) * (1 - t ** 1.6) ** 1.6;
    const x = SPARK_X + dx * head, y = SPARK_Y + dy * head;
    const tailX = SPARK_X + dx * tail, tailY = SPARK_Y + dy * tail;
    const trail = ctx.createLinearGradient(tailX, tailY, x, y);
    trail.addColorStop(0, spark.color + '00');
    trail.addColorStop(.65, spark.color);
    trail.addColorStop(1, '#fff4dd');
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = firstImpact ? 9 : 5;
    ctx.globalAlpha = brightness * .17;
    ctx.stroke();
    ctx.lineWidth = firstImpact ? 4.5 : 3;
    ctx.globalAlpha = brightness * .49;
    ctx.stroke();
    ctx.strokeStyle = trail;
    ctx.lineWidth = firstImpact ? 2 : 1.4;
    ctx.globalAlpha = brightness;
    ctx.stroke();
    ctx.fillStyle = '#fff4dd';
    ctx.globalAlpha = brightness * .85;
    ctx.beginPath();
    ctx.arc(x, y, firstImpact ? 1.35 : .8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
