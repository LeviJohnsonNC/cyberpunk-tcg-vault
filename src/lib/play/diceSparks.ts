type Point = { x: number; y: number };

export const SPARK_WIDTH = 220;
export const SPARK_HEIGHT = 112;
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

export function sparkDuration(strength: number) {
  return 105 + strength * 135;
}

export function paintDiceSparks(ctx: CanvasRenderingContext2D, age: number, strength: number, velocity: Point) {
  ctx.clearRect(0, 0, SPARK_WIDTH, SPARK_HEIGHT);
  const life = age / sparkDuration(strength);
  if (life < 0 || life >= 1) return;

  const spread = .48 + strength * .52;
  const heading = Math.atan2(velocity.y, velocity.x);
  const distance = 18 + strength * 78;
  const count = 2 + Math.round(strength * (streaks.length - 2));
  const flash = (1 - life) ** 3;
  const radius = 13 + strength * 32;

  // Foreshorten the pool of reflected light so it reads as part of the mat.
  ctx.save();
  ctx.translate(SPARK_X, SPARK_Y);
  ctx.scale(1, .25);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  pool.addColorStop(0, '#fff2d1');
  pool.addColorStop(.14, '#ff9b51');
  pool.addColorStop(.40, '#ff418cb5');
  pool.addColorStop(1, '#ff418c00');
  ctx.globalAlpha = (.30 + strength * .58) * flash;
  ctx.fillStyle = pool;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round';
  for (const spark of streaks.slice(0, count)) {
    const t = life / spark.fade;
    if (t >= 1) continue;
    const angle = heading + spark.angle * spread;
    const dx = Math.cos(angle), dy = Math.sin(angle) * .46;
    const travel = distance * spark.reach;
    const head = travel * (.12 + .88 * (1 - (1 - t) ** 2));
    const tail = Math.max(0, head - travel * (.37 - t * .23));
    const brightness = (.45 + .55 * strength) * (1 - t) ** 1.4;
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
    ctx.lineWidth = 4.5;
    ctx.globalAlpha = brightness * .19;
    ctx.stroke();
    ctx.strokeStyle = trail;
    ctx.lineWidth = 1.35;
    ctx.globalAlpha = brightness;
    ctx.stroke();
    ctx.fillStyle = '#fff4dd';
    ctx.globalAlpha = brightness * .85;
    ctx.fillRect(x - .7, y - .7, 1.4, 1.4);
  }
  ctx.restore();
}
