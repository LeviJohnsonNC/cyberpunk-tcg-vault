type Vec = [number, number, number];
type Face = { points: Vec[]; center: Vec; normal: Vec; up: Vec; right: Vec; inradius: number };
type Surface = { points: Vec[]; center: Vec; normal: Vec; face?: Face; value?: number };
type Mesh = { faces: Face[]; surfaces: Surface[] };

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v: Vec, k: number): Vec => [v[0] * k, v[1] * k, v[2] * k];
const sub = (a: Vec, b: Vec) => add(a, scale(b, -1));
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (v: Vec) => Math.hypot(...v);
const unit = (v: Vec) => scale(v, 1 / length(v));
const mean = (points: Vec[]) => scale(points.reduce(add, [0, 0, 0]), 1 / points.length);
const epsilon = 1e-6;

// Find supporting planes and group coplanar points into one numbered face.
function hull(points: Vec[]): Face[] {
  const faces = new Map<string, Face>();
  for (let i = 0; i < points.length - 2; i++) {
    for (let j = i + 1; j < points.length - 1; j++) {
      for (let k = j + 1; k < points.length; k++) {
        const a = points[i];
        const outward = cross(sub(points[j], a), sub(points[k], a));
        if (length(outward) < epsilon) continue;
        let normal = unit(outward);
        if (dot(a, normal) < 0) normal = scale(normal, -1);
        const distances = points.map((point) => dot(sub(point, a), normal));
        if (distances.some((d) => d > epsilon)) continue;
        const ids = distances.flatMap((d, index) => Math.abs(d) < epsilon ? [index] : []);
        const key = ids.join(',');
        if (faces.has(key)) continue;
        const vertices = ids.map((id) => points[id]);
        const center = mean(vertices);
        const up = unit(sub(vertices[0], center));
        const right = cross(up, normal);
        vertices.sort((p, q) => {
          const angle = (v: Vec) => Math.atan2(dot(sub(v, center), up), dot(sub(v, center), right));
          return angle(p) - angle(q);
        });
        const inradius = Math.min(...vertices.map((v, index) => {
          const edge = sub(vertices[(index + 1) % vertices.length], v);
          return length(cross(sub(center, v), edge)) / length(edge);
        }));
        faces.set(key, { points: vertices, center, normal, up, right, inradius });
      }
    }
  }
  return [...faces.values()];
}

const signs = [-1, 1];
const phi = (1 + Math.sqrt(5)) / 2;
const ico: Vec[] = signs.flatMap((a) => signs.flatMap((b): Vec[] => [[0, a, b * phi], [b * phi, 0, a], [a, b * phi, 0]]));
const height = Math.sqrt(Math.sin(Math.PI / 5) ** 2 - Math.sin(Math.PI / 10) ** 2);
const antiprism: Vec[] = signs.flatMap((z, layer) => Array.from({ length: 5 }, (_, i): Vec => {
  const angle = (2 * i + layer) * Math.PI / 5;
  return [Math.cos(angle), Math.sin(angle), z * height];
}));
const dual = (vertices: Vec[]) => hull(vertices).map(({ center, normal }) => scale(normal, 1 / dot(center, normal)));
const vertices: Record<string, Vec[]> = {
  d4: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  d6: signs.flatMap((x) => signs.flatMap((y) => signs.map((z): Vec => [x, y, z]))),
  d8: signs.flatMap((s): Vec[] => [[s, 0, 0], [0, s, 0], [0, 0, s]]),
  d10: dual(antiprism),
  d12: dual(ico),
  d20: ico,
};
function bevel(faces: Face[], vertices: Vec[], amount = .14): Surface[] {
  const corners = new Map<Vec, Vec[]>();
  const edges = new Map<string, [Vec, Vec][]>();
  const surfaces = faces.map((face, index): Surface => {
    const points = face.points.map((point) => add(scale(point, 1 - amount), scale(face.center, amount)));
    face.points.forEach((vertex, i) => {
      const next = (i + 1) % points.length;
      const adjacent = face.points[next];
      const a = vertices.indexOf(vertex), b = vertices.indexOf(adjacent);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const side: [Vec, Vec] = a < b ? [points[i], points[next]] : [points[next], points[i]];
      edges.set(key, [...(edges.get(key) ?? []), side]);
      corners.set(vertex, [...(corners.get(vertex) ?? []), points[i]]);
    });
    return { points, center: face.center, normal: face.normal, face, value: index + 1 };
  });
  function chamfer(points: Vec[]) {
    const center = mean(points);
    let normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    if (dot(normal, center) < 0) normal = scale(normal, -1);
    surfaces.push({ points, center, normal });
  }
  for (const [a, b] of edges.values()) if (b) chamfer([a[0], a[1], b[1], b[0]]);
  for (const [vertex, cap] of corners) {
    const center = mean(cap);
    const up = unit(sub(cap[0], center));
    const right = cross(up, unit(vertex));
    const angle = (point: Vec) => Math.atan2(dot(sub(point, center), up), dot(sub(point, center), right));
    chamfer(cap.sort((a, b) => angle(a) - angle(b)));
  }
  return surfaces;
}

const meshes = new Map<string, Mesh>();
export function meshFor(type: string, bevelAmount = .14) {
  const key = `${type}:${bevelAmount}`;
  if (!meshes.has(key)) {
    const points = vertices[type] ?? vertices.d6;
    const radius = Math.max(...points.map(length));
    const normalized = points.map((point) => scale(point, 1 / radius));
    const faces = hull(normalized);
    if (type === 'd6') for (const face of faces) {
      face.up = unit(sub(mean([face.points[0], face.points[1]]), face.center));
      face.right = cross(face.up, face.normal);
    }
    meshes.set(key, { faces, surfaces: bevel(faces, normalized, bevelAmount) });
  }
  return meshes.get(key)!;
}

function rotation(x: number, y: number, z: number) {
  const [cx, cy, cz] = [Math.cos(x), Math.cos(y), Math.cos(z)];
  const [sx, sy, sz] = [Math.sin(x), Math.sin(y), Math.sin(z)];
  return ([a, b, c]: Vec): Vec => {
    const u = cy * a + sy * c;
    const v = sx * sy * a + cx * b - sx * cy * c;
    return [cz * u - sz * v, sz * u + cz * v, -cx * sy * a + sx * b + cx * cy * c];
  };
}

type RGB = [number, number, number];
export interface DicePalette { resin: RGB; light: RGB; rim: RGB; reflection: RGB; number: RGB }
function colorBetween(a: RGB, b: RGB, t: number) {
  const channels = a.map((value, index) => Math.round(value + (b[index] - value) * Math.max(0, Math.min(1, t))));
  return `rgb(${channels.join(' ')})`;
}

const lightDirection = unit([-0.62, 0.7, 1]);
const rimDirection = unit([0.9, -0.1, 0.55]);

function dieProjection(type: string, result: number, angles: Vec, radius: number, center: number) {
  const mesh = meshFor(type);
  const landing = mesh.faces[result - 1] ?? mesh.faces[0];
  const rotate = rotation(...angles);
  const transform = (v: Vec) => rotate([dot(v, landing.right), dot(v, landing.up), dot(v, landing.normal)]);
  const project = ([x, y, z]: Vec) => {
    const perspective = radius * 5 / (5 - z);
    return [center + x * perspective, center - y * perspective] as const;
  };
  return { mesh, landing, transform, project };
}

/** Bottom of the rendered silhouette, relative to the die's center. */
export function dieContactPoint(type: string, result: number, angles: Vec, radius: number) {
  const { mesh, transform, project } = dieProjection(type, result, angles, radius, 0);
  let contact = { x: 0, y: -Infinity };
  for (const { points } of mesh.surfaces) {
    for (const point of points) {
      const [x, y] = project(transform(point));
      if (y > contact.y) contact = { x, y };
    }
  }
  return contact;
}

// Geometry, camera and motion only. The selected face is supplied by the saved engine event.
export function paintDie(ctx: CanvasRenderingContext2D, type: string, result: number,
  angles: Vec, radius: number, size: number, palette: DicePalette, settled: boolean, label?: string) {
  if (label) { paintCrystalIcon(ctx, type, label, radius, size, palette); return; }
  const { mesh, landing, transform, project } = dieProjection(type, result, angles, radius, size / 2);
  function trace(points: (readonly [number, number])[]) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
  }

  ctx.clearRect(0, 0, size, size);
  mesh.surfaces.map((surface) => ({ surface, center: transform(surface.center), normal: transform(surface.normal) }))
    .filter(({ center, normal }) => dot(normal, sub([0, 0, 5], center)) > 0)
    .sort((a, b) => a.center[2] - b.center[2])
    .forEach(({ surface, center, normal }) => {
      const points = surface.points.map((v) => project(transform(v)));
      const [x, y] = project(center);
      const diffuse = Math.max(0, dot(normal, lightDirection));
      const rim = Math.max(0, dot(normal, rimDirection));
      trace(points);
      if (!surface.face) {
        const specular = .18 + .56 * diffuse ** 3 + .24 * rim ** 4;
        const bevel = ctx.createLinearGradient(x - radius * .24, y - radius * .2, x + radius * .25, y + radius * .3);
        bevel.addColorStop(0, colorBetween(palette.light, palette.number, specular));
        bevel.addColorStop(.3, colorBetween(palette.resin, palette.rim, specular * .7));
        bevel.addColorStop(.62, colorBetween(palette.light, palette.reflection, rim * .8));
        bevel.addColorStop(1, colorBetween(palette.resin, palette.rim, .26));
        ctx.fillStyle = bevel;
        ctx.fill();
        ctx.strokeStyle = colorBetween(palette.light, palette.number, .25 + diffuse * .65);
        ctx.lineWidth = .65;
        ctx.stroke();
        return;
      }
      const face = surface.face;
      const gradient = ctx.createRadialGradient(x - radius * .16, y - radius * .27, 0, x, y, radius * 1.2);
      gradient.addColorStop(0, colorBetween(palette.resin, palette.light, .12 + diffuse * .13));
      gradient.addColorStop(.52, colorBetween(palette.resin, palette.light, .04));
      gradient.addColorStop(1, colorBetween(palette.resin, palette.reflection, .28));
      ctx.fillStyle = gradient;
      ctx.fill();

      // Each cut is attached to the mesh. Its reflected light changes with the face normal.
      const inner = surface.points.map(v => add(scale(v, .69), scale(surface.center, .31)));
      surface.points.forEach((a, i) => {
        const j = (i + 1) % surface.points.length;
        const b = surface.points[j];
        const pivot = add(scale(add(a, b), .25), scale(inner[i], .5));
        const cuts = [[a, b, pivot], [b, inner[j], pivot], [inner[j], inner[i], pivot], [inner[i], a, pivot]];
        cuts.forEach((cut, k) => {
          const phase = (surface.value! * 17 + i * 11 + k * 7) * 1.73;
          const glint = Math.max(0, Math.sin(phase) * normal[0] + Math.cos(phase) * normal[1] + normal[2] * .42);
          const shine = .13 + glint ** 5 * .87;
          trace(cut.map(v => project(transform(v))));
          ctx.fillStyle = colorBetween(k % 2 ? palette.light : palette.resin,
            k === 1 ? palette.reflection : k === 3 ? palette.number : palette.rim, shine);
          ctx.fill();
          ctx.strokeStyle = colorBetween(palette.light, palette.rim, .4);
          ctx.lineWidth = .35;
          ctx.globalAlpha = .36;
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
        // Quiet internal reflections keep the central number well dark and readable.
        const deep = add(scale(inner[j], .76), scale(surface.center, .24));
        trace([inner[i], inner[j], deep].map(v => project(transform(v))));
        ctx.fillStyle = colorBetween(palette.resin, palette.light, .18 + rim * .15);
        ctx.fill();
      });
      trace(points);
      ctx.strokeStyle = colorBetween(palette.rim, palette.number, diffuse ** 4 * .75);
      ctx.lineWidth = radius > 35 ? 1 : .65;
      ctx.shadowColor = colorBetween(palette.light, palette.rim, .65);
      ctx.shadowBlur = radius > 35 ? 4 : 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      trace(inner.map(v => project(transform(v))));
      ctx.strokeStyle = colorBetween(palette.resin, palette.rim, .22 + rim * .26);
      ctx.lineWidth = .65;
      ctx.stroke();

      ctx.save();
      trace(points);
      ctx.clip();
      const [rx, ry] = project(add(center, transform(face.right)));
      const [ux, uy] = project(add(center, transform(face.up)));
      ctx.transform(rx - x, ry - y, x - ux, y - uy, x, y);
      const value = String(surface.value);
      const contrast = settled && face === landing ? 1 : .25 + Math.max(0, normal[2]) ** 2 * .75;
      ctx.font = `600 ${face.inradius * (value.length === 1 ? 1.68 : 1.32)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = colorBetween(palette.resin, palette.rim, .28);
      ctx.lineWidth = .028;
      ctx.strokeText(value, 0, .025);
      ctx.fillStyle = colorBetween(palette.light, palette.number, contrast);
      ctx.shadowColor = colorBetween(palette.light, palette.rim, .55);
      ctx.shadowBlur = settled && face === landing ? 4 : 1.5;
      ctx.fillText(value, 0, .025);
      ctx.restore();
    });
}


/** The small dock / picker face uses a frontal crystal cut, keeping its label readable at 30px. */
function paintCrystalIcon(ctx: CanvasRenderingContext2D, type: string, label: string, radius: number, size: number, palette: DicePalette) {
  type P = [number, number];
  const contours: Record<string, P[]> = {
    d4: [[0, -1], [.94, .78], [-.94, .78]],
    d6: [[-.76, -.9], [.76, -.9], [.9, -.76], [.9, .76], [.76, .9], [-.76, .9], [-.9, .76], [-.9, -.76]],
    d8: [[0, -1], [.94, 0], [0, 1], [-.94, 0]],
    d10: [[0, -1], [.84, -.2], [.94, .2], [0, 1], [-.94, .2], [-.84, -.2]],
    d12: Array.from({ length: 10 }, (_, i): P => [Math.sin((i + .5) * Math.PI / 5), -Math.cos((i + .5) * Math.PI / 5)]),
    d20: [[0, -1], [.88, -.51], [.88, .51], [0, 1], [-.88, .51], [-.88, -.51]],
  };
  const outer = contours[type] ?? contours.d6;
  const inner = outer.map(([x, y]): P => [x * .64, y * .64]);
  const trace = (points: P[]) => {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  };
  ctx.clearRect(0, 0, size, size);
  ctx.save(); ctx.translate(size / 2, size / 2); ctx.scale(radius, radius);
  trace(outer);
  const core = ctx.createRadialGradient(-.18, -.24, .05, 0, 0, 1.1);
  core.addColorStop(0, colorBetween(palette.resin, palette.light, .17));
  core.addColorStop(.48, colorBetween(palette.resin, palette.light, .03));
  core.addColorStop(1, colorBetween(palette.resin, palette.light, .8));
  ctx.fillStyle = core; ctx.fill();
  outer.forEach((a, i) => {
    const j = (i + 1) % outer.length, b = outer[j];
    const pivot: P = [(a[0] + b[0] + inner[i][0]) / 3, (a[1] + b[1] + inner[i][1]) / 3];
    const shards = [[a, b, pivot], [b, inner[j], pivot], [inner[j], inner[i], pivot], [inner[i], a, pivot]];
    shards.forEach((shard, k) => {
      trace(shard);
      const shine = .2 + (Math.sin(i * 3.1 + k * 1.8) * .5 + .5) ** 3 * .8;
      const gradient = ctx.createLinearGradient(a[0], a[1], inner[j][0] + .001, inner[j][1]);
      gradient.addColorStop(0, colorBetween(palette.rim, palette.number, k === 0 ? .8 : shine * .55));
      gradient.addColorStop(.35, colorBetween(palette.light, k === 1 ? palette.reflection : palette.rim, shine));
      gradient.addColorStop(1, colorBetween(palette.resin, palette.light, k === 2 ? .1 : .55));
      ctx.fillStyle = gradient; ctx.fill();
      ctx.strokeStyle = colorBetween(palette.light, palette.rim, .6); ctx.lineWidth = .007; ctx.stroke();
    });
    const deep: P = [inner[j][0] * .76, inner[j][1] * .76];
    trace([inner[i], inner[j], deep]);
    ctx.fillStyle = colorBetween(palette.resin, palette.light, .16); ctx.fill();
  });
  trace(outer);
  ctx.shadowColor = colorBetween(palette.light, palette.rim, .5); ctx.shadowBlur = 5;
  ctx.strokeStyle = colorBetween(palette.rim, palette.number, .72); ctx.lineWidth = .016; ctx.stroke();
  ctx.shadowBlur = 0;
  trace(inner); ctx.strokeStyle = colorBetween(palette.light, palette.rim, .65); ctx.lineWidth = .009; ctx.stroke();
  for (const index of [0, Math.floor(outer.length / 2)]) {
    const [x, y] = outer[index];
    const flare = ctx.createRadialGradient(x, y, 0, x, y, .16);
    flare.addColorStop(0, `rgba(${palette.number.join(',')},.9)`);
    flare.addColorStop(.2, `rgba(${palette.rim.join(',')},.25)`);
    flare.addColorStop(1, `rgba(${palette.rim.join(',')},0)`);
    ctx.fillStyle = flare; ctx.fillRect(x - .16, y - .16, .32, .32);
    ctx.fillStyle = colorBetween(palette.rim, palette.number, .85);
    trace([[x, y - .065], [x + .012, y - .012], [x + .065, y], [x + .012, y + .012],
      [x, y + .065], [x - .012, y + .012], [x - .065, y], [x - .012, y - .012]]);
    ctx.fill();
  }
  const labelY = type === 'd4' ? .21 : .04;
  ctx.font = `600 ${label.length > 2 ? .56 : .65}px Inter, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = colorBetween(palette.light, palette.rim, .4); ctx.shadowBlur = 5;
  ctx.fillStyle = colorBetween(palette.rim, palette.number, .95);
  ctx.fillText(label, 0, labelY);
  ctx.restore();
}
