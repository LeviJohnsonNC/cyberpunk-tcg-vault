/** Lazy d20 proof. Convex ray tracing and cut facets approximate a polished gemstone. */
import * as THREE from 'three';
import { crystalOptics } from './crystalOptics';
import { meshFor, type DicePalette } from './diceMesh';

type Vec = [number, number, number];
type CrystalMesh = ReturnType<typeof meshFor>;
const vector = (v: Vec) => new THREE.Vector3(...v);
const shade = (rgb: Vec) => new THREE.Color(`rgb(${rgb.join(',')})`);

function geometry(surfaces: CrystalMesh['surfaces']) {
  const positions: number[] = [], normals: number[] = [];
  const cuts: { points: Vec[]; normal: Vec }[] = [];
  for (const surface of surfaces) {
    if (!surface.face) { cuts.push(surface); continue; }
    const { points, center, normal } = surface;
    const inner = points.map(point => vector(point).lerp(vector(center), .36).addScaledVector(vector(normal), -.025).toArray() as Vec);
    cuts.push({ points: inner, normal });
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const pivot = vector(points[i]).add(vector(points[j])).add(vector(inner[i])).add(vector(inner[j])).multiplyScalar(.25).addScaledVector(vector(normal), -.004).toArray() as Vec;
      for (const triangle of [[points[i], points[j], pivot], [points[j], inner[j], pivot], [inner[j], inner[i], pivot], [inner[i], points[i], pivot]]) {
        const facet = vector(triangle[1]).sub(vector(triangle[0])).cross(vector(triangle[2]).sub(vector(triangle[0]))).normalize();
        if (facet.dot(vector(normal)) < 0) facet.negate();
        cuts.push({ points: triangle, normal: facet.toArray() as Vec });
      }
    }
  }
  for (const { points, normal } of cuts) {
    for (let i = 1; i < points.length - 1; i++) {
      const triangle = [points[0], points[i], points[i + 1]];
      const cross = vector(triangle[1]).sub(vector(triangle[0])).cross(vector(triangle[2]).sub(vector(triangle[0])));
      if (cross.dot(vector(normal)) < 0) triangle.reverse();
      triangle.forEach(p => { positions.push(...p); normals.push(...normal); });
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return result;
}

function studio(renderer: THREE.WebGLRenderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color(.2, .24, .3);
  const panels: [Vec, Vec, number, number][] = [
    [[-3, 3, 4], [1.8, 4, 1], 0xffffff, 8],
    [[3, .6, 2], [.4, 5, 1], 0xc9edff, 7],
    [[-.3, 4, -.5], [4, .5, 1], 0xffffff, 9],
    [[-3, -1.5, -2], [1.2, 3, 1], 0x86bdff, 5],
    [[2, 2, -3], [.7, 3, 1], 0xe9c9ff, 6],
    [[0, -3, 2], [4, .25, 1], 0xffffff, 4],
  ];
  for (const [position, scale, color, intensity] of panels) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    panel.position.set(...position); panel.scale.set(...scale); panel.lookAt(0, 0, 0); room.add(panel);
  }
  for (const [index, face] of meshFor('d20').faces.entries()) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(.3 + index % 3 * .2, 1.7 + index % 4 * .7), new THREE.MeshBasicMaterial({ color: new THREE.Color('white').multiplyScalar(1 + index % 4), side: THREE.DoubleSide }));
    panel.position.copy(vector(face.normal).multiplyScalar(4)); panel.lookAt(0, 0, 0); panel.rotateZ(index * .9); room.add(panel);
  }
  const target = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const camera = new THREE.CubeCamera(.1, 20, target);
  camera.update(renderer, room);
  room.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
  return target;
}

function labelTexture(value: number, palette: DicePalette) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 146px Inter, sans-serif';
  ctx.shadowColor = `rgb(${palette.rim.join(',')})`; ctx.shadowBlur = 12;
  ctx.fillStyle = 'white'; ctx.fillText(String(value), 128, 133);
  if (value === 6 || value === 9) { ctx.fillRect(96, 217, 64, 5); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(.04, 'rgba(255,255,255,.8)');
  gradient.addColorStop(.16, 'rgba(255,255,255,.2)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export interface CrystalRenderer {
  render: (angles: Vec, radius: number, size: number) => void;
  dispose: () => void;
}

export function createCrystalRenderer(canvas: HTMLCanvasElement, type: string, result: number, palette: DicePalette): CrystalRenderer | undefined {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' }); }
  catch { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.transmissionResolutionScale = .75;
  const environment = studio(renderer);
  const scene = new THREE.Scene(), labelScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 30); camera.position.z = 5;
  const root = new THREE.Group(); scene.add(root);
  const labelRoot = new THREE.Group(); labelRoot.matrixAutoUpdate = false; labelScene.add(labelRoot);
  const mesh = meshFor(type, .035), landing = mesh.faces[result - 1] ?? mesh.faces[0];
  const align = new THREE.Matrix4().set(...landing.right, 0, ...landing.up, 0, ...landing.normal, 0, 0, 0, 0, 1);
  const rotation = new THREE.Matrix4();
  root.matrixAutoUpdate = false;
  const optics = crystalOptics(type, palette, environment.texture);
  const shell = new THREE.Mesh(geometry(mesh.surfaces), optics);
  root.add(shell);
  const edgeGeometry = new THREE.EdgesGeometry(shell.geometry, 14);
  const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: shade(palette.rim), transparent: true, opacity: .1, blending: THREE.AdditiveBlending }));
  edges.scale.setScalar(1.003); root.add(edges);
  const textures: THREE.Texture[] = [];
  const labels: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; normal: THREE.Vector3 }[] = [];
  for (const [index, face] of mesh.faces.entries()) {
    const texture = labelTexture(index + 1, palette); textures.push(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: .015,
      color: 'white', emissive: shade(palette.number), emissiveMap: texture, emissiveIntensity: .9, roughness: .3, depthWrite: false });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(face.inradius * 1.65, face.inradius * 1.65), material);
    label.position.copy(vector(face.center).multiplyScalar(1.004));
    label.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vector(face.right), vector(face.up), vector(face.normal)));
    labelRoot.add(label); labels.push({ mesh: label, normal: vector(face.normal) });
  }
  const glow = glowTexture(); textures.push(glow);
  const seen = new Set<string>();
  for (const face of mesh.faces) for (const point of face.points) {
    const key = point.join(','); if (seen.has(key)) continue; seen.add(key);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: shade(palette.rim), transparent: true,
      opacity: .52, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.position.copy(vector(point).multiplyScalar(.99)); sprite.scale.setScalar(.19); root.add(sprite);
  }
  scene.add(new THREE.HemisphereLight(0xe9f5ff, 0x030713, .8));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(-3, 5, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(shade(palette.rim), 2); fill.position.set(4, -1, 2); scene.add(fill);
  let lastSize = 0, lost = false;
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; };
  canvas.addEventListener('webglcontextlost', contextLost);
  return {
    render(angles, radius, size) {
      if (lost) return;
      if (size !== lastSize) { renderer.setSize(size, size, false); lastSize = size; }
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(size / (radius * 10))); camera.updateProjectionMatrix();
      rotation.makeRotationFromEuler(new THREE.Euler(...angles, 'ZXY'));
      root.matrix.copy(rotation).multiply(align); labelRoot.matrix.copy(root.matrix);
      optics.uniforms.cameraLocal.value.copy(camera.position).applyMatrix4(root.matrix.clone().invert());
      optics.uniforms.orientation.value.setFromMatrix4(root.matrix);
      for (const label of labels) {
        const facing = label.normal.clone().transformDirection(root.matrix).z;
        label.mesh.material.opacity = .12 + Math.max(0, facing) ** 2 * .88;
      }
      // The studio capture sets an opaque background. Explicitly restore canvas transparency before clearing.
      renderer.setClearColor(0, 0); renderer.autoClear = false; renderer.clear();
      renderer.render(scene, camera); renderer.render(labelScene, camera); renderer.autoClear = true;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', contextLost);
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.LineSegments) {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose());
      } });
      labelScene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
      textures.forEach(texture => texture.dispose()); environment.dispose(); renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  };
}
