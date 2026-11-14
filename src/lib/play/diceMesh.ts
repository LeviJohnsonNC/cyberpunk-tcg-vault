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
function bevel(faces: Face[], vertices: Vec[]): Surface[] {
  const corners = new Map<Vec, Vec[]>();
  const edges = new Map<string, [Vec, Vec][]>();
  const surfaces = faces.map((face, index): Surface => {
    const points = face.points.map((point) => add(scale(point, .92), scale(face.center, .08)));
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
function meshFor(type: string) {
  if (!meshes.has(type)) {
    const points = vertices[type] ?? vertices.d6;
    const radius = Math.max(...points.map(length));
    const normalized = points.map((point) => scale(point, 1 / radius));
    const faces = hull(normalized);
    meshes.set(type, { faces, surfaces: bevel(faces, normalized) });
  }
  return meshes.get(type)!;
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
  angles: Vec, radius: number, size: number, palette: DicePalette, settled: boolean) {
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
        const specular = .16 + .40 * diffuse ** 2 + .24 * rim ** 3;
        ctx.fillStyle = colorBetween(palette.resin, palette.rim, specular);
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = .65;
        ctx.stroke();
        return;
      }
      const face = surface.face;
      const base = .18 + diffuse * .48;
      const gradient = ctx.createLinearGradient(x - radius * .48, y - radius * .52, x + radius * .48, y + radius * .52);
      gradient.addColorStop(0, colorBetween(palette.light, palette.number, diffuse ** 5 * .21));
      gradient.addColorStop(.37, colorBetween(palette.resin, palette.light, base));
      gradient.addColorStop(.78, colorBetween(palette.resin, palette.light, base * .57));
      gradient.addColorStop(1, colorBetween(palette.resin, palette.reflection, .06 + rim * .25));
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.save();
      ctx.clip();
      const [rx, ry] = project(add(center, transform(face.right)));
      const [ux, uy] = project(add(center, transform(face.up)));
      ctx.transform(rx - x, ry - y, x - ux, y - uy, x, y);
      const value = String(surface.value);
      const contrast = settled && face === landing ? 1 : .35 + Math.max(0, normal[2]) ** 1.55 * .65;
      ctx.font = `700 ${face.inradius * (value.length === 1 ? 2.05 : 1.60)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = colorBetween(palette.resin, palette.number, .07);
      ctx.lineWidth = .035;
      ctx.strokeText(value, 0, .035);
      ctx.fillStyle = colorBetween(palette.resin, palette.number, contrast);
      ctx.fillText(value, 0, .035);
      ctx.restore();
    });
}
